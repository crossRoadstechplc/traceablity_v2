/**
 * Delta sync: persist only what changed since the last sync (CRUD-style).
 * Avoids re-upserting hundreds of lots over the network on every command.
 */
import type {
  ActorRecord,
  EventRecord,
  LedgerEngine,
  LineageEdgeRecord,
  LotRecord,
  MovementRecord,
} from "@ankuaru/engine";
import { prisma } from "./client.js";
import { ensurePrismaEnginePath } from "./engine-path.js";
import { isDatabaseConfigured } from "./flush.js";
import {
  mapActors,
  mapCapacities,
  mapCheckpoints,
  mapDiscrepancies,
  mapEvents,
  mapFacilities,
  mapLineage,
  mapLots,
  mapMovements,
} from "./mappers.js";

export type SyncOptions = {
  preferredTraceLotId?: string | null;
  /** Only process events at/after this index (engine.getEvents() order). */
  sinceEventIndex?: number;
};

function collectDeltaIds(newEvents: EventRecord[]) {
  const lotIds = new Set<string>();
  const actorIds = new Set<string>();
  const movementIds = new Set<string>();

  for (const e of newEvents) {
    if (e.actorId) actorIds.add(e.actorId);
    for (const id of e.affectedObjectIds) {
      lotIds.add(id);
      actorIds.add(id);
      movementIds.add(id);
    }
    const p = e.payload ?? {};
    const nestedActor = p.actor as {
      actorId?: string;
      sponsorActorId?: string | null;
    } | undefined;
    if (nestedActor?.actorId) actorIds.add(nestedActor.actorId);
    if (nestedActor?.sponsorActorId) actorIds.add(nestedActor.sponsorActorId);
    for (const key of [
      "actorId",
      "lotId",
      "newOwnerActorId",
      "toActorId",
      "fromActorId",
      "supplierActorId",
      "sponsorActorId",
      "movementId",
      "parentLotId",
      "facilityActorId",
    ] as const) {
      const v = p[key];
      if (typeof v === "string") {
        if (key.includes("lot") || key === "lotId" || key === "parentLotId") lotIds.add(v);
        else if (key === "movementId") movementIds.add(v);
        else actorIds.add(v);
      }
    }
    if (Array.isArray(p.parentLotIds)) {
      for (const id of p.parentLotIds) if (typeof id === "string") lotIds.add(id);
    }
    if (Array.isArray(p.inputLotIds)) {
      for (const id of p.inputLotIds) if (typeof id === "string") lotIds.add(id);
    }
    if (Array.isArray(p.childLotIds)) {
      for (const id of p.childLotIds) if (typeof id === "string") lotIds.add(id);
    }
  }

  return { lotIds, actorIds, movementIds };
}

