import { EngineError, type CapacityCode } from "@ankuaru/schema";
import { createEngine, type Session } from "@ankuaru/engine";
import { seedWorld, serializeSeed } from "@ankuaru/seed";
import { randomUUID } from "node:crypto";

type BindBody = {
  actorId: string;
  capacity: CapacityCode;
  userId?: string;
};

type WorldState = {
  engine: ReturnType<typeof createEngine>;
  seedMeta: ReturnType<typeof seedWorld> | null;
  sessions: Map<string, Session & { displayName?: string }>;
};

const g = globalThis as typeof globalThis & { __ankuaruWorld?: WorldState };

const WORLD_KEY = "__ankuaruWorld_v4";

function world(): WorldState {
  const store = g as unknown as Record<string, WorldState | undefined>;
  let state = store[WORLD_KEY];
  // Recreate if HMR left an old engine instance without newer methods
  if (
    !state ||
    typeof state.engine.lineageTrace !== "function" ||
    typeof state.engine.networkProfile !== "function" ||
    typeof state.engine.allowedIntakeTargets !== "function"
  ) {
    state = {
      engine: createEngine(),
      seedMeta: null,
      sessions: new Map(),
    };
    store[WORLD_KEY] = state;
    delete (g as { __ankuaruWorld?: WorldState }).__ankuaruWorld;
  }
  return state;
}

