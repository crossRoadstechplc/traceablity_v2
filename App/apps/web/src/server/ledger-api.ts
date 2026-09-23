import { EngineError, type CapacityCode } from "@ankuaru/schema";
import { createEngine, type Session } from "@ankuaru/engine";
import {
  dbHasSimulatorData,
  ensurePrismaEnginePath,
  getPrisma,
  getSimulatorSession,
  hydrateEngine,
  isDatabaseConfigured,
  loadAllSimulatorSessions,
  syncWorldToDb,
  upsertSimulatorSession,
  upsertUserWithMembership,
} from "@ankuaru/db";
import { randomUUID } from "node:crypto";

ensurePrismaEnginePath();

type BindBody = {
  actorId: string;
  capacity: CapacityCode;
  userId?: string;
};

type WorldState = {
  engine: ReturnType<typeof createEngine>;
  sessions: Map<string, Session & { displayName?: string }>;
  preferredTraceLotId?: string;
  /** Index into engine.getEvents() already written to DB. */
  syncedEventIndex: number;
  ready: boolean;
  hydratePromise: Promise<void> | null;
};

const g = globalThis as typeof globalThis & { __ankuaruWorld?: WorldState };

const WORLD_KEY = "__ankuaruWorld_v9";

function world(): WorldState {
  const store = g as unknown as Record<string, WorldState | undefined>;
  let state = store[WORLD_KEY];
  if (
    !state ||
    typeof state.engine.lineageTrace !== "function" ||
    typeof state.engine.networkProfile !== "function" ||
    typeof state.engine.allowedIntakeTargets !== "function" ||
    typeof state.engine.replaceWorld !== "function"
  ) {
    state = {
      engine: createEngine(),
      sessions: new Map(),
      preferredTraceLotId: undefined,
      syncedEventIndex: 0,
      ready: false,
      hydratePromise: null,
    };
    store[WORLD_KEY] = state;
    delete (g as { __ankuaruWorld?: WorldState }).__ankuaruWorld;
  }
  return state;
}

function dbUnavailable(message = "database not configured"): Response {
  return Response.json(
    {
      error: message,
      hint: "Set DATABASE_URL and DIRECT_URL on the server (Vercel project env).",
    },
    { status: 503 },
  );
}

async function ensureWorld(): Promise<WorldState> {
  const w = world();
  if (w.ready) return w;
  if (w.hydratePromise) {
    await w.hydratePromise;
    return w;
  }

  w.hydratePromise = (async () => {
    if (!isDatabaseConfigured()) {
      w.ready = true;
      return;
    }
    // Force Prisma client + env resolution before queries
    getPrisma();
    try {
      if ((await dbHasSimulatorData()) && w.engine.getActors().length === 0) {
        const h = await hydrateEngine();
        w.engine = h.engine;
        w.preferredTraceLotId = h.preferredTraceLotId;
        w.syncedEventIndex = h.engine.getEvents().length;
      } else if (
        w.syncedEventIndex === 0 &&
        w.engine.getEvents().length > 0
      ) {
        // Already hydrated in this process; don't treat all events as "new"
        w.syncedEventIndex = w.engine.getEvents().length;
      }
      const sessions = await loadAllSimulatorSessions();
      for (const [id, s] of sessions) {
        if (!w.sessions.has(id)) w.sessions.set(id, s);
      }
      w.ready = true;
    } catch (e) {
      console.error("[ensureWorld] hydrate failed:", e);
      throw e;
    } finally {
      w.hydratePromise = null;
    }
  })();

  await w.hydratePromise;
  return w;
}

async function persistWorld(): Promise<void> {
  if (!isDatabaseConfigured()) {
    const err = new Error("database not configured: set DATABASE_URL and DIRECT_URL");
    (err as Error & { statusCode: number }).statusCode = 503;
    throw err;
  }
  const w = world();
  const result = await syncWorldToDb(w.engine, {
    preferredTraceLotId: w.preferredTraceLotId,
    sinceEventIndex: w.syncedEventIndex,
  });
  w.syncedEventIndex = result.nextEventIndex;
}