async function upsertActors(engine: LedgerEngine, seed: ActorRecord[]) {
  // Include full sponsor chains so FKs always resolve
  const byId = new Map<string, ActorRecord>();
  const queue = [...seed];
  while (queue.length) {
    const a = queue.pop()!;
    if (byId.has(a.actorId)) continue;
    byId.set(a.actorId, a);
    if (a.sponsorActorId) {
      const sponsor = engine.getActors().find((x) => x.actorId === a.sponsorActorId);
      if (sponsor && !byId.has(sponsor.actorId)) queue.push(sponsor);
    }
  }

  // Sponsors before sponsored
  const remaining = new Set(byId.keys());
  const ordered: ActorRecord[] = [];
  while (remaining.size) {
    let progressed = false;
    for (const id of [...remaining]) {
      const a = byId.get(id)!;
      if (!a.sponsorActorId || !remaining.has(a.sponsorActorId)) {
        ordered.push(a);
        remaining.delete(id);
        progressed = true;
      }
    }
    if (!progressed) {
      for (const id of remaining) ordered.push(byId.get(id)!);
      break;
    }
  }

  // Phase 1: ensure every row exists (sponsor cleared)
  for (const row of mapActors(ordered)) {
    await prisma.actor.upsert({
      where: { id: row.id },
      create: row,
      update: {
        actorType: row.actorType,
        displayName: row.displayName,
        legalIdentityRef: row.legalIdentityRef,
        status: row.status,
        metadata: row.metadata,
      },
    });
  }

  // Phase 2: set sponsors only when parent row exists
  for (const a of ordered) {
    if (!a.sponsorActorId) continue;
    const parentOk =
      byId.has(a.sponsorActorId) ||
      Boolean(
        await prisma.actor.findUnique({
          where: { id: a.sponsorActorId },
          select: { id: true },
        }),
      );
    if (!parentOk) {
      console.warn(
        `[sync] skip sponsor for ${a.actorId}: missing parent ${a.sponsorActorId}`,
      );
      continue;
    }
    await prisma.actor.update({
      where: { id: a.actorId },
      data: { sponsorActorId: a.sponsorActorId },
    });
  }

  // Capacities: upsert only — never deleteMany (a failed create after delete wiped roles)
  const caps = mapCapacities(ordered);
  if (caps.length) {
    await prisma.actorCapacity.createMany({ data: caps, skipDuplicates: true });
  }

  return ordered;
}

async function upsertLots(lots: LotRecord[]) {
  for (const row of mapLots(lots)) {
    await prisma.lot.upsert({
      where: { id: row.id },
      create: row,
      update: {
        displayCode: row.displayCode,
        processingState: row.processingState,
        processingRoute: row.processingRoute,
        status: row.status,
        canonicalMassKg: row.canonicalMassKg,
        availableKg: row.availableKg,
        ownerActorId: row.ownerActorId,
        custodianActorId: row.custodianActorId,
        locationId: row.locationId,
        originLocationId: row.originLocationId,
        cropYear: row.cropYear,
        cropYearComposition: row.cropYearComposition,
        originStatus: row.originStatus,
        createdEventId: row.createdEventId,
        provenance: row.provenance,
        inactiveEventId: row.inactiveEventId,
        inTransit: row.inTransit,
        moisturePct: row.moisturePct,
        transactionChannel: row.transactionChannel,
      },
    });
  }
}

async function upsertLineage(edges: LineageEdgeRecord[]) {
  for (const row of mapLineage(edges)) {
    await prisma.lineageEdge.upsert({
      where: {
        parentLotId_childLotId: {
          parentLotId: row.parentLotId,
          childLotId: row.childLotId,
        },
      },
      create: row,
      update: {
        contributionKg: row.contributionKg,
        proportion: row.proportion,
        eventId: row.eventId,
      },
    });
  }
}

async function upsertMovements(movements: MovementRecord[]) {
  for (const row of mapMovements(movements)) {
    await prisma.movement.upsert({
      where: { id: row.id },
      create: row,
      update: {
        lotId: row.lotId,
        fromActorId: row.fromActorId,
        toActorId: row.toActorId,
        senderDeclaredKg: row.senderDeclaredKg,
        receiverDeclaredKg: row.receiverDeclaredKg,
        destinationLocationId: row.destinationLocationId,
        state: row.state,
        dispatchEventId: row.dispatchEventId,
        receiptEventId: row.receiptEventId,
      },
    });
  }
}

/**
 * Persist only new events and the actors/lots/movements they touch.
 * Pass `sinceEventIndex` from the previous sync (0 = full entity set for those events only).
 */