function getSession(headers: Headers): Session {
  const token = headers.get("x-session-id") ?? "";
  const s = world().sessions.get(token);
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

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function errResponse(err: unknown) {
  const m = mapError(err);
  return json(m.body, m.statusCode);
}

async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

type CmdHandler = (s: Session, body: unknown) => unknown;

const commands: Record<string, CmdHandler> = {
  "origin-lot": (s, body) =>
    world().engine.createOriginLot(s, body as Parameters<ReturnType<typeof createEngine>["createOriginLot"]>[1]),
  "intake-lot": (s, body) =>
    world().engine.createIntakeLot(s, body as Parameters<ReturnType<typeof createEngine>["createIntakeLot"]>[1]),
  send: (s, body) =>
    world().engine.send(s, {
      ...(body as {
        lotId: string;
        toActorId: string;
        senderDeclaredKg: number;
        destinationLocationId?: string;
      }),
      requireShinto: false,
    }),
  receive: (s, body) =>
    world().engine.receive(
      s,
      body as { movementId: string; receiverDeclaredKg: number; contractId?: string },
    ),
  aggregate: (s, body) =>
    world().engine.aggregate(s, body as { parentLotIds: string[] }),
  disaggregate: (s, body) =>
    world().engine.disaggregate(
      s,
      body as { parentLotId: string; childMassesKg: number[] },
    ),
  process: (s, body) =>
    world().engine.process(s, body as Parameters<ReturnType<typeof createEngine>["process"]>[1]),
  "transfer-ownership": (s, body) =>
    world().engine.transferOwnership(
      s,
      body as { lotId: string; newOwnerActorId: string },
    ),
  "terminal-dispose": (s, body) =>
    world().engine.terminalDispose(
      s,
      body as {
        lotId: string;
        reason: "fob_export" | "domestic_disposition" | "destroyed";
        impurityPct?: number;
      },
    ),
  onboard: (s, body) => {
    const b = body as Parameters<ReturnType<typeof createEngine>["onboardActor"]>[1];
    return world().engine.onboardActor(s, { ...b, sponsorActorId: s.actorId });
  },
  correct: (s, body) =>
    world().engine.correct(
      s,
      body as {
        correctsEventId: string;
        correctedPayload: Record<string, unknown>;
        reason: string;
      },
    ),
  evidence: (s, body) =>
    world().engine.uploadEvidence(
      s,
      body as {
        attachedType: string;
        attachedId: string;
        evidenceClass: "self_assessment" | "laboratory" | "official_authority";
        documentType: string;
        factSupported: string;
      },
    ),
  stocktake: (s, body) =>
    world().engine.stocktake(s, body as Parameters<ReturnType<typeof createEngine>["stocktake"]>[1]),
};

/**
 * Dispatch ledger API requests. `path` is after /api, e.g. "health", "v1/roles".
 */
export async function handleApi(req: Request, pathParts: string[]): Promise<Response> {
  const path = pathParts.join("/");
  const method = req.method.toUpperCase();
  const { engine, sessions } = world();
  const url = new URL(req.url);

  try {
    if (path === "health" && method === "GET") {
      return json({ ok: true, service: "ankuaru-api", version: "0.1.0" });
    }

    if (path === "v1/seed" && method === "POST") {
      const w = world();
      w.seedMeta = seedWorld(w.engine);
      w.engine = w.seedMeta.engine;
      const data = serializeSeed(w.seedMeta);
      return json({
        ok: true,
        actors: data.actors.length,
        lots: data.lots.length,
        events: data.events.length,
        preferredTraceLotId: data.preferredTraceLotId,
        integrity: data.integrity,
        siteSummaries: data.siteSummaries,
      });
    }

    if (path === "v1/roles" && method === "GET") {
      const actors = engine.getActors().filter(
        (a) =>
          a.metadata.demoSelectable === "true" ||
          a.metadata.userOnboarded === "true",
      );
      return json(
        actors.map((a) => ({
          actorId: a.actorId,
          actorType: a.actorType,
          displayName: a.displayName,
          legalIdentityRef: a.legalIdentityRef,
          capacities: a.capacities,
        })),
      );
    }

    if (path === "v1/session/bind" && method === "POST") {
      const body = await readBody<BindBody>(req);
      const { actorId, capacity, userId } = body ?? {};
      const actor = engine.getActors().find((a) => a.actorId === actorId);
      if (!actor) return json({ error: "Actor not found" }, 404);
      if (!actor.capacities.includes(capacity)) {
        return json({ error: "Capacity not on actor" }, 400);
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
      return json({
        sessionId,
        actor: {
          actorId: actor.actorId,
          actorType: actor.actorType,
          displayName: actor.displayName,
          capacity,
        },
      });
    }

    if (path === "v1/me" && method === "GET") {
      const s = getSession(req.headers);
      const actor = engine.getActors().find((a) => a.actorId === s.actorId)!;
      return json({ session: s, actor });
    }

    if (path === "v1/inventory" && method === "GET") {
      const s = getSession(req.headers);
      return json({ lots: engine.inventory(s.actorId) });
    }

    if (path === "v1/pending-receipts" && method === "GET") {
      const s = getSession(req.headers);
      return json({ movements: engine.pendingReceipts(s.actorId) });
    }

    if (path === "v1/network" && method === "GET") {
      const s = getSession(req.headers);
      const children = engine.networkTree(s.actorId);
      return json({
        self: {
          ...engine.getActors().find((a) => a.actorId === s.actorId),
          displayLabel: engine.displayNameFor(s.actorId, s.actorId),
          counts: engine.networkCounts(s.actorId),
        },
        children: children.map((c) => ({
          ...c,
          displayLabel: engine.displayNameFor(s.actorId, c.actorId),
          counts: engine.networkCounts(c.actorId),
          children: engine.networkTree(c.actorId).map((gc) => ({
            ...gc,
            displayLabel: engine.displayNameFor(s.actorId, gc.actorId),
            counts: engine.networkCounts(gc.actorId),
          })),
        })),
      });
    }

    if (path.startsWith("v1/network/") && method === "GET") {
      const s = getSession(req.headers);
      const subjectId = path.slice("v1/network/".length);
      if (!subjectId || subjectId.includes("/")) {
        return json({ error: "Not found" }, 404);
      }
      const profile = engine.networkProfile(s.actorId, subjectId);
      if (!profile) return json({ error: "Actor not found or not in your network" }, 404);
      return json(profile);
    }

    if (path === "v1/inspector/lots" && method === "GET") {
      const s = getSession(req.headers);
      return json({ lots: engine.visibleLots(s.actorId) });
    }

    if (path === "v1/inspector/lineage" && method === "GET") {
      const s = getSession(req.headers);
      const lotId = url.searchParams.get("lotId") ?? "";
      return json(engine.lineageTrace(lotId, s.actorId));
    }

    if (path === "v1/inspector/integrity" && method === "GET") {
      getSession(req.headers);
      return json(engine.integrityChecks());
    }

    if (path === "v1/send-targets" && method === "GET") {
      const s = getSession(req.headers);
      return json({
        targets: engine.allowedSendTargets(s.actorId).map((t) => ({
          actorId: t.actorId,
          displayName: engine.displayNameFor(s.actorId, t.actorId),
          actorType: t.actorType,
        })),
      });
    }

    if (path === "v1/intake-targets" && method === "GET") {
      const s = getSession(req.headers);
      return json({
        targets: engine.allowedIntakeTargets(s.actorId).map((t) => ({
          actorId: t.actorId,
          displayName: engine.displayNameFor(s.actorId, t.actorId),
          actorType: t.actorType,
        })),
      });
    }

    if (path === "v1/inspector/activity" && method === "GET") {
      const s = getSession(req.headers);
      const events = engine.visibleEvents(s.actorId).slice(-100).reverse();
      return json({
        events: events.map((e) => ({
          eventId: e.eventId,
          eventType: e.eventType,
          eventTime: e.eventTimeActual || e.serverCommitTime,
          actorId: e.actorId,
          actorLabel: e.actorId
            ? engine.displayNameFor(s.actorId, e.actorId)
            : "—",
          affectedObjectIds: e.affectedObjectIds,
        })),
      });
    }

    if (path === "v1/lot-detail" && method === "GET") {
      const s = getSession(req.headers);
      const lotId = url.searchParams.get("lotId") ?? "";
      const lot = engine.getLots().find((l) => l.lotId === lotId);
      if (!lot) return json({ error: "Lot not found" }, 404);
      return json({
        lot,
        ownerLabel: engine.displayNameFor(s.actorId, lot.ownerActorId),
        custodianLabel: engine.displayNameFor(s.actorId, lot.custodianActorId),
        priorSupplier: engine.priorSupplierLabel(lotId, s.actorId),
      });
    }

    if (path.startsWith("v1/commands/") && method === "POST") {
      const name = path.slice("v1/commands/".length);
      if (name === "ai-write") {
        try {
          engine.rejectAiWrite();
        } catch (err) {
          return errResponse(err);
        }
        return json({ ok: true });
      }
      const handler = commands[name];
      if (!handler) return json({ error: "Not found" }, 404);
      const s = getSession(req.headers);
      const body = await readBody(req);
      const result = handler(s, body);
      return json({ ok: true, result });
    }

    if (path === "v1/notifications" && method === "GET") {
      const s = getSession(req.headers);
      return json({ notifications: engine.getNotifications(s.userId) });
    }

    if (path === "v1/dashboard" && method === "GET") {
      const s = getSession(req.headers);
      return json({
        overdueReceipts: engine.pendingReceipts(s.actorId).filter((m) => m.state === "receipt_overdue"),
        pendingReceipts: engine.pendingReceipts(s.actorId),
        openIssues: engine.getIssues().filter((i) => i.lifecycle !== "RESOLVED"),
        stockByState: {
          cherry: engine.stockBalance(s.actorId, "cherry"),
          green_washed: engine.stockBalance(s.actorId, "green_washed"),
          green_natural: engine.stockBalance(s.actorId, "green_natural"),
        },
      });
    }

    if (path === "v1/reports" && method === "POST") {
      getSession(req.headers);
      const body = await readBody<{ lotId: string }>(req);
      const report = engine.generateReport(body.lotId);
      return json({ report, fingerprintOk: engine.verifyReportFingerprint(report.reportId) });
    }

    if (path === "v1/ussd" && method === "POST") {
      const body = await readBody<{
        actorId: string;
        capacity: CapacityCode;
        action: "receive";
        movementId: string;
        receiverDeclaredKg: number;
      }>(req);
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
        return json({ ok: true, result, channel_detail: "ussd" });
      }
      return json({ error: "Unsupported USSD action" }, 400);
    }

    if (path === "v1/openapi.json" && method === "GET") {
      return json({
        openapi: "3.0.3",
        info: { title: "Ankuaru Simulator API", version: "1.0.0" },
        paths: {
          "/v1/commands/send": { post: { summary: "Dispatch lot (same auth as UI)" } },
          "/v1/commands/receive": { post: { summary: "Confirm receipt" } },
          "/v1/ussd": { post: { summary: "USSD channel adapter" } },
        },
      });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return errResponse(err);
  }
}
