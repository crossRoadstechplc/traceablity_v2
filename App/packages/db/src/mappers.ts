/**
 * Map engine records → Prisma createMany rows (shared by seed-db + flush).
 */
import type { Prisma } from "@prisma/client";
import type {
  ActorRecord,
  DiscrepancyRecord,
  EventRecord,
  FacilityRecord,
  LineageEdgeRecord,
  LotRecord,
  MovementRecord,
  UserRecord,
} from "@ankuaru/engine";
import { randomUUID } from "node:crypto";

export function mapActors(actors: ActorRecord[]) {
  return actors.map((a) => ({
    id: a.actorId,
    actorType: a.actorType as never,
    displayName: a.displayName,
    legalIdentityRef: a.legalIdentityRef,
    status: a.status as never,
    sponsorActorId: null as string | null,
    metadata: a.metadata as Prisma.InputJsonValue,
  }));
}

export function mapCapacities(actors: ActorRecord[]) {
  return actors.flatMap((a) =>
    a.capacities.map((cap) => ({
      actorId: a.actorId,
      capacity: cap as never,
    })),
  );
}

export function mapFacilitiesFromActors(actors: ActorRecord[]) {
  return actors
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
}

export function mapFacilities(facilities: FacilityRecord[]) {
  return facilities.map((f) => ({
    actorId: f.actorId,
    capabilities: f.capabilities,
  }));
}

export function mapUsers(users: UserRecord[]) {
  return users.map((u) => ({
    id: u.userId,
    displayName: u.displayName,
    email: u.email ?? null,
    status: u.status,
  }));
}

export function mapMemberships(users: UserRecord[]) {
  return users.flatMap((u) =>
    u.actorIds.map((actorId, i) => ({
      userId: u.userId,
      actorId,
      isPrimary: i === 0,
    })),
  );
}

/** Demo users when engine has none yet (CLI seed path). */
export function mapDemoUsersFromActors(actors: ActorRecord[]) {
  const demoActors = actors.filter((x) => x.metadata.demoSelectable === "true");
  const users = demoActors.map((a) => ({
    id: randomUUID(),
    displayName: `${a.displayName} Operator`,
    email: `${a.legalIdentityRef.toLowerCase().replace(/[^a-z0-9-]/g, "")}@demo.local`,
  }));
  const memberships = demoActors.map((a, i) => ({
    userId: users[i]!.id,
    actorId: a.actorId,
    isPrimary: true,
  }));
  return { users, memberships };
}

export function mapLots(lots: LotRecord[]) {
  return lots.map((l) => ({
    id: l.lotId,
    displayCode: l.displayCode,
    processingState: l.processingState as never,
    processingRoute: l.processingRoute as never,
    status: (l.status === "exported" ||
    l.status === "destroyed" ||
    l.status === "fully_consumed" ||
    l.status === "inactive"
      ? l.status
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
  }));
}

export function mapLineage(edges: LineageEdgeRecord[]) {
  return edges.map((e) => ({
    parentLotId: e.parentLotId,
    childLotId: e.childLotId,
    contributionKg: e.contributionKg,
    proportion: e.proportion,
    eventId: e.eventId,
  }));
}

export function mapMovements(movements: MovementRecord[]) {
  return movements.map((m) => ({
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
  }));
}

export function mapDiscrepancies(rows: DiscrepancyRecord[]) {
  return rows.map((d) => ({
    id: randomUUID(),
    movementId: d.movementId,
    senderKg: d.senderKg,
    receiverKg: d.receiverKg,
    deltaKg: d.deltaKg,
    status: d.status,
  }));
}

export function mapEvents(events: EventRecord[]) {
  return events.map((e) => ({
    eventId: e.eventId,
    eventType: e.eventType,
    schemaVersion: e.schemaVersion,
    actorId: e.actorId,
    actingCapacity: e.actingCapacity,
    userId: isUuid(e.userId) ? e.userId : undefined,
    deviceId: e.deviceId,
    affectedObjectIds: e.affectedObjectIds.filter(isUuid),
    eventTimeActual: new Date(e.eventTimeActual),
    eventTimeRecorded: new Date(e.eventTimeRecorded),
    serverCommitTime: new Date(e.serverCommitTime),
    sourceChannel: (e.sourceChannel || "api") as never,
    retrospectiveFlag: e.retrospectiveFlag,
    payload: e.payload as Prisma.InputJsonValue,
    integrityHash: e.integrityHash,
    correctsEventId: e.correctsEventId,
  }));
}

function isUuid(v: string | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export function mapCheckpoints(events: EventRecord[]) {
  return events.map((e) => ({
    sequence: BigInt(e.sequence),
    eventId: e.eventId,
    chainHash: e.integrityHash,
  }));
}

/** Tables truncated before a full replace (order-independent with CASCADE). */
export const SIMULATOR_TRUNCATE_SQL = `
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
    "app_meta",
    integrity.checkpoints
  RESTART IDENTITY CASCADE;
`;
