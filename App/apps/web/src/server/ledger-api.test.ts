import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@ankuaru/db", async () => {
  const { seedWorld } = await import("@ankuaru/seed");
  const seeded = seedWorld();
  return {
    ensurePrismaEnginePath: () => undefined,
    getPrisma: () => ({}),
    isDatabaseConfigured: () => true,
    dbHasSimulatorData: async () => true,
    hydrateEngine: async () => ({ engine: seeded.engine, preferredTraceLotId: seeded.preferredTraceLotId }),
    loadAllSimulatorSessions: async () => new Map(),
    getSimulatorSession: async () => undefined,
    upsertSimulatorSession: async () => undefined,
    upsertUserWithMembership: async () => undefined,
    syncWorldToDb: async (engine: { getEvents(): unknown[] }) => ({ nextEventIndex: engine.getEvents().length }),
  };
});

const { handleApi } = await import("./ledger-api");

type Role = { actorId: string; actorType: string; displayName: string; capacities: string[]; group: string };

async function call<T = any>(
  method: string,
  path: string,
  opts: { session?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers ?? {}) };
  if (opts.session) headers["x-session-id"] = opts.session;
  const req = new Request(`http://local/api/${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const pathOnly = path.split("?")[0]!;
  const res = await handleApi(req, pathOnly.split("/"));
  return { status: res.status, body: (await res.json()) as T };
}

async function bind(role: Role) {
  const r = await call<{ sessionId: string }>("POST", "v1/session/bind", { body: { actorId: role.actorId } });
  expect(r.status).toBe(200);
  return r.body.sessionId;
}

let roles: Role[] = [];
const byType = (t: string) => roles.find((r) => r.actorType === t)!;

beforeAll(async () => {
  const r = await call<Role[]>("GET", "v1/roles");
  expect(r.status).toBe(200);
  roles = r.body;
});

describe("ledger API", () => {
  it("lists chain and service roles", () => {
    expect(roles.some((r) => r.group === "chain" && r.actorType === "farmer")).toBe(true);
    for (const t of ["regulator", "verifier", "transporter", "importer", "platform_admin"]) {
      expect(roles.find((r) => r.actorType === t)?.group).toBe("service");
    }
  });

  it("reuses the user already bound to an actor", async () => {
    const exporter = byType("exporter");
    const a = await bind(exporter);
    const b = await bind(exporter);
    const meA = await call("GET", "v1/me", { session: a });
    const meB = await call("GET", "v1/me", { session: b });
    expect(meA.body.user.userId).toBe(meB.body.user.userId);
  });

  it("serves the preferred trace lot and lineage with issues and compliance", async () => {
    const s = await bind(byType("exporter"));
    const lots = await call("GET", "v1/inspector/lots", { session: s });
    expect(lots.body.preferredTraceLotId).toBeTruthy();
    const lin = await call("GET", `v1/inspector/lineage?lotId=${lots.body.preferredTraceLotId}`, { session: s });
    expect(lin.status).toBe(200);
    expect(lin.body.nodes.length).toBeGreaterThan(3);
    expect(Array.isArray(lin.body.issues)).toBe(true);
    const results = Object.fromEntries(lin.body.compliance.results.map((r: any) => [r.code, r.status]));
    expect(results["EUDR-GEO"]).toBe("READY");
    expect(results["EUDR-DDS"]).toBe("READY");
    expect(lin.body.compliance.status).toBe("REQUIRES_EXTERNAL_VERIFICATION");
    expect(lin.body.nodes.some((n: any) => n.processDetail)).toBe(true);
  });

  it("refuses lineage for a lot outside the viewer's scope (CORE §9)", async () => {
    const exporterSession = await bind(byType("exporter"));
    const lots = await call("GET", "v1/inspector/lots", { session: exporterSession });
    const farmer = byType("farmer");
    const fs = await bind(farmer);
    const mine = new Set((await call("GET", "v1/inspector/lots", { session: fs })).body.lots.map((l: any) => l.lotId));
    const foreign = lots.body.lots.find((l: any) => !mine.has(l.lotId));
    const r = await call("GET", `v1/inspector/lineage?lotId=${foreign.lotId}`, { session: fs });
    expect(r.status).toBe(403);
  });

  it("makes commands idempotent on x-client-event-id", async () => {
    const fs = await bind(byType("farmer"));
    const id = crypto.randomUUID();
    const first = await call("POST", "v1/commands/origin-lot", { session: fs, body: { massKg: 40 }, headers: { "x-client-event-id": id } });
    expect(first.status).toBe(200);
    const again = await call("POST", "v1/commands/origin-lot", { session: fs, body: { massKg: 40 }, headers: { "x-client-event-id": id } });
    expect(again.body).toMatchObject({ ok: true, duplicate: true });
  });

  it("records offline capture time and marks the event retrospective", async () => {
    const fs = await bind(byType("farmer"));
    const actual = new Date(Date.now() - 3 * 3600_000).toISOString();
    await call("POST", "v1/commands/origin-lot", {
      session: fs,
      body: { massKg: 41 },
      headers: { "x-source-channel": "mobile_offline_sync", "x-event-time-actual": actual },
    });
    const act = await call("GET", "v1/inspector/activity", { session: fs });
    const ev = act.body.events.find((e: any) => e.eventType === "origin_lot_created" && e.retrospective);
    expect(ev).toBeTruthy();
    expect(new Date(ev.eventTime).toISOString()).toBe(actual);
  });

  it("lets a collector enter data for a sponsored farmer, attributed to the collector", async () => {
    const cs = await bind(byType("collector"));
    const me = await call("GET", "v1/me", { session: cs });
    const farmer = me.body.sponsoredForAssist[0];
    expect(farmer).toBeTruthy();
    const r = await call("POST", "v1/commands/origin-lot", {
      session: cs,
      body: { massKg: 55 },
      headers: { "x-assisted-for-actor": farmer.actorId },
    });
    expect(r.status).toBe(200);
    expect(r.body.result.ownerActorId).toBe(farmer.actorId);
    const act = await call("GET", "v1/inspector/activity", { session: cs });
    expect(act.body.events.some((e: any) => e.enteredBy)).toBe(true);
  });

  it("rejects AI-model writes", async () => {
    const fs = await bind(byType("farmer"));
    const r = await call("POST", "v1/commands/origin-lot", { session: fs, body: { massKg: 10 }, headers: { "x-client-kind": "ai_model" } });
    expect(r.status).toBe(403);
    expect(r.body.invariantId).toBe("AI-WRITE-BAN");
  });

  it("requires a bound session for USSD", async () => {
    const r = await call("POST", "v1/ussd", { body: { action: "receive", movementId: "x", receiverDeclaredKg: 1 } });
    expect(r.status).toBe(401);
  });

  it("logs regulator reads", async () => {
    const rs = await bind(byType("regulator"));
    await call("GET", "v1/inspector/lots", { session: rs });
    const log = await call("GET", "v1/regulator/access-log", { session: rs });
    expect(log.body.access.length).toBeGreaterThan(0);
  });

  it("generates fingerprinted, versioned reports", async () => {
    const s = await bind(byType("exporter"));
    const lotId = (await call("GET", "v1/inspector/lots", { session: s })).body.preferredTraceLotId;
    const r1 = await call("POST", "v1/commands/report", { session: s, body: { lotId } });
    expect(r1.body.result.fingerprintOk).toBe(true);
    await call("POST", "v1/commands/report", { session: s, body: { lotId } });
    const list = await call("GET", `v1/reports?lotId=${lotId}`, { session: s });
    expect(list.body.reports.filter((r: any) => !r.superseded)).toHaveLength(1);
  });

  it("serves every records surface", async () => {
    const s = await bind(byType("exporter"));
    for (const p of [
      "v1/notifications",
      "v1/dashboard",
      "v1/issues",
      "v1/obligations",
      "v1/evidence",
      "v1/contracts",
      "v1/credentials",
      "v1/compliance",
      "v1/farms",
      "v1/stocktakes",
      "v1/transfer-targets",
      "v1/process-facilities",
      "v1/transporters",
      "v1/importers",
      "v1/network",
    ]) {
      const r = await call("GET", p, { session: s });
      expect(r.status, p).toBe(200);
    }
    const admin = await bind(byType("platform_admin"));
    const overview = await call("GET", "v1/admin/overview", { session: admin });
    expect(overview.status).toBe(200);
    expect(overview.body.chain.ok).toBe(true);
    expect((await call("GET", "v1/admin/overview", { session: s })).status).toBe(403);
  });
});