async function getSession(headers: Headers): Promise<Session> {
  const token = headers.get("x-session-id") ?? "";
  const w = world();
  let s = w.sessions.get(token);
  if (!s && token) {
    const fromDb = await getSimulatorSession(token);
    if (fromDb) {
      w.sessions.set(token, fromDb);
      s = fromDb;
    }
  }
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
  const msg = err instanceof Error ? err.message : "Unknown error";
  if (
    msg.includes("Query Engine") ||
    msg.includes("Prisma Client could not locate") ||
    msg.includes("Can't reach database server") ||
    (err as { name?: string }).name === "PrismaClientInitializationError" ||
    (err as { code?: string }).code === "P1001"
  ) {
    return {
      statusCode: 503,
      body: {
        error: "database temporarily unreachable",
        hint: "Supabase connection failed (P1001). Retry in a few seconds; confirm the project is not paused and DIRECT_URL works (`npx tsx scripts/check-db.ts`).",
      },
    };
  }
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  return {
    statusCode,
    body: { error: msg },
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

const MUTATING_COMMANDS = new Set(Object.keys(commands));

/**
 * Dispatch ledger API requests. `path` is after /api, e.g. "health", "v1/roles".
 */
export async function handleApi(req: Request, pathParts: string[]): Promise<Response> {
  const path = pathParts.join("/");
  const method = req.method.toUpperCase();
  const url = new URL(req.url);

  try {
    if (path === "health" && method === "GET") {
      return json({
        ok: true,
        service: "ankuaru-api",
        version: "0.1.0",
        database: isDatabaseConfigured(),
      });
    }

    // Mutating / world routes need DB when persistence is expected
    if (path !== "health" && path !== "v1/openapi.json") {
      try {
        await ensureWorld();
      } catch (e) {
        if (!isDatabaseConfigured()) return dbUnavailable();
        return errResponse(e);
      }
    }

    const { engine, sessions } = world();

    if (path === "v1/seed" && method === "POST") {
      // Seeding is CLI-only (`npm run db:seed`). Do not wipe the live DB from the UI.
      return json(
        {
          error: "Seed from the UI is disabled",
          hint: "Run `npm run db:seed` from App/ when you want to reload the demo world.",
        },
        403,
      );
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

      // Repair empty capacities (hydrate fallback + DB repair)
      if (actor.capacities.length === 0) {
        const byType: Record<string, CapacityCode> = {
          farmer: "Farmer",
          collector: "Collector",
          akrabi: "Aggregator",
          exporter: "Exporter",
        };
        const inferred = byType[actor.actorType];
        if (inferred) {
          actor.capacities = [inferred];
          engine.addCapacity(actorId, inferred);
        }
      }

      const bindCapacity =
        capacity && actor.capacities.includes(capacity)
          ? capacity
          : actor.capacities[0];
      if (!bindCapacity) {
        return json(
          {
            error: "Capacity not on actor",
            hint: "Actor has no capacities in DB — re-run npm run db:seed",
            actorType: actor.actorType,
            capacities: actor.capacities,
          },
          400,
        );
      }
      let uid = userId;
      if (!uid) {
        const u = engine.createUser({ displayName: `${actor.displayName} Operator` });
        engine.bindUserToActor(u.userId, actorId);
        uid = u.userId;
        await upsertUserWithMembership(u);
      }
      const sessionId = randomUUID();
      const session: Session = {
        userId: uid,
        actorId,
        capacity: bindCapacity,
        sourceChannel: "web",
      };
      sessions.set(sessionId, { ...session, displayName: actor.displayName });
      await upsertSimulatorSession(sessionId, {
        ...session,
        displayName: actor.displayName,
      });
      return json({
        sessionId,
        actor: {
          actorId: actor.actorId,
          actorType: actor.actorType,
          displayName: actor.displayName,
          capacity: bindCapacity,
        },
      });
    }

    if (path === "v1/me" && method === "GET") {
      const s = await getSession(req.headers);
      const actor = engine.getActors().find((a) => a.actorId === s.actorId)!;
      return json({ session: s, actor });
    }

    if (path === "v1/inventory" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ lots: engine.inventory(s.actorId) });
    }

    if (path === "v1/pending-receipts" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ movements: engine.pendingReceipts(s.actorId) });
    }

    if (path === "v1/network" && method === "GET") {
      const s = await getSession(req.headers);
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
      const s = await getSession(req.headers);
      const subjectId = path.slice("v1/network/".length);
      if (!subjectId || subjectId.includes("/")) {
        return json({ error: "Not found" }, 404);
      }
      const profile = engine.networkProfile(s.actorId, subjectId);
      if (!profile) return json({ error: "Actor not found or not in your network" }, 404);
      return json(profile);
    }

    if (path === "v1/inspector/lots" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ lots: engine.visibleLots(s.actorId) });
    }

    if (path === "v1/inspector/lineage" && method === "GET") {
      const s = await getSession(req.headers);
      const lotId = url.searchParams.get("lotId") ?? "";
      return json(engine.lineageTrace(lotId, s.actorId));
    }

    if (path === "v1/inspector/integrity" && method === "GET") {
      await getSession(req.headers);
      return json(engine.integrityChecks());
    }

    if (path === "v1/send-targets" && method === "GET") {
      const s = await getSession(req.headers);
      return json({
        targets: engine.allowedSendTargets(s.actorId).map((t) => ({
          actorId: t.actorId,
          displayName: engine.displayNameFor(s.actorId, t.actorId),
          actorType: t.actorType,
        })),
      });
    }

    if (path === "v1/intake-targets" && method === "GET") {
      const s = await getSession(req.headers);
      return json({
        targets: engine.allowedIntakeTargets(s.actorId).map((t) => ({
          actorId: t.actorId,
          displayName: engine.displayNameFor(s.actorId, t.actorId),
          actorType: t.actorType,
        })),
      });
    }

    if (path === "v1/inspector/activity" && method === "GET") {
      const s = await getSession(req.headers);
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
      const s = await getSession(req.headers);
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
      if (!isDatabaseConfigured()) return dbUnavailable();
      const s = await getSession(req.headers);
      const body = await readBody(req);
      const result = handler(s, body);
      if (MUTATING_COMMANDS.has(name)) {
        await persistWorld();
      }
      return json({ ok: true, result });
    }

    if (path === "v1/notifications" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ notifications: engine.getNotifications(s.userId) });
    }

    if (path === "v1/dashboard" && method === "GET") {
      const s = await getSession(req.headers);
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
      await getSession(req.headers);
      if (!isDatabaseConfigured()) return dbUnavailable();
      const body = await readBody<{ lotId: string }>(req);
      const report = engine.generateReport(body.lotId);
      await persistWorld();
      return json({ report, fingerprintOk: engine.verifyReportFingerprint(report.reportId) });
    }

    if (path === "v1/ussd" && method === "POST") {
      if (!isDatabaseConfigured()) return dbUnavailable();
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
        await persistWorld();
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
