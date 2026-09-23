/**
 * Hydrate LedgerEngine from Prisma (Phase 1 CORE spine).
 */
import { PrismaClient } from "@prisma/client";
import {
  createEmptyWorld,
  createEngine,
  type ActorRecord,
  type DiscrepancyRecord,
  type EventRecord,
  type FacilityRecord,
  type LedgerEngine,
  type LineageEdgeRecord,
  type LotRecord,
  type MovementRecord,
  type UserRecord,
  type World,
} from "@ankuaru/engine";
import type { CapacityCode } from "@ankuaru/schema";
import { getPrisma } from "./client.js";
import { isDatabaseConfigured } from "./flush.js";

export type HydrateResult = {
  engine: LedgerEngine;
  preferredTraceLotId?: string;
  eventCount: number;
  actorCount: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = val == null ? "" : String(val);
  }
  return out;
}

function asNumberRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = num(val);
  }
  return out;
}

function isDbUnreachable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string }).code;
  return (
    code === "P1001" ||
    msg.includes("Can't reach database server") ||
    msg.includes("P1001")
  );
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isDbUnreachable(e) || i === attempts) throw e;
      const wait = 800 * i;
      console.warn(`[hydrate] ${label} retry ${i}/${attempts} in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

export async function dbHasSimulatorData(
  client?: PrismaClient,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const db = client ?? getPrisma();
  try {
    const n = await withRetry("actor.count", () => db.actor.count());
    return n > 0;
  } catch (e) {
    if (isDbUnreachable(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("Query Engine") ||
      msg.includes("Prisma Client could not locate") ||
      (e as { name?: string }).name === "PrismaClientInitializationError"
    ) {
      throw e;
    }
    return false;
  }
}

export async function hydrateEngine(
  client?: PrismaClient,
): Promise<HydrateResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("database not configured: set DATABASE_URL");
  }

  const db = client ?? getPrisma();

  // Sequential batches — Promise.all(13) saturates Supabase pooler and surfaces as P1001
  const actorsDb = await withRetry("actors", () => db.actor.findMany());
  const capacities = await withRetry("capacities", () =>
    db.actorCapacity.findMany({ where: { revokedAt: null } }),
  );
  const facilitiesDb = await withRetry("facilities", () => db.facility.findMany());
  const usersDb = await withRetry("users", () => db.user.findMany());
  const memberships = await withRetry("memberships", () =>
    db.actorMembership.findMany(),
  );
  const lotsDb = await withRetry("lots", () => db.lot.findMany());
  const lineageDb = await withRetry("lineage", () => db.lineageEdge.findMany());
  const movementsDb = await withRetry("movements", () => db.movement.findMany());
  const discrepanciesDb = await withRetry("discrepancies", () =>
    db.discrepancy.findMany(),
  );
  const eventsDb = await withRetry("events", () => db.event.findMany());
  const checkpoints = await withRetry("checkpoints", () =>
    db.checkpoint.findMany({ orderBy: { sequence: "asc" } }),
  );
  const displaySeq = await withRetry("displaySeq", () =>
    db.displaySequence.findUnique({ where: { id: "lot" } }),
  );
  const meta = await withRetry("appMeta", () =>
    db.appMeta.findUnique({ where: { id: "default" } }),
  );

  const capsByActor = new Map<string, CapacityCode[]>();
  for (const c of capacities) {
    const list = capsByActor.get(c.actorId) ?? [];
    list.push(c.capacity as CapacityCode);
    capsByActor.set(c.actorId, list);
  }

  const defaultCapByType: Partial<Record<string, CapacityCode>> = {
    farmer: "Farmer",
    collector: "Collector",
    akrabi: "Aggregator",
    exporter: "Exporter",
    washing_station: "FacilityOperator",
    mill: "FacilityOperator",
    importer: "Importer",
    transporter: "Transporter",
    driver: "Driver",
    regulator: "Regulator",
    verifier: "Verifier",
    warehouse_operator: "WarehouseOperator",
    facility_operator: "FacilityOperator",
    platform_admin: "PlatformAdmin",
  };

  const actors: ActorRecord[] = actorsDb.map((a) => {
    let capacities = capsByActor.get(a.id) ?? [];
    if (capacities.length === 0) {
      const fallback = defaultCapByType[a.actorType];
      if (fallback) capacities = [fallback];
    }
    return {
      actorId: a.id,
      actorType: a.actorType,
      displayName: a.displayName,
      legalIdentityRef: a.legalIdentityRef,
      status: a.status === "inactive" ? "inactive" : "active",
      sponsorActorId: a.sponsorActorId,
      metadata: asStringRecord(a.metadata),
      capacities,
    };
  });

  // Repair DB rows that lost capacities (e.g. failed sync deleteMany)
  for (const a of actors) {
    if ((capsByActor.get(a.actorId) ?? []).length === 0 && a.capacities.length > 0) {
      await db.actorCapacity.createMany({
        data: a.capacities.map((capacity) => ({
          actorId: a.actorId,
          capacity: capacity as never,
        })),
        skipDuplicates: true,
      });
    }
  }

  const memberByUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = memberByUser.get(m.userId) ?? [];
    list.push(m.actorId);
    memberByUser.set(m.userId, list);
  }

  const users: UserRecord[] = usersDb.map((u) => ({
    userId: u.id,
    displayName: u.displayName,
    email: u.email ?? undefined,
    status: u.status === "revoked" ? "revoked" : "active",
    actorIds: memberByUser.get(u.id) ?? [],
  }));

  const facilities: FacilityRecord[] = facilitiesDb.map((f) => ({
    actorId: f.actorId,
    capabilities: f.capabilities,
  }));

  const lots: LotRecord[] = lotsDb.map((l) => ({
    lotId: l.id,
    displayCode: l.displayCode,
    processingState: l.processingState,
    processingRoute: l.processingRoute,
    status: l.status as LotRecord["status"],
    canonicalMassKg: num(l.canonicalMassKg),
    availableKg: num(l.availableKg),
    originalUnit: l.originalUnit ?? undefined,
    originalQuantity: l.originalQuantity != null ? num(l.originalQuantity) : undefined,
    conversionBasis: l.conversionBasis ?? undefined,
    ownerActorId: l.ownerActorId,
    custodianActorId: l.custodianActorId,
    locationId: l.locationId ?? undefined,
    originLocationId: l.originLocationId ?? undefined,
    cropYear: l.cropYear ?? undefined,
    cropYearComposition: asNumberRecord(l.cropYearComposition),
    originStatus: l.originStatus ?? undefined,
    createdByActorId: l.createdByActorId ?? undefined,
    createdEventId: l.createdEventId,
    provenance: asNumberRecord(l.provenance),
    inactiveEventId: l.inactiveEventId ?? undefined,
    inTransit: l.inTransit,
    moisturePct: l.moisturePct != null ? num(l.moisturePct) : undefined,
    transactionChannel: l.transactionChannel ?? undefined,
  }));

  const lineage: LineageEdgeRecord[] = lineageDb.map((e) => ({
    parentLotId: e.parentLotId,
    childLotId: e.childLotId,
    contributionKg: num(e.contributionKg),
    proportion: num(e.proportion),
    eventId: e.eventId,
  }));

  const movements: MovementRecord[] = movementsDb.map((m) => ({
    movementId: m.id,
    lotId: m.lotId,
    fromActorId: m.fromActorId,
    toActorId: m.toActorId,
    senderDeclaredKg: num(m.senderDeclaredKg),
    receiverDeclaredKg:
      m.receiverDeclaredKg != null ? num(m.receiverDeclaredKg) : undefined,
    destinationLocationId: m.destinationLocationId ?? undefined,
    state: m.state as MovementRecord["state"],
    dispatchEventId: m.dispatchEventId ?? "",
    receiptEventId: m.receiptEventId ?? undefined,
  }));

  const discrepancies: DiscrepancyRecord[] = discrepanciesDb.map((d) => ({
    movementId: d.movementId,
    senderKg: num(d.senderKg),
    receiverKg: num(d.receiverKg),
    deltaKg: num(d.deltaKg),
    status: d.status === "resolved" ? "resolved" : "open",
  }));

  const eventById = new Map(
    eventsDb.map((e) => [
      e.eventId,
      {
        eventId: e.eventId,
        eventType: e.eventType,
        schemaVersion: e.schemaVersion,
        actorId: e.actorId ?? undefined,
        actingCapacity: e.actingCapacity ?? undefined,
        userId: e.userId ?? undefined,
        deviceId: e.deviceId ?? undefined,
        affectedObjectIds: e.affectedObjectIds,
        eventTimeActual: e.eventTimeActual.toISOString(),
        eventTimeRecorded: e.eventTimeRecorded.toISOString(),
        serverCommitTime: e.serverCommitTime.toISOString(),
        sourceChannel: e.sourceChannel,
        retrospectiveFlag: e.retrospectiveFlag,
        payload: (e.payload ?? {}) as Record<string, unknown>,
        integrityHash: e.integrityHash,
        correctsEventId: e.correctsEventId ?? undefined,
        sequence: Number(e.sequence),
      } satisfies EventRecord,
    ]),
  );

  const events: EventRecord[] = [];
  if (checkpoints.length > 0) {
    for (const cp of checkpoints) {
      const base = eventById.get(cp.eventId);
      if (!base) continue;
      events.push({
        ...base,
        sequence: Number(cp.sequence),
        integrityHash: cp.chainHash,
      });
    }
  } else {
    events.push(
      ...[...eventById.values()].sort((a, b) => a.sequence - b.sequence),
    );
  }

  const world: World = createEmptyWorld();
  for (const u of users) world.users.set(u.userId, u);
  for (const a of actors) world.actors.set(a.actorId, a);
  for (const l of lots) world.lots.set(l.lotId, l);
  world.lineage = lineage;
  for (const m of movements) world.movements.set(m.movementId, m);
  world.discrepancies = discrepancies;
  world.events = events;
  for (const f of facilities) world.facilities.set(f.actorId, f);
  world.lotSeq = displaySeq?.nextVal ?? lots.length + 1;
  world.lastHash =
    meta?.lastHash ??
    (events.length ? events[events.length - 1]!.integrityHash : "genesis");

  const engine = createEngine();
  engine.replaceWorld(world);
  // Module state (issues, evidence, obligations, contracts, …) lives only in event payloads
  engine.rebuildModuleProjections();

  return {
    engine,
    preferredTraceLotId: meta?.preferredTraceLotId ?? undefined,
    eventCount: events.length,
    actorCount: actors.length,
  };
}
