import { EngineError, type CapacityCode } from "@ankuaru/schema";
import { createEngine, type LotRecord, type Session } from "@ankuaru/engine";
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

type Engine = ReturnType<typeof createEngine>;
type Arg<K extends keyof Engine> = Engine[K] extends (s: Session, input: infer I, ...rest: never[]) => unknown ? I : never;

type BindBody = {
  actorId: string;
  capacity: CapacityCode;
  userId?: string;
};

type StoredSession = Session & { displayName?: string };

type WorldState = {
  engine: Engine;
  sessions: Map<string, StoredSession>;
  preferredTraceLotId?: string;
  /** Index into engine.getEvents() already written to DB. */
  syncedEventIndex: number;
  lastSweepAt: number;
  ready: boolean;
  hydratePromise: Promise<void> | null;
};

const g = globalThis as typeof globalThis & { __ankuaruWorld?: WorldState };

const WORLD_KEY = "__ankuaruWorld_v12";
const INTEGRATION_PREFIX = "[integration] ";
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function world(): WorldState {
  const store = g as unknown as Record<string, WorldState | undefined>;
  let state = store[WORLD_KEY];
  if (
    !state ||
    typeof state.engine.lineageTrace !== "function" ||
    typeof state.engine.networkProfile !== "function" ||
    typeof state.engine.allowedTransferTargets !== "function" ||
    typeof state.engine.rebuildModuleProjections !== "function" ||
    typeof state.engine.verifyChain !== "function" ||
    typeof state.engine.lotIssues !== "function" ||
    typeof state.engine.sweep !== "function"
  ) {
    state = {
      engine: createEngine(),
      sessions: new Map(),
      preferredTraceLotId: undefined,
      syncedEventIndex: 0,
      lastSweepAt: 0,
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
      hint: "Set DATABASE_URL and DIRECT_URL in Vercel → Project Settings → Environment Variables (Production + Preview), then Redeploy. Local App/.env is not uploaded to Vercel.",
      vercel: process.env.VERCEL === "1",
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasDirectUrl: Boolean(process.env.DIRECT_URL),
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
      const err = new Error(
        "database not configured: set DATABASE_URL and DIRECT_URL in Vercel Project → Settings → Environment Variables (Production), then redeploy",
      );
      (err as Error & { statusCode: number }).statusCode = 503;
      throw err;
    }
    getPrisma();
    try {
      if ((await dbHasSimulatorData()) && w.engine.getActors().length === 0) {
        const h = await hydrateEngine();
        w.engine = h.engine;
        w.preferredTraceLotId = h.preferredTraceLotId;
        w.syncedEventIndex = h.engine.getEvents().length;
      } else if (w.syncedEventIndex === 0 && w.engine.getEvents().length > 0) {
        w.syncedEventIndex = w.engine.getEvents().length;
      }
      const sessions = await loadAllSimulatorSessions();
      for (const [id, s] of sessions) {
        if (!w.sessions.has(id)) w.sessions.set(id, withStoredKind(s));
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
  if (w.engine.getEvents().length === w.syncedEventIndex) return;
  const result = await syncWorldToDb(w.engine, {
    preferredTraceLotId: w.preferredTraceLotId,
    sinceEventIndex: w.syncedEventIndex,
  });
  w.syncedEventIndex = result.nextEventIndex;
}

/** Overdue receipts, quarantine escalation, credential expiry (Modules 03/09/11/13). */
async function maybeSweep(): Promise<void> {
  const w = world();
  if (Date.now() - w.lastSweepAt < SWEEP_INTERVAL_MS) return;
  w.lastSweepAt = Date.now();
  const r = w.engine.sweep();
  if (r.overdue || r.escalated || r.credentialNotices) await persistWorld();
}

function withStoredKind(s: StoredSession): StoredSession {
  if (s.displayName?.startsWith(INTEGRATION_PREFIX)) {
    return { ...s, agentKind: "integration", sourceChannel: "api" };
  }
  return s;
}

function httpError(message: string, statusCode: number): Error {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
}

async function baseSession(headers: Headers): Promise<StoredSession> {
  const token = headers.get("x-session-id") ?? "";
  const w = world();
  let s = w.sessions.get(token);
  if (!s && token) {
    const fromDb = await getSimulatorSession(token);
    if (fromDb) {
      s = withStoredKind(fromDb);
      w.sessions.set(token, s);
    }
  }
  if (!s) throw httpError("Unauthorized: bind a role first via POST /v1/session/bind", 401);
  return s;
}

const SOURCE_CHANNELS = new Set(["web", "mobile_online", "mobile_offline_sync", "api", "retrospective"]);

/**
 * Per-request session: base bound session plus request metadata.
 * - x-source-channel / x-event-time-actual: offline capture (Module 13 T1/T2)
 * - x-assisted-for-actor: collector entering data for a farmer they sponsor (Module 13 T3)
 * - x-client-kind: "ai_model" callers are rejected at the write path (Module 15 T4)
 */
async function getSession(headers: Headers): Promise<Session> {
  const base = await baseSession(headers);
  const s: Session = { ...base };
  const channel = headers.get("x-source-channel");
  if (channel && SOURCE_CHANNELS.has(channel)) s.sourceChannel = channel as Session["sourceChannel"];
  const actual = headers.get("x-event-time-actual");
  if (actual && !Number.isNaN(Date.parse(actual))) s.eventTimeActual = actual;
  const kind = headers.get("x-client-kind");
  if (kind === "ai_model" || kind === "integration") s.agentKind = kind;
  const assistedFor = headers.get("x-assisted-for-actor");
  if (assistedFor) {
    const target = world().engine.getActors().find((a) => a.actorId === assistedFor);
    if (!target) throw httpError("Assisted actor not found", 404);
    s.assistedByActorId = base.actorId;
    s.actorId = target.actorId;
    s.capacity = target.capacities[0] ?? s.capacity;
  }
  return s;
}

function mapError(err: unknown) {
  if (err instanceof EngineError) {
    return {
      statusCode: err.invariantId === "AUTH-CAPACITY" || err.invariantId === "AI-WRITE-BAN" ? 403 : 400,
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
  return { statusCode, body: { error: msg } };
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

type CmdHandler = (s: Session, body: any) => unknown;

const eng = () => world().engine;

const commands: Record<string, CmdHandler> = {
  // CORE §7 lot operations
  "origin-lot": (s, b: Arg<"createOriginLot">) => eng().createOriginLot(s, b),
  "intake-lot": (s, b: Arg<"createIntakeLot">) => eng().createIntakeLot(s, b),
  send: (s, b: Arg<"send">) => eng().send(s, b),
  receive: (s, b: Arg<"receive">) => eng().receive(s, b),
  aggregate: (s, b: Arg<"aggregate">) => eng().aggregate(s, b),
  disaggregate: (s, b: Arg<"disaggregate">) => eng().disaggregate(s, b),
  process: (s, b: Arg<"process">) => eng().process(s, b),
  "transfer-ownership": (s, b: Arg<"transferOwnership">) => eng().transferOwnership(s, b),
  "terminal-dispose": (s, b: Arg<"terminalDispose">) => eng().terminalDispose(s, b),
  onboard: (s, b: Arg<"onboardActor">) => eng().onboardActor(s, { ...b, sponsorActorId: s.actorId }),
  correct: (s, b: Arg<"correct">) => eng().correct(s, b),
  "resolve-discrepancy": (s, b: Arg<"resolveDiscrepancy">) => eng().resolveDiscrepancy(s, b),
  // Module 03/05 contracts & inventory
  contract: (s, b: Arg<"registerContract">) => eng().registerContract(s, b),
  stocktake: (s, b: Arg<"stocktake">) => eng().stocktake(s, b),
  "stock-adjustment": (s, b: Arg<"recordStockAdjustment">) => eng().recordStockAdjustment(s, b),
  // Module 06 farms & geometry
  farm: (s, b: Arg<"createFarm">) => eng().createFarm(s, b),
  "farm-unit": (s, b: Arg<"createFarmUnit">) => eng().createFarmUnit(s, b),
  geometry: (s, b: Arg<"addGeometryVersion">) => eng().addGeometryVersion(s, b),
  overlay: (s, b: Arg<"recordOverlay">) => eng().recordOverlay(s, b),
  // Module 07 evidence
  evidence: (s, b: Arg<"uploadEvidence">) => eng().uploadEvidence(s, b),
  "evidence-verify": (s, b: { evidenceId: string; authority?: string }) =>
    eng().verifyEvidence(s, b.evidenceId, { authority: b.authority }),
  "evidence-revoke": (s, b: { evidenceId: string; effectiveDate: string; reason?: string }) =>
    eng().revokeEvidence(s, b.evidenceId, b.effectiveDate, b.reason),
  // Module 08 compliance
  "compliance-assess": (s, b: Arg<"assessLotCompliance">) => eng().assessLotCompliance(s, b),
  "compliance-submit": (s, b: Arg<"submitCompliance">) => eng().submitCompliance(s, b),
  "compliance-outcome": (s, b: Arg<"recordSubmissionOutcome">) => eng().recordSubmissionOutcome(s, b),
  "scheme-claim": (s, b: Arg<"claimSchemeVolume">) => eng().claimSchemeVolume(s, b),
  // Module 09 issues & obligations
  issue: (s, b: Arg<"raiseIssue">) => eng().raiseIssue(s, b),
  "grading-dispute": (s, b: Arg<"raiseGradingDispute">) => eng().raiseGradingDispute(s, b),
  "issue-transition": (s, b: Arg<"transitionIssue">) => eng().transitionIssue(s, b),
  "obligation-handover": (s, b: Arg<"handoverObligation">) => eng().handoverObligation(s, b),
  "obligation-close": (s, b: Arg<"closeObligation">) => eng().closeObligation(s, b),
  quarantine: (s, b: Arg<"quarantineConflict">) => eng().quarantineConflict(s, b),
  "quarantine-resolve": (s, b: Arg<"resolveQuarantine">) => eng().resolveQuarantine(s, b),
  // Module 12 reports
  report: (s, b: { lotId: string }) => {
    const report = eng().generateReport(s, b.lotId);
    return { report, fingerprintOk: eng().verifyReportFingerprint(report.reportId) };
  },
  "audit-package": (s, b: { lotId: string }) => eng().auditPackage(s, b.lotId),
  // Modules 01/10/15/16 governance
  credential: (s, b: Arg<"issueCredential">) => eng().issueCredential(s, b),
  sanction: (s, b: Arg<"recordSanction">) => eng().recordSanction(s, b),
  "block-rule": (s, b: Arg<"registerBlockRule">) => eng().registerBlockRule(s, b),
  "revoke-user": (s, b: Arg<"revokeUser">) => eng().revokeUser(s, b),
  "grant-capacity": (s, b: Arg<"grantCapacity">) => eng().grantCapacity(s, b),
  "model-register": (s, b: Arg<"registerModel">) => eng().registerModel(s, b),
  "model-enable": (s, b: { modelId: string }) => eng().enableModel(s, b.modelId),
  "external-claim": (s, b: Arg<"ingestExternalClaim">) => eng().ingestExternalClaim(s, b),
  notify: (s, b: { recipientActorId: string; category: string; title: string; body: string; triggerRef?: string }) =>
    eng().notifyAction(b.recipientActorId, b.category, b.title, b.body, b.triggerRef, s),
};

function label(viewerId: string, actorId?: string | null): string {
  if (!actorId) return "—";
  return eng().displayNameFor(viewerId, actorId);
}

function actorTarget(viewerId: string, a: { actorId: string; actorType: string }) {
  return { actorId: a.actorId, actorType: a.actorType, displayName: label(viewerId, a.actorId) };
}

function isOversight(s: Session) {
  return s.capacity === "Regulator" || s.capacity === "PlatformAdmin";
}

function requireCapacity(s: Session, allowed: CapacityCode[]) {
  if (!allowed.includes(s.capacity)) throw httpError(`Requires ${allowed.join(" or ")}`, 403);
}

/** Module 14: regulator reads are logged as events, then persisted. */
async function logAccess(s: Session, dataAccessed: string, purpose = "supervision") {
  if (s.capacity !== "Regulator") return;
  eng().logRegulatorAccess(s, { dataAccessed, purpose, action: "view" });
  await persistWorld();
}

function lotSummary(viewerId: string, l: LotRecord) {
  return {
    ...l,
    ownerLabel: label(viewerId, l.ownerActorId),
    custodianLabel: label(viewerId, l.custodianActorId),
  };
}

function eventSummary(e: ReturnType<Engine["getEvents"]>[number]): string {
  const p = e.payload as Record<string, any>;
  const lot = (id?: string) => (id ? eng().getLots().find((l) => l.lotId === id)?.displayCode ?? "" : "");
  switch (e.eventType) {
    case "origin_lot_created":
      return `${lot(p.lotId)} · ${p.massKg} kg ${String(p.processingState ?? "cherry").replace(/_/g, " ")}`;
    case "movement_send":
      return `${lot(p.lotId)} · ${p.senderDeclaredKg} kg dispatched`;
    case "movement_receive":
      return `${lot(p.lotId)} · ${p.receiverDeclaredKg} kg received${p.state === "received_discrepant" ? " (discrepancy)" : ""}`;
    case "process":
      return `${lot(p.childLotId)} · ${p.inputMassKg ?? "?"} kg → ${p.outputMassKg} kg ${String(p.outputState).replace(/_/g, " ")}`;
    case "aggregate":
      return `${lot(p.childLotId)} · combined ${(p.parentLotIds as string[] | undefined)?.length ?? 0} lots`;
    case "disaggregate":
      return `${lot(p.parentLotId)} · split into ${(p.childMassesKg as number[] | undefined)?.length ?? 0}`;
    case "ownership_transfer":
      return `${lot(p.lotId)} · ownership transferred`;
    case "terminal_disposition":
      return `${lot(p.lotId)} · ${String(p.reason).replace(/_/g, " ")}`;
    case "correction":
      return `corrects ${String(e.correctsEventId).slice(0, 8)} · ${p.reason}`;
    default:
      return e.eventType.replace(/_/g, " ");
  }
}

function openapi() {
  const cmd = Object.keys(commands).map((name) => [
    `/v1/commands/${name}`,
    { post: { summary: `Command ${name} (bound session; supports x-client-event-id idempotency)` } },
  ]);
  const get = [
    "roles", "me", "inventory", "pending-receipts", "network", "network/{actorId}", "inspector/lots",
    "inspector/lineage", "inspector/integrity", "inspector/activity", "inspector/chain", "inspector/recovery",
    "send-targets", "transfer-targets", "intake-targets", "process-facilities", "transporters", "importers", "consignments",
    "lot-detail", "notifications", "dashboard", "issues", "obligations", "evidence", "contracts",
    "credentials", "compliance", "reports", "stocktakes", "farms", "regulator/access-log", "admin/overview",
  ].map((p) => [`/v1/${p}`, { get: { summary: p } }]);
  return {
    openapi: "3.0.3",
    info: { title: "Ankuaru Ledger API", version: "1.1.0" },
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "header", name: "x-session-id" },
      },
      parameters: {
        clientEventId: { name: "x-client-event-id", in: "header", description: "Idempotency key (UUID) — replays return duplicate:true" },
        eventTimeActual: { name: "x-event-time-actual", in: "header", description: "Offline capture time (ISO)" },
        sourceChannel: { name: "x-source-channel", in: "header", description: "web | mobile_online | mobile_offline_sync | api" },
        assistedFor: { name: "x-assisted-for-actor", in: "header", description: "Sponsored actor you are entering data for" },
        clientKind: { name: "x-client-kind", in: "header", description: "human | integration | ai_model (ai_model writes are rejected)" },
      },
    },
    security: [{ session: [] }],
    paths: Object.fromEntries([
      ...cmd,
      ...get,
      ["/v1/session/bind", { post: { summary: "Bind a User to an Actor + capacity" } }],
      ["/v1/integrations/keys", { post: { summary: "Issue an integration session bound to User + Actor (PlatformAdmin)" } }],
      ["/v1/ussd", { post: { summary: "USSD adapter (bound session, channel_detail ussd)" } }],
    ]),
  };
}

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
        vercel: process.env.VERCEL === "1",
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasDirectUrl: Boolean(process.env.DIRECT_URL),
      });
    }

    if (path === "v1/openapi.json" && method === "GET") return json(openapi());

    try {
      await ensureWorld();
    } catch (e) {
      if (!isDatabaseConfigured()) return dbUnavailable();
      return errResponse(e);
    }

    const { engine, sessions } = world();

    if (path === "v1/seed" && method === "POST") {
      return json(
        {
          error: "Seed from the UI is disabled",
          hint: "Run `npm run db:seed` from App/ when you want to reload the demo world.",
        },
        403,
      );
    }

    if (path === "v1/roles" && method === "GET") {
      const all = engine.getActors();
      const actors = all.filter(
        (a) => a.status === "active" && (a.metadata.demoSelectable === "true" || a.metadata.userOnboarded === "true"),
      );
      if (actors.length === 0) {
        return json(
          {
            error: all.length === 0 ? "No actors loaded from the database" : "No demo-selectable actors in the loaded world",
            hint:
              all.length === 0
                ? "On Vercel: set DATABASE_URL + DIRECT_URL (same as App/.env), redeploy, then run npm run db:seed against that Supabase project."
                : "Re-run npm run db:seed so demoSelectable actors exist.",
            database: isDatabaseConfigured(),
            actorCount: all.length,
            vercel: process.env.VERCEL === "1",
          },
          503,
        );
      }
      return json(
        actors.map((a) => ({
          actorId: a.actorId,
          actorType: a.actorType,
          displayName: a.displayName,
          legalIdentityRef: a.legalIdentityRef,
          capacities: a.capacities,
          group: ["farmer", "collector", "akrabi", "exporter", "importer"].includes(a.actorType) ? "chain" : "service",
        })),
      );
    }

    if (path === "v1/session/bind" && method === "POST") {
      const body = await readBody<BindBody>(req);
      const { actorId, capacity, userId } = body ?? {};
      const actor = engine.getActors().find((a) => a.actorId === actorId);
      if (!actor) return json({ error: "Actor not found" }, 404);
      if (actor.status !== "active") return json({ error: "Actor is not active" }, 403);
      const bindCapacity = capacity && actor.capacities.includes(capacity) ? capacity : actor.capacities[0];
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
      if (uid) {
        const u = engine.getUsers().find((x) => x.userId === uid);
        if (!u || !u.actorIds.includes(actor.actorId)) return json({ error: "User is not bound to this actor" }, 403);
        if (u.status === "revoked") return json({ error: "User access revoked" }, 403);
      } else {
        const existing = engine.getUsers().find((u) => u.status === "active" && u.actorIds.includes(actor.actorId));
        if (existing) {
          uid = existing.userId;
        } else {
          const u = engine.createUser({ displayName: `${actor.displayName} operator` });
          engine.bindUserToActor(u.userId, actorId);
          uid = u.userId;
          await upsertUserWithMembership(u);
        }
      }
      const sessionId = randomUUID();
      const session: Session = { userId: uid, actorId, capacity: bindCapacity, sourceChannel: "web" };
      sessions.set(sessionId, { ...session, displayName: actor.displayName });
      await upsertSimulatorSession(sessionId, { ...session, displayName: actor.displayName });
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

    if (path === "v1/integrations/keys" && method === "POST") {
      const s = await getSession(req.headers);
      requireCapacity(s, ["PlatformAdmin"]);
      const body = await readBody<{ actorId: string; capacity?: CapacityCode; label: string }>(req);
      const actor = engine.getActors().find((a) => a.actorId === body.actorId);
      if (!actor) return json({ error: "Actor not found" }, 404);
      const cap = body.capacity && actor.capacities.includes(body.capacity) ? body.capacity : actor.capacities[0];
      if (!cap) return json({ error: "Actor has no capacity" }, 400);
      const u = engine.createUser({ displayName: `${INTEGRATION_PREFIX}${body.label || "integration"} (${actor.displayName})` });
      engine.bindUserToActor(u.userId, actor.actorId);
      await upsertUserWithMembership(u);
      const key = randomUUID();
      const stored: StoredSession = {
        userId: u.userId,
        actorId: actor.actorId,
        capacity: cap,
        sourceChannel: "api",
        agentKind: "integration",
        displayName: `${INTEGRATION_PREFIX}${body.label || "integration"}`,
      };
      sessions.set(key, stored);
      await upsertSimulatorSession(key, stored);
      return json({ apiKey: key, header: "x-session-id", userId: u.userId, actorId: actor.actorId, capacity: cap });
    }

    if (path === "v1/me" && method === "GET") {
      const s = await getSession(req.headers);
      const actor = engine.getActors().find((a) => a.actorId === s.actorId)!;
      const user = engine.getUsers().find((u) => u.userId === s.userId);
      return json({
        session: s,
        actor,
        user: user ? { userId: user.userId, displayName: user.displayName, status: user.status } : null,
        preferredTraceLotId:
          w_preferred(s.actorId) ?? undefined,
        sponsoredForAssist:
          actor.actorType === "collector"
            ? engine.networkTree(actor.actorId).filter((a) => a.actorType === "farmer").map((a) => actorTarget(s.actorId, a))
            : [],
      });
    }

    if (path === "v1/inventory" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ lots: engine.inventory(s.actorId).map((l) => lotSummary(s.actorId, l)) });
    }

    if (path === "v1/pending-receipts" && method === "GET") {
      const s = await getSession(req.headers);
      return json({
        movements: engine.pendingReceipts(s.actorId).map((m) => {
          const lot = engine.getLots().find((l) => l.lotId === m.lotId);
          return {
            ...m,
            lotDisplayCode: lot?.displayCode,
            form: lot?.processingState,
            fromLabel: label(s.actorId, m.fromActorId),
            requiresSealCheck: Boolean(m.shinto),
            contracts: engine
              .getContracts()
              .filter((c) => c.supplierActorId === m.fromActorId && c.exporterActorId === s.actorId),
          };
        }),
      });
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
      if (!subjectId || subjectId.includes("/")) return json({ error: "Not found" }, 404);
      const profile = engine.networkProfile(s.actorId, subjectId);
      if (!profile) return json({ error: "Actor not found or not in your network" }, 404);
      return json(profile);
    }

    if (path === "v1/inspector/lots" && method === "GET") {
      const s = await getSession(req.headers);
      await logAccess(s, "visible lot list");
      const lots = engine.visibleLots(s.actorId);
      return json({ lots, preferredTraceLotId: w_preferred(s.actorId) });
    }

    if (path === "v1/inspector/lineage" && method === "GET") {
      const s = await getSession(req.headers);
      const lotId = url.searchParams.get("lotId") ?? "";
      if (!engine.canSeeLot(s.actorId, lotId)) return json({ error: "Lot not visible to your actor (CORE §9)" }, 403);
      await logAccess(s, `lineage ${engine.getLots().find((l) => l.lotId === lotId)?.displayCode ?? lotId}`);
      const latest = engine.getAssessments(lotId).slice(-1)[0];
      return json({
        ...engine.lineageTrace(lotId, s.actorId),
        issues: engine.lotIssues(lotId),
        compliance: latest ? { ...latest, status: overallStatus(latest.results) } : null,
      });
    }

    if (path === "v1/inspector/integrity" && method === "GET") {
      await getSession(req.headers);
      const chain = engine.verifyChain();
      return json({
        ...engine.integrityChecks(),
        chain: {
          ok: chain.ok,
          checked: chain.checked,
          legacyUnverifiable: chain.legacyUnverifiable,
          mismatches: chain.mismatches.length,
        },
      });
    }

    if (path === "v1/inspector/chain" && method === "GET") {
      const s = await getSession(req.headers);
      requireCapacity(s, ["Regulator", "PlatformAdmin", "Verifier"]);
      await logAccess(s, "hash chain verification", "integrity");
      return json(engine.verifyChain());
    }

    if (path === "v1/inspector/recovery" && method === "GET") {
      const s = await getSession(req.headers);
      requireCapacity(s, ["PlatformAdmin", "Regulator"]);
      return json(engine.recoveryVerification());
    }

    if (path === "v1/send-targets" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ targets: engine.allowedSendTargets(s.actorId).map((t) => actorTarget(s.actorId, t)) });
    }

    if (path === "v1/transfer-targets" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ targets: engine.allowedTransferTargets(s.actorId).map((t) => actorTarget(s.actorId, t)) });
    }

    if (path === "v1/intake-targets" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ targets: engine.allowedIntakeTargets(s.actorId).map((t) => actorTarget(s.actorId, t)) });
    }

    if (path === "v1/process-facilities" && method === "GET") {
      const s = await getSession(req.headers);
      const me = engine.getActors().find((a) => a.actorId === s.actorId);
      const scope = new Set<string>([s.actorId, ...engine.sponsoredSubtreeIds(s.actorId)]);
      let up = me?.sponsorActorId;
      while (up) {
        scope.add(up);
        for (const id of engine.sponsoredSubtreeIds(up)) scope.add(id);
        up = engine.getActors().find((a) => a.actorId === up)?.sponsorActorId ?? null;
      }
      return json({
        facilities: engine
          .getFacilities()
          .filter((f) => scope.has(f.actorId))
          .map((f) => {
            const a = engine.getActors().find((x) => x.actorId === f.actorId);
            return { actorId: f.actorId, displayName: a?.displayName ?? f.actorId, actorType: a?.actorType, capabilities: f.capabilities };
          }),
      });
    }

    if (path === "v1/transporters" && method === "GET") {
      const s = await getSession(req.headers);
      return json({
        targets: engine
          .getActors()
          .filter((a) => a.status === "active" && a.capacities.some((c) => c === "Transporter" || c === "Driver"))
          .map((a) => actorTarget(s.actorId, a)),
      });
    }

    if (path === "v1/consignments" && method === "GET") {
      const s = await getSession(req.headers);
      const lots = new Map(engine.getLots().map((l) => [l.lotId, l]));
      return json({
        consignments: engine
          .getMovements()
          .filter((m) => m.transporterActorId && (isOversight(s) || m.transporterActorId === s.actorId))
          .map((m) => ({
            movementId: m.movementId,
            lotId: m.lotId,
            lotDisplayCode: lots.get(m.lotId)?.displayCode,
            form: lots.get(m.lotId)?.processingState,
            fromLabel: label(s.actorId, m.fromActorId),
            toLabel: label(s.actorId, m.toActorId),
            carrierLabel: m.transporterActorId ? label(s.actorId, m.transporterActorId) : undefined,
            senderDeclaredKg: m.senderDeclaredKg,
            receiverDeclaredKg: m.receiverDeclaredKg,
            destination: m.destinationLocationId,
            state: m.state,
            dispatchedAt: m.dispatchedAt,
            shinto: m.shinto,
          }))
          .sort((a, b) => Number(b.state === "pending") - Number(a.state === "pending") || String(b.dispatchedAt).localeCompare(String(a.dispatchedAt))),
      });
    }

    if (path === "v1/importers" && method === "GET") {
      const s = await getSession(req.headers);
      return json({
        targets: engine
          .getActors()
          .filter((a) => a.status === "active" && a.capacities.includes("Importer"))
          .map((a) => actorTarget(s.actorId, a)),
      });
    }

    if (path === "v1/inspector/activity" && method === "GET") {
      const s = await getSession(req.headers);
      await logAccess(s, "activity log");
      const events = engine.visibleEvents(s.actorId).slice(-150).reverse();
      const corrected = new Set(engine.getEvents().map((e) => e.correctsEventId).filter(Boolean));
      return json({
        events: events.map((e) => ({
          eventId: e.eventId,
          eventType: e.eventType,
          eventTime: e.eventTimeActual || e.serverCommitTime,
          serverCommitTime: e.serverCommitTime,
          retrospective: e.retrospectiveFlag,
          sourceChannel: e.sourceChannel,
          channelDetail: (e.payload as { channelDetail?: string }).channelDetail,
          actorId: e.actorId,
          actorLabel: e.actorId ? label(s.actorId, e.actorId) : "—",
          enteredBy: (e.payload as { enteredByActorId?: string }).enteredByActorId
            ? label(s.actorId, String((e.payload as { enteredByActorId?: string }).enteredByActorId))
            : undefined,
          summary: eventSummary(e),
          correctsEventId: e.correctsEventId,
          correctedBy: corrected.has(e.eventId),
          canCorrect: e.actorId === s.actorId && e.eventType !== "correction",
          affectedObjectIds: e.affectedObjectIds,
        })),
      });
    }

    if (path === "v1/lot-detail" && method === "GET") {
      const s = await getSession(req.headers);
      const lotId = url.searchParams.get("lotId") ?? "";
      const lot = engine.getLots().find((l) => l.lotId === lotId);
      if (!lot) return json({ error: "Lot not found" }, 404);
      if (!engine.canSeeLot(s.actorId, lotId)) return json({ error: "Lot not visible to your actor (CORE §9)" }, 403);
      return json({
        lot,
        ownerLabel: label(s.actorId, lot.ownerActorId),
        custodianLabel: label(s.actorId, lot.custodianActorId),
        priorSupplier: engine.priorSupplierLabel(lotId, s.actorId),
        requiresShinto: engine.requiresShinto(lotId),
        issues: engine.lotIssues(lotId),
        evidence: engine.getEvidence().filter((e) => e.attachedType === "lot" && e.attachedId === lotId),
        createdBy: label(s.actorId, lot.createdByActorId),
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
      const clientEventId = req.headers.get("x-client-event-id") ?? undefined;
      if (clientEventId && engine.hasEvent(clientEventId)) {
        return json({ ok: true, duplicate: true, eventId: clientEventId });
      }
      let result: unknown;
      try {
        result = engine.withClientEventId(clientEventId, () => handler(s, body));
      } finally {
        // Rejected attempts that were logged (e.g. issue_resolution_rejected) must persist too
        await persistWorld();
      }
      return json({ ok: true, result });
    }

    if (path === "v1/notifications" && method === "GET") {
      const s = await getSession(req.headers);
      await maybeSweep();
      return json({ notifications: engine.getNotifications(s.actorId).slice().reverse() });
    }

    if (path === "v1/dashboard" && method === "GET") {
      const s = await getSession(req.headers);
      await maybeSweep();
      const stockByState: Record<string, number> = {};
      for (const l of engine.inventory(s.actorId)) {
        stockByState[l.processingState] = (stockByState[l.processingState] ?? 0) + l.canonicalMassKg;
      }
      return json({
        overdueReceipts: engine.pendingReceipts(s.actorId).filter((m) => m.state === "receipt_overdue"),
        pendingReceipts: engine.pendingReceipts(s.actorId),
        openIssues: engine.issuesFor(s.actorId).filter((i) => i.lifecycle !== "RESOLVED"),
        openObligations: engine.obligationsFor(s.actorId).filter((o) => o.status !== "closed"),
        stockByState,
      });
    }

    if (path === "v1/issues" && method === "GET") {
      const s = await getSession(req.headers);
      await logAccess(s, "issue register");
      return json({
        issues: engine
          .issuesFor(s.actorId)
          .slice()
          .reverse()
          .map((i) => ({
            ...i,
            lotCodes: i.lotIds.map((id) => engine.getLots().find((l) => l.lotId === id)?.displayCode).filter(Boolean),
            parties: i.partyActorIds.map((id) => label(s.actorId, id)),
          })),
      });
    }

    if (path === "v1/obligations" && method === "GET") {
      const s = await getSession(req.headers);
      return json({
        obligations: engine.obligationsFor(s.actorId).map((o) => ({
          ...o,
          accountableLabel: label(s.actorId, o.accountableActorId),
        })),
        handoverTargets: engine
          .getActors()
          .filter((a) => a.status === "active" && (a.sponsorActorId === s.actorId || a.actorId === engine.getActors().find((x) => x.actorId === s.actorId)?.sponsorActorId))
          .map((a) => actorTarget(s.actorId, a)),
      });
    }

    if (path === "v1/evidence" && method === "GET") {
      const s = await getSession(req.headers);
      return json({
        evidence: engine.evidenceFor(s.actorId).map((e) => ({
          ...e,
          lotCode: e.attachedType === "lot" ? engine.getLots().find((l) => l.lotId === e.attachedId)?.displayCode : undefined,
          uploaderLabel: label(s.actorId, e.uploaderActorId),
        })),
      });
    }

    if (path === "v1/contracts" && method === "GET") {
      const s = await getSession(req.headers);
      const all = engine.getContracts();
      return json({
        contracts: (isOversight(s) ? all : all.filter((c) => c.exporterActorId === s.actorId || c.supplierActorId === s.actorId)).map(
          (c) => ({ ...c, supplierLabel: label(s.actorId, c.supplierActorId), exporterLabel: label(s.actorId, c.exporterActorId) }),
        ),
      });
    }

    if (path === "v1/credentials" && method === "GET") {
      const s = await getSession(req.headers);
      const all = engine.getCredentials();
      return json({
        credentials: (isOversight(s) ? all : all.filter((c) => c.actorId === s.actorId)).map((c) => ({
          ...c,
          actorLabel: engine.getActors().find((a) => a.actorId === c.actorId)?.displayName ?? c.actorId,
        })),
        sanctions: isOversight(s) ? engine.getSanctions() : engine.getSanctions().filter((x) => x.actorId === s.actorId),
      });
    }

    if (path === "v1/compliance" && method === "GET") {
      const s = await getSession(req.headers);
      const lotId = url.searchParams.get("lotId") ?? undefined;
      if (lotId && !engine.canSeeLot(s.actorId, lotId)) return json({ error: "Lot not visible" }, 403);
      const visible = new Set(engine.visibleLots(s.actorId).map((l) => l.lotId));
      return json({
        assessments: engine
          .getAssessments(lotId)
          .filter((a) => visible.has(a.lotId))
          .map((a) => ({
            ...a,
            status: overallStatus(a.results),
            lotCode: engine.getLots().find((l) => l.lotId === a.lotId)?.displayCode,
          })),
        submissions: engine.getSubmissions(lotId).filter((x) => visible.has(x.lotId)),
      });
    }

    if (path === "v1/reports" && method === "GET") {
      const s = await getSession(req.headers);
      const lotId = url.searchParams.get("lotId") ?? "";
      if (!engine.canSeeLot(s.actorId, lotId)) return json({ error: "Lot not visible" }, 403);
      return json({
        reports: engine.getReports(lotId).map((r) => ({
          reportId: r.reportId,
          version: r.version,
          generatedAt: r.generatedAt,
          contentHash: r.contentHash,
          superseded: r.superseded,
          supersedesReportId: r.supersedesReportId,
          supersededByReportId: r.supersededByReportId,
          fingerprintOk: engine.verifyReportFingerprint(r.reportId),
        })),
      });
    }

    if (path === "v1/reports" && method === "POST") {
      const s = await getSession(req.headers);
      if (!isDatabaseConfigured()) return dbUnavailable();
      const body = await readBody<{ lotId: string }>(req);
      const report = engine.generateReport(s, body.lotId);
      await persistWorld();
      return json({ report, fingerprintOk: engine.verifyReportFingerprint(report.reportId) });
    }

    if (path === "v1/stocktakes" && method === "GET") {
      const s = await getSession(req.headers);
      return json({ stocktakes: engine.getStocktakes(isOversight(s) ? undefined : s.actorId) });
    }

    if (path === "v1/farms" && method === "GET") {
      const s = await getSession(req.headers);
      const scope = new Set([s.actorId, ...engine.sponsoredSubtreeIds(s.actorId)]);
      const farms = engine.getFarms().filter((f) => isOversight(s) || s.capacity === "Verifier" || scope.has(f.ownerActorId));
      return json({
        farms: farms.map((f) => {
          const units = engine.getFarmUnits().filter((u) => u.farmId === f.farmId);
          return {
            ...f,
            ownerLabel: label(s.actorId, f.ownerActorId),
            units: units.map((u) => ({
              ...u,
              geometries: engine.getGeometries().filter((g) => g.farmUnitId === u.farmUnitId),
              overlays: engine.getOverlays().filter((o) => o.farmUnitId === u.farmUnitId),
            })),
          };
        }),
      });
    }

    if (path === "v1/regulator/access-log" && method === "GET") {
      const s = await getSession(req.headers);
      requireCapacity(s, ["Regulator", "PlatformAdmin"]);
      return json({ access: engine.getRegulatorAccess().slice().reverse() });
    }

    if (path === "v1/admin/overview" && method === "GET") {
      const s = await getSession(req.headers);
      requireCapacity(s, ["PlatformAdmin", "Regulator"]);
      return json({
        users: engine.getUsers().map((u) => ({
          userId: u.userId,
          displayName: u.displayName,
          status: u.status,
          actors: u.actorIds.map((id) => engine.getActors().find((a) => a.actorId === id)?.displayName ?? id),
        })),
        actors: engine.getActors().map((a) => ({
          actorId: a.actorId,
          actorType: a.actorType,
          displayName: a.displayName,
          status: a.status,
          capacities: a.capacities,
        })),
        blockRules: engine.getBlockRules(),
        models: engine.getModelRegistry(),
        externalClaims: engine.getExternalClaims(),
        quarantines: engine.getQuarantines(),
        chain: engine.verifyChain(),
      });
    }

    if (path === "v1/ussd" && method === "POST") {
      if (!isDatabaseConfigured()) return dbUnavailable();
      const base = await getSession(req.headers);
      const body = await readBody<{ action: "receive"; movementId: string; receiverDeclaredKg: number }>(req);
      const session: Session = { ...base, sourceChannel: "mobile_online", channelDetail: "ussd" };
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

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return errResponse(err);
  }
}

/** Module 08: a lot is only READY when no applicable requirement is incomplete or in exception. */
function overallStatus(results: Array<{ status: string }>): string {
  const applicable = results.filter((r) => r.status !== "NOT_APPLICABLE");
  if (applicable.some((r) => r.status === "EXCEPTION")) return "EXCEPTION";
  if (applicable.some((r) => r.status === "INCOMPLETE")) return "INCOMPLETE";
  if (applicable.some((r) => r.status === "REQUIRES_EXTERNAL_VERIFICATION")) return "REQUIRES_EXTERNAL_VERIFICATION";
  return applicable.length ? "READY" : "NOT_APPLICABLE";
}

/** CORE §8: preferred trace lot (washed blend) when it is visible to the viewer. */
function w_preferred(actorId: string): string | undefined {
  const w = world();
  const id = w.preferredTraceLotId;
  if (!id) return undefined;
  return w.engine.canSeeLot(actorId, id) ? id : undefined;
}