export async function syncWorldToDb(
  engine: LedgerEngine,
  opts: SyncOptions = {},
): Promise<{ eventsWritten: number; nextEventIndex: number }> {
  if (!isDatabaseConfigured()) {
    throw new Error("database not configured: set DATABASE_URL");
  }
  ensurePrismaEnginePath();

  const events = engine.getEvents();
  const since = Math.max(0, opts.sinceEventIndex ?? 0);
  const newEvents = events.slice(since);
  const nextEventIndex = events.length;

  if (newEvents.length === 0) {
    await prisma.displaySequence.upsert({
      where: { id: "lot" },
      create: { id: "lot", nextVal: engine.getLotSeq() },
      update: { nextVal: engine.getLotSeq() },
    });
    await prisma.appMeta.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        preferredTraceLotId: opts.preferredTraceLotId ?? null,
        lastHash: engine.getLastHash(),
      },
      update: {
        preferredTraceLotId: opts.preferredTraceLotId ?? null,
        lastHash: engine.getLastHash(),
      },
    });
    return { eventsWritten: 0, nextEventIndex };
  }

  const { lotIds, actorIds, movementIds } = collectDeltaIds(newEvents);

  // Actors: known IDs plus any actor not already in DB that appears in engine
  // (onboard creates actor then event — id is in affectedObjectIds / payload)
  const seedActors = engine
    .getActors()
    .filter(
      (a) =>
        actorIds.has(a.actorId) ||
        (a.sponsorActorId != null && actorIds.has(a.sponsorActorId)),
    );

  const actors = await upsertActors(engine, seedActors);

  for (const a of actors) {
    const fac = engine.getFacilities().find((f) => f.actorId === a.actorId);
    if (fac) {
      const [row] = mapFacilities([fac]);
      if (row) {
        await prisma.facility.upsert({
          where: { actorId: row.actorId },
          create: row,
          update: { capabilities: row.capabilities },
        });
      }
    }
  }

  const lots = engine.getLots().filter((l) => lotIds.has(l.lotId));
  await upsertLots(lots);

  const lineage = engine
    .getLineage()
    .filter((e) => lotIds.has(e.parentLotId) || lotIds.has(e.childLotId));
  await upsertLineage(lineage);

  const movements = engine
    .getMovements()
    .filter((m) => movementIds.has(m.movementId) || lotIds.has(m.lotId));
  await upsertMovements(movements);

  const discrepancies = engine
    .getDiscrepancies()
    .filter((d) => movementIds.has(d.movementId));
  for (const row of mapDiscrepancies(discrepancies)) {
    await prisma.discrepancy.upsert({
      where: { movementId: row.movementId },
      create: row,
      update: {
        senderKg: row.senderKg,
        receiverKg: row.receiverKg,
        deltaKg: row.deltaKg,
        status: row.status,
      },
    });
  }

  const revokedUserIds = newEvents
    .filter((e) => e.eventType === "user_revoked")
    .map((e) => String(e.payload.userId));
  for (const u of engine.getUsers().filter((x) => revokedUserIds.includes(x.userId))) {
    await prisma.user.updateMany({ where: { id: u.userId }, data: { status: u.status } });
  }

  const existing = await prisma.event.findMany({
    where: { eventId: { in: newEvents.map((e) => e.eventId) } },
    select: { eventId: true },
  });
  const have = new Set(existing.map((e) => e.eventId));
  const toWrite = newEvents.filter((e) => !have.has(e.eventId));
  if (toWrite.length) {
    await prisma.event.createMany({
      data: mapEvents(toWrite),
      skipDuplicates: true,
    });
    await prisma.checkpoint.createMany({
      data: mapCheckpoints(toWrite),
      skipDuplicates: true,
    });
  }

  await prisma.displaySequence.upsert({
    where: { id: "lot" },
    create: { id: "lot", nextVal: engine.getLotSeq() },
    update: { nextVal: engine.getLotSeq() },
  });

  await prisma.appMeta.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      preferredTraceLotId: opts.preferredTraceLotId ?? null,
      lastHash: engine.getLastHash(),
    },
    update: {
      preferredTraceLotId: opts.preferredTraceLotId ?? null,
      lastHash: engine.getLastHash(),
    },
  });

  return { eventsWritten: toWrite.length, nextEventIndex };
}
