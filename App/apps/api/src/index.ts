import Fastify from "fastify";
import cors from "@fastify/cors";
import { EngineError, type CapacityCode } from "@ankuaru/schema";
import { createEngine, type Session } from "@ankuaru/engine";
import { seedWorld, serializeSeed } from "@ankuaru/seed";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 3001);
const WEB_ORIGINS = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EVIDENCE_DIR = resolve(process.env.EVIDENCE_DIR ?? "./data/evidence");
mkdirSync(EVIDENCE_DIR, { recursive: true });
mkdirSync(resolve(process.env.REPORTS_DIR ?? "./data/reports"), { recursive: true });

/** In-process shared world (CORE: one shared ledger for all roles) */
let engine = createEngine();
let seedMeta: ReturnType<typeof seedWorld> | null = null;

type BindBody = {
  actorId: string;
  capacity: CapacityCode;
  userId?: string;
};

const sessions = new Map<string, Session & { displayName?: string }>();

function getSession(req: { headers: Record<string, string | string[] | undefined> }): Session {
  const token = String(req.headers["x-session-id"] ?? "");
  const s = sessions.get(token);
  if (!s) {
    const err = new Error("Unauthorized: bind a role first via POST /v1/session/bind");
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
  return s;
}

function mapError(err: unknown) {
  if (err instanceof EngineError) {
    return {
      statusCode: 400,
      body: {
        error: err.message,
        invariantId: err.invariantId,
        intervention: err.intervention,
        authorityTag: err.authorityTag,
      },
    };
  }
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  return {
    statusCode,
    body: { error: err instanceof Error ? err.message : "Unknown error" },
  };
}

async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: WEB_ORIGINS.length === 1 ? WEB_ORIGINS[0] : WEB_ORIGINS,
    credentials: true,
  });

  app.get("/health", async () => ({ ok: true, service: "ankuaru-api", version: "0.1.0" }));

  app.post<{ Body: { force?: boolean } }>("/v1/seed", async (req, reply) => {
    try {
      seedMeta = seedWorld(engine);
      engine = seedMeta.engine;
      const data = serializeSeed(seedMeta);
      return {
        ok: true,
        actors: data.actors.length,
        lots: data.lots.length,
        events: data.events.length,
        preferredTraceLotId: data.preferredTraceLotId,
        integrity: data.integrity,
        siteSummaries: data.siteSummaries,
      };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/roles", async () => {
    const actors = engine.getActors().filter(
      (a) =>
        a.metadata.demoSelectable === "true" ||
        a.metadata.userOnboarded === "true",
    );
    return actors.map((a) => ({
      actorId: a.actorId,
      actorType: a.actorType,
      displayName: a.displayName,
      legalIdentityRef: a.legalIdentityRef,
      capacities: a.capacities,
    }));
  });

  app.post<{ Body: BindBody }>("/v1/session/bind", async (req, reply) => {
    const { actorId, capacity, userId } = req.body ?? {};
    const actor = engine.getActors().find((a) => a.actorId === actorId);
    if (!actor) return reply.code(404).send({ error: "Actor not found" });
    if (!actor.capacities.includes(capacity)) {
      return reply.code(400).send({ error: "Capacity not on actor" });
    }
    let uid = userId;
    if (!uid) {
      const u = engine.createUser({ displayName: `${actor.displayName} Operator` });
      engine.bindUserToActor(u.userId, actorId);
      uid = u.userId;
    }
    const sessionId = randomUUID();
    const session: Session = {
      userId: uid,
      actorId,
      capacity,
      sourceChannel: "web",
    };
    sessions.set(sessionId, { ...session, displayName: actor.displayName });
    return {
      sessionId,
      actor: {
        actorId: actor.actorId,
        actorType: actor.actorType,
        displayName: actor.displayName,
        capacity,
      },
    };
  });

  app.get("/v1/me", async (req, reply) => {
    try {
      const s = getSession(req);
      const actor = engine.getActors().find((a) => a.actorId === s.actorId)!;
      return { session: s, actor };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/inventory", async (req, reply) => {
    try {
      const s = getSession(req);
      return { lots: engine.inventory(s.actorId) };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/pending-receipts", async (req, reply) => {
    try {
      const s = getSession(req);
      return { movements: engine.pendingReceipts(s.actorId) };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/network", async (req, reply) => {
    try {
      const s = getSession(req);
      const children = engine.networkTree(s.actorId);
      return {
        self: engine.getActors().find((a) => a.actorId === s.actorId),
        children: children.map((c) => ({
          ...c,
          displayLabel: engine.displayNameFor(s.actorId, c.actorId),
          children: engine.networkTree(c.actorId).map((gc) => ({
            ...gc,
            displayLabel: engine.displayNameFor(s.actorId, gc.actorId),
          })),
        })),
      };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/inspector/lots", async (req, reply) => {
    try {
      const s = getSession(req);
      return { lots: engine.visibleLots(s.actorId) };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get<{ Querystring: { lotId: string } }>("/v1/inspector/lineage", async (req, reply) => {
    try {
      getSession(req);
      const lotId = req.query.lotId;
      return {
        origins: engine.traceBackward(lotId),
        forward: engine.forwardOneHop(lotId),
        edges: engine.getLineage().filter(
          (e) => e.parentLotId === lotId || e.childLotId === lotId,
        ),
        lot: engine.getLots().find((l) => l.lotId === lotId),
      };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/inspector/integrity", async (req, reply) => {
    try {
      getSession(req);
      return engine.integrityChecks();
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/send-targets", async (req, reply) => {
    try {
      const s = getSession(req);
      return { targets: engine.allowedSendTargets(s.actorId) };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  // Commands
  const command = <T>(
    path: string,
    handler: (s: Session, body: T) => unknown,
  ) => {
    app.post<{ Body: T }>(path, async (req, reply) => {
      try {
        const s = getSession(req);
        const result = handler(s, req.body as T);
        return { ok: true, result };
      } catch (err) {
        const m = mapError(err);
        return reply.code(m.statusCode).send(m.body);
      }
    });
  };

  command("/v1/commands/origin-lot", (s, body: {
    massKg: number;
    processingState?: string;
    processingRoute?: string;
    cropYear?: string;
    locationId?: string;
    originalUnit?: string;
    originalQuantity?: number;
    conversionBasis?: string;
  }) =>
    engine.createOriginLot(s, body as Parameters<typeof engine.createOriginLot>[1]),
  );

  command("/v1/commands/intake-lot", (s, body: {
    supplierActorId: string;
    massKg: number;
    processingState?: string;
  }) => engine.createIntakeLot(s, body as Parameters<typeof engine.createIntakeLot>[1]));

  command("/v1/commands/send", (s, body: {
    lotId: string;
    toActorId: string;
    senderDeclaredKg: number;
    destinationLocationId?: string;
  }) =>
    engine.send(s, { ...body, requireShinto: false }),
  );

  command("/v1/commands/receive", (s, body: {
    movementId: string;
    receiverDeclaredKg: number;
    contractId?: string;
  }) => engine.receive(s, body));

  command("/v1/commands/aggregate", (s, body: { parentLotIds: string[] }) =>
    engine.aggregate(s, body),
  );

  command("/v1/commands/disaggregate", (s, body: {
    parentLotId: string;
    childMassesKg: number[];
  }) => engine.disaggregate(s, body));

  command("/v1/commands/process", (s, body: {
    inputLotIds: string[];
    outputState: string;
    rejectKg: number;
    lossKg: number;
    lossCategory?: string;
    moisturePct?: number;
    blendingPermitRef?: string;
    byProducts?: Array<{ kind: string; massKg: number }>;
  }) =>
    engine.process(s, body as Parameters<typeof engine.process>[1]),
  );

  command("/v1/commands/transfer-ownership", (s, body: {
    lotId: string;
    newOwnerActorId: string;
  }) => engine.transferOwnership(s, body));

  command("/v1/commands/terminal-dispose", (s, body: {
    lotId: string;
    reason: "fob_export" | "domestic_disposition" | "destroyed";
    impurityPct?: number;
  }) => engine.terminalDispose(s, body));

  command("/v1/commands/onboard", (s, body: {
    actorType: string;
    displayName: string;
    legalIdentityRef: string;
    metadata?: Record<string, string>;
    facility?: { capabilities: string[] };
  }) =>
    engine.onboardActor(s, {
      ...(body as Parameters<typeof engine.onboardActor>[1]),
      sponsorActorId: s.actorId,
    }),
  );

  command("/v1/commands/correct", (s, body: {
    correctsEventId: string;
    correctedPayload: Record<string, unknown>;
    reason: string;
  }) => engine.correct(s, body));

  command("/v1/commands/evidence", (s, body: {
    attachedType: string;
    attachedId: string;
    evidenceClass: "self_assessment" | "laboratory" | "official_authority";
    documentType: string;
    factSupported: string;
  }) => engine.uploadEvidence(s, body));

  command("/v1/commands/stocktake", (s, body: {
    facilityActorId: string;
    coffeeState: string;
    physicalKg: number;
  }) =>
    engine.stocktake(s, body as Parameters<typeof engine.stocktake>[1]),
  );

  app.post("/v1/commands/ai-write", async (_req, reply) => {
    try {
      engine.rejectAiWrite();
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/notifications", async (req, reply) => {
    try {
      const s = getSession(req);
      return { notifications: engine.getNotifications(s.userId) };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.get("/v1/dashboard", async (req, reply) => {
    try {
      const s = getSession(req);
      return {
        overdueReceipts: engine.pendingReceipts(s.actorId).filter((m) => m.state === "receipt_overdue"),
        pendingReceipts: engine.pendingReceipts(s.actorId),
        openIssues: engine.getIssues().filter((i) => i.lifecycle !== "RESOLVED"),
        stockByState: {
          cherry: engine.stockBalance(s.actorId, "cherry"),
          green_washed: engine.stockBalance(s.actorId, "green_washed"),
          green_natural: engine.stockBalance(s.actorId, "green_natural"),
        },
      };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  app.post<{ Body: { lotId: string } }>("/v1/reports", async (req, reply) => {
    try {
      getSession(req);
      const report = engine.generateReport(req.body.lotId);
      return { report, fingerprintOk: engine.verifyReportFingerprint(report.reportId) };
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  // USSD adapter — same envelope via api channel + channel_detail (escalation temp)
  app.post<{
    Body: {
      actorId: string;
      capacity: CapacityCode;
      action: "receive";
      movementId: string;
      receiverDeclaredKg: number;
    };
  }>("/v1/ussd", async (req, reply) => {
    try {
      const body = req.body;
      const session: Session = {
        userId: randomUUID(),
        actorId: body.actorId,
        capacity: body.capacity,
        sourceChannel: "api",
        channelDetail: "ussd",
      };
      if (body.action === "receive") {
        const result = engine.receive(session, {
          movementId: body.movementId,
          receiverDeclaredKg: body.receiverDeclaredKg,
        });
        return { ok: true, result, channel_detail: "ussd" };
      }
      return reply.code(400).send({ error: "Unsupported USSD action" });
    } catch (err) {
      const m = mapError(err);
      return reply.code(m.statusCode).send(m.body);
    }
  });

  // OpenAPI-ish contract stub (Module 14)
  app.get("/v1/openapi.json", async () => ({
    openapi: "3.0.3",
    info: { title: "Ankuaru Simulator API", version: "1.0.0" },
    paths: {
      "/v1/commands/send": { post: { summary: "Dispatch lot (same auth as UI)" } },
      "/v1/commands/receive": { post: { summary: "Confirm receipt" } },
      "/v1/ussd": { post: { summary: "USSD channel adapter" } },
    },
  }));

  return app;
}

const app = await buildServer();
await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`Ankuaru API on http://localhost:${PORT}`);
