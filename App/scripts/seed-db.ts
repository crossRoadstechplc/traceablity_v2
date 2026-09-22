/**
 * Seed Supabase with the CORE §11 eight-site world via Prisma.
 * Batched writes + DIRECT_URL (session) to avoid pooler timeouts.
 * Usage: pnpm db:seed
 */
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { seedWorld, serializeSeed } from "@ankuaru/seed";

// Prefer session/direct connection for bulk seed (avoids PgBouncer idle cuts)
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url } },
});

async function chunkedCreateMany<T>(
  label: string,
  rows: T[],
  write: (batch: T[]) => Promise<unknown>,
  size = 50,
) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    let attempt = 0;
    for (;;) {
      try {
        await write(batch);
        break;
      } catch (e) {
        attempt++;
        if (attempt >= 4) throw e;
        console.warn(`${label} batch ${i} retry ${attempt}…`, (e as Error).message);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if ((i / size) % 5 === 0 || i + size >= rows.length) {
      console.log(`  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}`);
    }
  }
}

async function main() {
  console.log("Using", url?.replace(/:[^:@]+@/, ":****@"));
  console.log("Seeding in-memory world…");
  const result = seedWorld();
  const data = serializeSeed(result);
  console.log(
    JSON.stringify(
      {
        actors: data.actors.length,
        lots: data.lots.length,
        events: data.events.length,
        preferredTraceLotId: data.preferredTraceLotId,
        integrity: data.integrity,
      },
      null,
      2,
    ),
  );

  console.log("Clearing prior simulator rows…");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "obligation_handovers",
      "obligations",
      "issues",
      "notifications",
      "delivery_preferences",
      "audit_packages",
      "reports",
      "regulator_access_logs",
      "recovery_exceptions",
      "scheme_volume_claims",
      "submissions",
      "compliance_assessments",
      "requirements",
      "framework_versions",
      "frameworks",
      "verification_events",
      "revocation_events",
      "evidence_items",
      "geometry_overlays",
      "geometry_versions",
      "farm_units",
      "farms",
      "stocktakes",
      "by_products",
      "shinto_passes",
      "discrepancies",
      "movements",
      "contracts",
      "price_bands",
      "drivers",
      "vehicles",
      "lineage_edges",
      "lots",
      "facilities",
      "delegations",
      "credentials",
      "credential_requirements",
      "actor_memberships",
      "actor_capacities",
      "actors",
      "users",
      "block_rule_registry",
      "model_registry",
      "display_sequences",
      "events",
      integrity.checkpoints
    RESTART IDENTITY CASCADE;
  `);

  console.log("Writing actors…");
  await chunkedCreateMany(
    "actors",
    data.actors.map((a) => ({
      id: a.actorId,
      actorType: a.actorType as never,
      displayName: a.displayName,
      legalIdentityRef: a.legalIdentityRef,
      status: a.status as never,
      sponsorActorId: null as string | null,
      metadata: a.metadata as Prisma.InputJsonValue,
    })),
    (batch) => prisma.actor.createMany({ data: batch }),
  );

  // Sponsors in a second pass
  for (const a of data.actors) {
    if (a.sponsorActorId) {
      await prisma.actor.update({
        where: { id: a.actorId },
        data: { sponsorActorId: a.sponsorActorId },
      });
    }
  }

  const capacities = data.actors.flatMap((a) =>
    a.capacities.map((cap) => ({
      actorId: a.actorId,
      capacity: cap as never,
    })),
  );
  await chunkedCreateMany(
    "capacities",
    capacities,
    (batch) => prisma.actorCapacity.createMany({ data: batch }),
  );

  const facilities = data.actors
    .filter(
      (a) =>
        a.actorType === "washing_station" ||
        a.actorType === "mill" ||
        a.actorType === "akrabi",
    )
    .map((a) => ({
      actorId: a.actorId,
      capabilities:
        a.actorType === "mill"
          ? ["dry_milling", "natural_processing"]
          : ["wet_milling", "washed_processing"],
    }));
  await chunkedCreateMany(
    "facilities",
    facilities,
    (batch) => prisma.facility.createMany({ data: batch }),
  );

  console.log("Writing demo users…");
  const demoActors = data.actors.filter((x) => x.metadata.demoSelectable === "true");
  const users = demoActors.map((a) => ({
    id: randomUUID(),
    displayName: `${a.displayName} Operator`,
    email: `${a.legalIdentityRef.toLowerCase().replace(/[^a-z0-9-]/g, "")}@demo.local`,
  }));
  await chunkedCreateMany("users", users, (batch) =>
    prisma.user.createMany({ data: batch }),
  );
  const memberships = demoActors.map((a, i) => ({
    userId: users[i]!.id,
    actorId: a.actorId,
    isPrimary: true,
  }));
  await chunkedCreateMany("memberships", memberships, (batch) =>
    prisma.actorMembership.createMany({ data: batch }),
  );

  console.log("Writing lots…");
  await chunkedCreateMany(
    "lots",
    data.lots.map((l) => ({
      id: l.lotId,
      displayCode: l.displayCode,
      processingState: l.processingState as never,
      processingRoute: l.processingRoute as never,
      status: (l.status === "exported" || l.status === "destroyed"
        ? l.status
        : l.status === "inactive"
          ? "inactive"
          : "active") as never,
      canonicalMassKg: l.canonicalMassKg,
      availableKg: l.availableKg,
      originalUnit: l.originalUnit,
      originalQuantity: l.originalQuantity,
      conversionBasis: l.conversionBasis,
      ownerActorId: l.ownerActorId,
      custodianActorId: l.custodianActorId,
      locationId: l.locationId,
      originLocationId: l.originLocationId,
      cropYear: l.cropYear,
      cropYearComposition: l.cropYearComposition as Prisma.InputJsonValue,
      originStatus: l.originStatus,
      createdByActorId: l.createdByActorId,
      createdEventId: l.createdEventId,
      provenance: l.provenance as Prisma.InputJsonValue,
      inactiveEventId: l.inactiveEventId,
      inTransit: l.inTransit,
      moisturePct: l.moisturePct,
    })),
    (batch) => prisma.lot.createMany({ data: batch }),
    40,
  );

  console.log("Writing lineage…");
  await chunkedCreateMany(
    "lineage",
    data.lineage.map((e) => ({
      parentLotId: e.parentLotId,
      childLotId: e.childLotId,
      contributionKg: e.contributionKg,
      proportion: e.proportion,
      eventId: e.eventId,
    })),
    (batch) => prisma.lineageEdge.createMany({ data: batch }),
  );

  console.log("Writing movements…");
  await chunkedCreateMany(
    "movements",
    data.movements.map((m) => ({
      id: m.movementId,
      lotId: m.lotId,
      fromActorId: m.fromActorId,
      toActorId: m.toActorId,
      senderDeclaredKg: m.senderDeclaredKg,
      receiverDeclaredKg: m.receiverDeclaredKg,
      destinationLocationId: m.destinationLocationId,
      state: m.state as never,
      dispatchEventId: m.dispatchEventId,
      receiptEventId: m.receiptEventId,
    })),
    (batch) => prisma.movement.createMany({ data: batch }),
  );

  console.log("Writing events…");
  await chunkedCreateMany(
    "events",
    data.events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      schemaVersion: e.schemaVersion,
      actorId: e.actorId,
      actingCapacity: e.actingCapacity,
      userId: e.userId,
      deviceId: e.deviceId,
      affectedObjectIds: e.affectedObjectIds,
      eventTimeActual: new Date(e.eventTimeActual),
      eventTimeRecorded: new Date(e.eventTimeRecorded),
      serverCommitTime: new Date(e.serverCommitTime),
      sourceChannel: (e.sourceChannel || "api") as never,
      retrospectiveFlag: e.retrospectiveFlag,
      payload: e.payload as Prisma.InputJsonValue,
      integrityHash: e.integrityHash,
      correctsEventId: e.correctsEventId,
    })),
    (batch) => prisma.event.createMany({ data: batch }),
    40,
  );

  console.log("Writing integrity checkpoints…");
  await chunkedCreateMany(
    "checkpoints",
    data.events.map((e) => ({
      sequence: BigInt(e.sequence),
      eventId: e.eventId,
      chainHash: e.integrityHash,
    })),
    (batch) => prisma.checkpoint.createMany({ data: batch }),
    40,
  );

  await prisma.displaySequence.create({
    data: { id: "lot", nextVal: data.lots.length + 1 },
  });

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

  const counts = {
    actors: await prisma.actor.count(),
    lots: await prisma.lot.count(),
    events: await prisma.event.count(),
    checkpoints: await prisma.checkpoint.count(),
    lineage: await prisma.lineageEdge.count(),
    movements: await prisma.movement.count(),
    preferredTraceLotId: data.preferredTraceLotId,
  };
  console.log("Seed complete:", JSON.stringify(counts, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
