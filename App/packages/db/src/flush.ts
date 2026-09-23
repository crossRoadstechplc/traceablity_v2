/**
 * Full-world replace into Postgres (Phase 1 CORE spine).
 * Prefer DIRECT_URL for bulk writes (same as CLI seed).
 */
import { PrismaClient } from "@prisma/client";
import type { LedgerEngine } from "@ankuaru/engine";
import { chunkedCreateMany } from "./chunk.js";
import { ensurePrismaEnginePath } from "./engine-path.js";
import {
  SIMULATOR_TRUNCATE_SQL,
  mapActors,
  mapCapacities,
  mapCheckpoints,
  mapDemoUsersFromActors,
  mapDiscrepancies,
  mapEvents,
  mapFacilities,
  mapFacilitiesFromActors,
  mapLineage,
  mapLots,
  mapMemberships,
  mapMovements,
  mapUsers,
} from "./mappers.js";

export type FlushOptions = {
  preferredTraceLotId?: string | null;
  /** When true (default for Reseed), also truncate simulator_sessions. */
  clearSessions?: boolean;
  log?: (msg: string) => void;
  client?: PrismaClient;
};

function directClient(): PrismaClient {
  ensurePrismaEnginePath();
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  return new PrismaClient({
    datasources: { db: { url } },
  });
}

export function isDatabaseConfigured(): boolean {
  // Ensure App/.env was loaded when Next cwd is apps/web
  try {
    // side-effect import path already ran loadMonorepoEnv via getPrisma/client
  } catch {
    /* ignore */
  }
  return Boolean(process.env.DATABASE_URL || process.env.DIRECT_URL);
}

export async function replaceSimulatorWorld(
  engine: LedgerEngine,
  opts: FlushOptions = {},
): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error("database not configured: set DATABASE_URL (and DIRECT_URL for bulk writes)");
  }

  const ownClient = !opts.client;
  const prisma = opts.client ?? directClient();
  const log = opts.log ?? (() => {});
  const clearSessions = opts.clearSessions ?? false;

  try {
    log("Clearing prior simulator rows…");
    await prisma.$executeRawUnsafe(SIMULATOR_TRUNCATE_SQL);
    if (clearSessions) {
      try {
        await prisma.simulatorSession.deleteMany();
      } catch {
        /* table may not exist until migrate */
      }
    }

    const actors = engine.getActors();
    const lots = engine.getLots();
    const events = engine.getEvents();
    const lineage = engine.getLineage();
    const movements = engine.getMovements();
    const facilities = engine.getFacilities();
    const users = engine.getUsers();
    const discrepancies = engine.getDiscrepancies();
    const lotSeq = engine.getLotSeq();
    const lastHash = engine.getLastHash();

    log("Writing actors…");
    await chunkedCreateMany(
      "actors",
      mapActors(actors),
      (batch) => prisma.actor.createMany({ data: batch }),
      50,
      log,
    );

    for (const a of actors) {
      if (a.sponsorActorId) {
        await prisma.actor.update({
          where: { id: a.actorId },
          data: { sponsorActorId: a.sponsorActorId },
        });
      }
    }

    await chunkedCreateMany(
      "capacities",
      mapCapacities(actors),
      (batch) => prisma.actorCapacity.createMany({ data: batch }),
      50,
      log,
    );

    const facilityRows =
      facilities.length > 0 ? mapFacilities(facilities) : mapFacilitiesFromActors(actors);
    await chunkedCreateMany(
      "facilities",
      facilityRows,
      (batch) => prisma.facility.createMany({ data: batch }),
      50,
      log,
    );

    log("Writing users…");
    if (users.length > 0) {
      await chunkedCreateMany(
        "users",
        mapUsers(users),
        (batch) => prisma.user.createMany({ data: batch }),
        50,
        log,
      );
      await chunkedCreateMany(
        "memberships",
        mapMemberships(users),
        (batch) => prisma.actorMembership.createMany({ data: batch }),
        50,
        log,
      );
    } else {
      const demo = mapDemoUsersFromActors(actors);
      await chunkedCreateMany(
        "users",
        demo.users,
        (batch) => prisma.user.createMany({ data: batch }),
        50,
        log,
      );
      await chunkedCreateMany(
        "memberships",
        demo.memberships,
        (batch) => prisma.actorMembership.createMany({ data: batch }),
        50,
        log,
      );
    }

    log("Writing lots…");
    await chunkedCreateMany(
      "lots",
      mapLots(lots),
      (batch) => prisma.lot.createMany({ data: batch }),
      40,
      log,
    );

    await chunkedCreateMany(
      "lineage",
      mapLineage(lineage),
      (batch) => prisma.lineageEdge.createMany({ data: batch }),
      50,
      log,
    );

    await chunkedCreateMany(
      "movements",
      mapMovements(movements),
      (batch) => prisma.movement.createMany({ data: batch }),
      50,
      log,
    );

    if (discrepancies.length > 0) {
      await chunkedCreateMany(
        "discrepancies",
        mapDiscrepancies(discrepancies),
        (batch) => prisma.discrepancy.createMany({ data: batch }),
        50,
        log,
      );
    }

    log("Writing events…");
    await chunkedCreateMany(
      "events",
      mapEvents(events),
      (batch) => prisma.event.createMany({ data: batch }),
      40,
      log,
    );

    await chunkedCreateMany(
      "checkpoints",
      mapCheckpoints(events),
      (batch) => prisma.checkpoint.createMany({ data: batch }),
      40,
      log,
    );

    await prisma.displaySequence.create({
      data: { id: "lot", nextVal: lotSeq },
    });

    await prisma.appMeta.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        preferredTraceLotId: opts.preferredTraceLotId ?? null,
        lastHash,
      },
      update: {
        preferredTraceLotId: opts.preferredTraceLotId ?? null,
        lastHash,
      },
    });

    // Seed-only extras (idempotent-ish; ignored if already present from truncate)
    await prisma.credentialRequirement.create({
      data: {
        capacity: "Exporter",
        regionCode: null,
        criteria: {
          infrastructure: true,
          personnel: true,
          labAccess: true,
          taxLegal: true,
          source: "REG-D02-01",
        },
        authorityTag: "LEGAL_REQUIREMENT",
        sourceRef: "Directive 02/2012 Art. 3",
      },
    });

    await prisma.priceBand.create({
      data: {
        asOfDate: new Date(),
        maxEtb: 200,
        minEtb: 170,
        premiumPct: 5,
      },
    });
  } finally {
    if (ownClient) await prisma.$disconnect();
  }
}
