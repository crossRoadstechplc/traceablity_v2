import { createHash, randomUUID } from "node:crypto";
import {
  type ActorType,
  type CapacityCode,
  type CoffeeState,
  type ProcessingRoute,
  EngineError,
  INTAKE_MATRIX,
  LOSS_ELIGIBLE_STATES,
  MOISTURE_MAX,
  MOISTURE_MIN,
  ONBOARD_MATRIX,
  SEND_MATRIX,
  massesEqual,
  roundMass,
} from "@ankuaru/schema";

export type Session = {
  userId: string;
  actorId: string;
  capacity: CapacityCode;
  deviceId?: string;
  sourceChannel?:
    | "web"
    | "mobile_online"
    | "mobile_offline_sync"
    | "api"
    | "retrospective";
  channelDetail?: "ussd";
};

export type ActorRecord = {
  actorId: string;
  actorType: ActorType;
  displayName: string;
  legalIdentityRef: string;
  status: "active" | "inactive";
  sponsorActorId: string | null;
  metadata: Record<string, string>;
  capacities: CapacityCode[];
};

export type UserRecord = {
  userId: string;
  displayName: string;
  email?: string;
  status: "active" | "revoked";
  actorIds: string[];
};

export type LotRecord = {
  lotId: string;
  displayCode: string;
  processingState: CoffeeState;
  processingRoute: ProcessingRoute;
  status: "active" | "inactive" | "exported" | "destroyed" | "fully_consumed";
  canonicalMassKg: number;
  availableKg: number;
  originalUnit?: string;
  originalQuantity?: number;
  conversionBasis?: string;
  ownerActorId: string;
  custodianActorId: string;
  locationId?: string;
  originLocationId?: string;
  cropYear?: string;
  cropYearComposition: Record<string, number>;
  originStatus?: string;
  createdByActorId?: string;
  createdEventId: string;
  provenance: Record<string, number>;
  inactiveEventId?: string;
  inTransit: boolean;
  moisturePct?: number;
  transactionChannel?: string;
};

export type LineageEdgeRecord = {
  parentLotId: string;
  childLotId: string;
  contributionKg: number;
  proportion: number;
  eventId: string;
};

export type MovementRecord = {
  movementId: string;
  lotId: string;
  fromActorId: string;
  toActorId: string;
  senderDeclaredKg: number;
  receiverDeclaredKg?: number;
  destinationLocationId?: string;
  state:
    | "pending"
    | "received_clean"
    | "received_discrepant"
    | "receipt_overdue"
    | "quarantined";
  dispatchEventId: string;
  receiptEventId?: string;
  shinto?: {
    weightKg: number;
    volume?: number;
    grade: string;
    lotDisplayCode: string;
    sealStatusOrigin: string;
  };
};

export type DiscrepancyRecord = {
  movementId: string;
  senderKg: number;
  receiverKg: number;
  deltaKg: number;
  status: "open" | "resolved";
};

export type EventRecord = {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  actorId?: string;
  actingCapacity?: string;
  userId?: string;
  deviceId?: string;
  affectedObjectIds: string[];
  eventTimeActual: string;
  eventTimeRecorded: string;
  serverCommitTime: string;
  sourceChannel: string;
  channelDetail?: string;
  retrospectiveFlag: boolean;
  payload: Record<string, unknown>;
  integrityHash: string;
  correctsEventId?: string;
  sequence: number;
};

export type FacilityRecord = {
  actorId: string;
  capabilities: string[];
};

export type FarmRecord = {
  farmId: string;
  ownerActorId: string;
  displayName: string;
  pointLat?: number;
  pointLng?: number;
};

export type FarmUnitRecord = {
  farmUnitId: string;
  farmId: string;
  displayName: string;
  polygonPending: boolean;
};

export type GeometryVersionRecord = {
  id: string;
  farmUnitId: string;
  version: number;
  geojson?: unknown;
  anomalyFlags: string[];
  usedInCompliance: boolean;
};

export type EvidenceRecord = {
  evidenceId: string;
  attachedType: string;
  attachedId: string;
  evidenceClass: "self_assessment" | "laboratory" | "official_authority";
  documentType: string;
  factSupported: string;
  status: "UPLOADED" | "SYSTEM_VALIDATED" | "VERIFIED" | "EXPIRED" | "SUPERSEDED" | "REVOKED";
  validFrom?: string;
  validTo?: string;
  revokedEffective?: string;
};

export type IssueRecord = {
  issueId: string;
  lifecycle: string;
  intervention: "BLOCK" | "WARN" | "FLAG";
  authorityTag?: string;
  subjectType: string;
  subjectId: string;
  summary: string;
  disposition?: string;
};

export type ObligationRecord = {
  obligationId: string;
  kind: string;
  accountableActorId: string;
  subjectType: string;
  subjectId: string;
  deadline?: string;
  status: string;
  payload: Record<string, unknown>;
};

export type ContractRecord = {
  contractId: string;
  supplierActorId: string;
  exporterActorId: string;
  priceEtbPerKg: number;
  quantityKg: number;
  grade: string;
  coffeeType: string;
  registrationRef: string;
};

export type ByProductRecord = {
  id: string;
  sourceEventId: string;
  kind: string;
  massKg: number;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  category: string;
  title: string;
  body: string;
  triggerRef?: string;
  readAt?: string;
};

export type ReportRecord = {
  reportId: string;
  lotId?: string;
  payload: unknown;
  fingerprint: string;
  superseded: boolean;
};

type World = {
  users: Map<string, UserRecord>;
  actors: Map<string, ActorRecord>;
  lots: Map<string, LotRecord>;
  lineage: LineageEdgeRecord[];
  movements: Map<string, MovementRecord>;
  discrepancies: DiscrepancyRecord[];
  events: EventRecord[];
  facilities: Map<string, FacilityRecord>;
  farms: Map<string, FarmRecord>;
  farmUnits: Map<string, FarmUnitRecord>;
  geometries: GeometryVersionRecord[];
  evidence: Map<string, EvidenceRecord>;
  issues: IssueRecord[];
  obligations: ObligationRecord[];
  contracts: Map<string, ContractRecord>;
  byProducts: ByProductRecord[];
  notifications: NotificationRecord[];
  reports: ReportRecord[];
  stocktakes: Array<{
    id: string;
    facilityActorId: string;
    coffeeState: CoffeeState;
    theoreticalKg: number;
    physicalKg: number;
    varianceKg: number;
  }>;
  schemeClaims: Array<{ lotId: string; scheme: string; claimedKg: number; allowance: boolean }>;
  submissions: Array<{
    id: string;
    status: string;
    payloadSnapshot: unknown;
    rejectionReason?: string;
  }>;
  blockRules: Array<{
    code: string;
    authorityTag: string;
    sourceRef: string;
    scope: string;
    owner: string;
    approvalRef: string;
  }>;
  priceBand: { maxEtb: number; minEtb: number; premiumPct: number };
  credentialMatrixRegional: unknown[];
  lotSeq: number;
  lastHash: string;
  quarantines: Array<{
    id: string;
    quantityKg: number;
    deadline: string;
    accountableActorId: string;
    resolved: boolean;
  }>;
};

function emptyWorld(): World {
  return {
    users: new Map(),
    actors: new Map(),
    lots: new Map(),
    lineage: [],
    movements: new Map(),
    discrepancies: [],
    events: [],
    facilities: new Map(),
    farms: new Map(),
    farmUnits: new Map(),
    geometries: [],
    evidence: new Map(),
    issues: [],
    obligations: [],
    contracts: new Map(),
    byProducts: [],
    notifications: [],
    reports: [],
    stocktakes: [],
    schemeClaims: [],
    submissions: [],
    blockRules: [
      {
        code: "REG-D02-02",
        authorityTag: "LEGAL_REQUIREMENT",
        sourceRef: "Directive 02/2012 Art. 4(1)",
        scope: "processing moisture",
        owner: "ECTA",
        approvalRef: "REG-D02",
      },
      {
        code: "REG-D02-03",
        authorityTag: "LEGAL_REQUIREMENT",
        sourceRef: "Directive 02/2012 Art. 4(3)",
        scope: "blending",
        owner: "ECTA",
        approvalRef: "REG-D02",
      },
    ],
    priceBand: { maxEtb: 200, minEtb: 170, premiumPct: 5 },
    credentialMatrixRegional: [],
    lotSeq: 1,
    lastHash: "genesis",
    quarantines: [],
  };
}

function mixProvenance(
  parts: Array<{ kg: number; provenance: Record<string, number> }>,
): Record<string, number> {
  const total = parts.reduce((s, p) => s + p.kg, 0);
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.provenance)) {
      out[k] = (out[k] ?? 0) + (v * p.kg) / total;
    }
  }
  return out;
}

function mixCropYears(
  parts: Array<{ kg: number; composition: Record<string, number>; cropYear?: string }>,
): Record<string, number> {
  const total = parts.reduce((s, p) => s + p.kg, 0);
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const p of parts) {
    const comp =
      Object.keys(p.composition).length > 0
        ? p.composition
        : p.cropYear
          ? { [p.cropYear]: 1 }
          : {};
    for (const [y, v] of Object.entries(comp)) {
      out[y] = (out[y] ?? 0) + (v * p.kg) / total;
    }
  }
  return out;
}

function wouldCreateCycle(
  lineage: LineageEdgeRecord[],
  parentId: string,
  childId: string,
): boolean {
  if (parentId === childId) return true;
  const children = new Map<string, string[]>();
  for (const e of lineage) {
    const list = children.get(e.parentLotId) ?? [];
    list.push(e.childLotId);
    children.set(e.parentLotId, list);
  }
  const stack = [childId];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === parentId) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const c of children.get(n) ?? []) stack.push(c);
  }
  return false;
}

export class LedgerEngine {
  private w: World = emptyWorld();

  snapshot(): World {
    return this.w;
  }

  loadWorld(partial: Partial<World> & { actors?: ActorRecord[]; lots?: LotRecord[] }): void {
    if (partial.actors) {
      for (const a of partial.actors) this.w.actors.set(a.actorId, a);
    }
    if (partial.lots) {
      for (const l of partial.lots) this.w.lots.set(l.lotId, l);
    }
  }

  reset(): void {
    this.w = emptyWorld();
  }

  private nextLotCode(): string {
    const n = this.w.lotSeq++;
    return `L-${String(n).padStart(3, "0")}`;
  }

  private assertCapacity(session: Session, allowed: CapacityCode[]): void {
    const user = this.w.users.get(session.userId);
    if (user && user.status === "revoked") {
      throw new EngineError("AUTH-CAPACITY", "User access revoked for new actions");
    }
    const actor = this.w.actors.get(session.actorId);
    if (!actor || actor.status !== "active") {
      throw new EngineError("AUTH-CAPACITY", "Actor not active");
    }
    if (!actor.capacities.includes(session.capacity)) {
      throw new EngineError(
        "AUTH-CAPACITY",
        `Actor lacks capacity ${session.capacity}`,
      );
    }
    if (!allowed.includes(session.capacity)) {
      throw new EngineError(
        "AUTH-CAPACITY",
        `Capacity ${session.capacity} not authorized for this action`,
      );
    }
  }

  private commitEvent(
    session: Session,
    eventType: string,
    payload: Record<string, unknown>,
    affected: string[],
    opts?: { correctsEventId?: string; eventTimeActual?: string },
  ): EventRecord {
    const eventId = randomUUID();
    const now = new Date().toISOString();
    const actual = opts?.eventTimeActual ?? now;
    const body = JSON.stringify({
      eventId,
      eventType,
      payload,
      prev: this.w.lastHash,
    });
    const integrityHash = createHash("sha256").update(body).digest("hex");
    const ev: EventRecord = {
      eventId,
      eventType,
      schemaVersion: "1.0",
      actorId: session.actorId,
      actingCapacity: session.capacity,
      userId: session.userId,
      deviceId: session.deviceId,
      affectedObjectIds: affected,
      eventTimeActual: actual,
      eventTimeRecorded: now,
      serverCommitTime: now,
      sourceChannel: session.sourceChannel ?? "web",
      channelDetail: session.channelDetail,
      retrospectiveFlag: false,
      payload,
      integrityHash,
      correctsEventId: opts?.correctsEventId,
      sequence: this.w.events.length + 1,
    };
    // Idempotent: if same event_id somehow re-submitted (client-provided path)
    if (this.w.events.some((e) => e.eventId === eventId)) return ev;
    this.w.events.push(ev);
    this.w.lastHash = integrityHash;
    return ev;
  }

  /** Reject AI/model writes to canonical records (Module 15 T4) */
  rejectAiWrite(): never {
    throw new EngineError(
      "AI-WRITE-BAN",
      "AI/model components cannot write canonical records",
    );
  }

  createUser(input: {
    displayName: string;
    email?: string;
    userId?: string;
  }): UserRecord {
    const userId = input.userId ?? randomUUID();
    const u: UserRecord = {
      userId,
      displayName: input.displayName,
      email: input.email,
      status: "active",
      actorIds: [],
    };
    this.w.users.set(userId, u);
    return u;
  }

  bindUserToActor(userId: string, actorId: string): void {
    const u = this.w.users.get(userId);
    const a = this.w.actors.get(actorId);
    if (!u || !a) throw new EngineError("AUTH-CAPACITY", "User or Actor not found");
    if (!u.actorIds.includes(actorId)) u.actorIds.push(actorId);
  }

  revokeUser(userId: string): void {
    const u = this.w.users.get(userId);
    if (!u) return;
    u.status = "revoked";
  }

  onboardActor(
    session: Session,
    input: {
      actorType: ActorType;
      displayName: string;
      legalIdentityRef: string;
      sponsorActorId?: string | null;
      metadata?: Record<string, string>;
      capacities?: CapacityCode[];
      facility?: { capabilities: string[] };
    },
  ): ActorRecord {
    this.assertCapacity(session, ["Exporter", "Aggregator", "Collector", "PlatformAdmin"]);
    const acting = this.w.actors.get(session.actorId)!;
    const allowed = ONBOARD_MATRIX[acting.actorType] ?? [];
    if (
      session.capacity !== "PlatformAdmin" &&
      !allowed.includes(input.actorType)
    ) {
      throw new EngineError(
        "AUTH-CAPACITY",
        `${acting.actorType} may not onboard ${input.actorType}`,
      );
    }
    if (input.sponsorActorId && input.sponsorActorId !== session.actorId) {
      // exporter onboards akrabi under self; akrabi under collector etc.
      if (input.sponsorActorId !== acting.actorId) {
        throw new EngineError("AUTH-CAPACITY", "Sponsor must be acting actor");
      }
    }
    const defaultCap: Partial<Record<ActorType, CapacityCode>> = {
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
    const actorId = randomUUID();
    const caps =
      input.capacities ??
      (defaultCap[input.actorType] ? [defaultCap[input.actorType]!] : []);
    const actor: ActorRecord = {
      actorId,
      actorType: input.actorType,
      displayName: input.displayName,
      legalIdentityRef: input.legalIdentityRef,
      status: "active",
      sponsorActorId: input.sponsorActorId ?? session.actorId,
      metadata: {
        ...input.metadata,
        userOnboarded: "true",
      },
      capacities: caps,
    };
    this.w.actors.set(actorId, actor);
    if (input.facility) {
      this.w.facilities.set(actorId, {
        actorId,
        capabilities: input.facility.capabilities,
      });
    }
    if (
      input.actorType === "washing_station" ||
      input.actorType === "mill"
    ) {
      this.w.facilities.set(actorId, {
        actorId,
        capabilities:
          input.facility?.capabilities ??
          (input.actorType === "mill"
            ? ["dry_milling", "natural_processing"]
            : ["wet_milling", "washed_processing"]),
      });
    }
    this.commitEvent(session, "actor_onboarded", { actor }, [actorId]);
    return actor;
  }

  /** Seed/bootstrap without capacity check (platform seed only) */
  seedActor(actor: Omit<ActorRecord, "capacities"> & { capacities?: CapacityCode[] }): ActorRecord {
    const defaultCap: Partial<Record<ActorType, CapacityCode>> = {
      farmer: "Farmer",
      collector: "Collector",
      akrabi: "Aggregator",
      exporter: "Exporter",
      washing_station: "FacilityOperator",
      mill: "FacilityOperator",
    };
    const full: ActorRecord = {
      ...actor,
      capacities:
        actor.capacities ??
        (defaultCap[actor.actorType] ? [defaultCap[actor.actorType]!] : []),
    };
    this.w.actors.set(full.actorId, full);
    return full;
  }

  addCapacity(actorId: string, capacity: CapacityCode): void {
    const a = this.w.actors.get(actorId);
    if (!a) throw new EngineError("AUTH-CAPACITY", "Actor not found");
    if (!a.capacities.includes(capacity)) a.capacities.push(capacity);
  }

  createOriginLot(
    session: Session,
    input: {
      massKg: number;
      processingState?: CoffeeState;
      processingRoute?: ProcessingRoute;
      cropYear?: string;
      locationId?: string;
      farmerActorId?: string;
      originalUnit?: string;
      originalQuantity?: number;
      conversionBasis?: string;
      moisturePct?: number;
    },
  ): LotRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter"]);
    const farmerId = input.farmerActorId ?? session.actorId;
    const farmer = this.w.actors.get(farmerId);
    if (!farmer || farmer.actorType !== "farmer") {
      throw new EngineError("INV-10", "Origin requires a named farmer");
    }
    if (!(input.massKg > 0)) {
      throw new EngineError("INV-07", "Mass must be positive");
    }
    // Farmers never blocked for missing CoC (Module 01 T5)
    const cropYear = input.cropYear ?? "2025-2026";
    const eventId = randomUUID();
    const lotId = randomUUID();
    const originStatus =
      session.actorId === farmerId ? "farmer_verified" : "recorded_by_counterparty";
    const lot: LotRecord = {
      lotId,
      displayCode: this.nextLotCode(),
      processingState: input.processingState ?? "cherry",
      processingRoute: input.processingRoute ?? "unknown_at_origin",
      status: "active",
      canonicalMassKg: roundMass(input.massKg),
      availableKg: roundMass(input.massKg),
      originalUnit: input.originalUnit,
      originalQuantity: input.originalQuantity,
      conversionBasis: input.conversionBasis,
      ownerActorId: farmerId,
      custodianActorId: farmerId,
      locationId: input.locationId ?? "field entry",
      originLocationId: input.locationId ?? "field entry",
      cropYear,
      cropYearComposition: { [cropYear]: 1 },
      originStatus,
      createdByActorId: session.actorId,
      createdEventId: eventId,
      provenance: { [farmerId]: 1 },
      inTransit: false,
      moisturePct: input.moisturePct,
    };
    // Use commit with fixed event id via temporary approach
    const sess = session;
    const ev = this.commitEvent(sess, "origin_lot_created", {
      lotId,
      massKg: lot.canonicalMassKg,
      farmerActorId: farmerId,
      originalUnit: input.originalUnit,
      originalQuantity: input.originalQuantity,
      conversionBasis: input.conversionBasis,
    }, [lotId, farmerId]);
    lot.createdEventId = ev.eventId;
    this.w.lots.set(lotId, lot);
    return lot;
  }

  /**
   * Intake without invented receipts (Module 03 T2 / CORE §0.2).
   * Creates origin under farmer; custody stays with farmer until explicit send/receive.
   */
  createIntakeLot(
    session: Session,
    input: {
      supplierActorId: string;
      massKg: number;
      processingState?: CoffeeState;
      processingRoute?: ProcessingRoute;
      cropYear?: string;
      locationId?: string;
    },
  ): LotRecord {
    this.assertCapacity(session, ["Collector", "Aggregator", "Exporter"]);
    const acting = this.w.actors.get(session.actorId)!;
    const supplier = this.w.actors.get(input.supplierActorId);
    if (!supplier) throw new EngineError("INV-10", "Supplier not found");
    const allowedSuppliers = INTAKE_MATRIX[acting.actorType] ?? [];
    if (!allowedSuppliers.includes(supplier.actorType)) {
      throw new EngineError(
        "AUTH-CAPACITY",
        `${acting.actorType} may not intake from ${supplier.actorType}`,
      );
    }
    if (supplier.sponsorActorId !== session.actorId && acting.actorType !== "exporter") {
      // must be in sponsored tree for collector/akrabi
      if (supplier.sponsorActorId !== acting.actorId) {
        throw new EngineError("AUTH-CAPACITY", "Supplier not in sponsored network");
      }
    }
    const farmerId = this.resolveFarmerOrigin(input.supplierActorId);
    if (!farmerId) throw new EngineError("INV-10", "No farmer in supplier tree");
    const lot = this.createOriginLot(session, {
      ...input,
      farmerActorId: farmerId,
      processingState: input.processingState ?? (acting.actorType === "exporter" ? "green_washed" : "cherry"),
    });
    this.commitEvent(session, "intake_lot_recorded", {
      lotId: lot.lotId,
      supplierActorId: input.supplierActorId,
      farmerActorId: farmerId,
      massKg: input.massKg,
      note: "No fabricated movement receive",
    }, [lot.lotId]);
    return lot;
  }

  private resolveFarmerOrigin(supplierId: string): string | null {
    const s = this.w.actors.get(supplierId);
    if (!s) return null;
    if (s.actorType === "farmer") return s.actorId;
    if (s.actorType === "collector") {
      const farmers = [...this.w.actors.values()].filter(
        (a) => a.sponsorActorId === s.actorId && a.actorType === "farmer",
      );
      return farmers[0]?.actorId ?? null;
    }
    if (s.actorType === "akrabi") {
      const collectors = [...this.w.actors.values()].filter(
        (a) => a.sponsorActorId === s.actorId && a.actorType === "collector",
      );
      const c = collectors[0];
      if (!c) return null;
      return this.resolveFarmerOrigin(c.actorId);
    }
    return null;
  }

  allowedSendTargets(actorId: string): ActorRecord[] {
    const a = this.w.actors.get(actorId);
    if (!a) return [];
    const types = SEND_MATRIX[a.actorType] ?? [];
    return [...this.w.actors.values()].filter((t) => {
      if (!types.includes(t.actorType)) return false;
      if (a.actorType === "farmer") return t.actorId === a.sponsorActorId;
      if (a.actorType === "collector") return t.actorId === a.sponsorActorId;
      if (a.actorType === "akrabi") return t.actorType === "exporter";
      if (a.actorType === "exporter") return t.sponsorActorId === a.actorId && t.actorType === "akrabi";
      return false;
    });
  }

  send(
    session: Session,
    input: {
      lotId: string;
      toActorId: string;
      senderDeclaredKg: number;
      destinationLocationId?: string;
      shinto?: {
        weightKg: number;
        volume?: number;
        grade: string;
        sealStatusOrigin: string;
      };
      requireShinto?: boolean;
    },
  ): MovementRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "Transporter",
      "Driver",
      "WarehouseOperator",
    ]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot || lot.status !== "active") {
      throw new EngineError("INV-04", "Lot must exist and be active");
    }
    if (lot.inTransit) throw new EngineError("INV-09", "Lot is in transit");
    if (lot.custodianActorId !== session.actorId) {
      throw new EngineError("INV-12", "Only current custodian may send");
    }
    const targets = this.allowedSendTargets(session.actorId).map((t) => t.actorId);
    if (!targets.includes(input.toActorId)) {
      throw new EngineError("AUTH-CAPACITY", "Send target not allowed");
    }
    if (input.requireShinto !== false) {
      // Shinto required fields when provided path for transport pass movements
      if (input.shinto) {
        const s = input.shinto;
        if (
          s.weightKg == null ||
          !s.grade ||
          !s.sealStatusOrigin
        ) {
          throw new EngineError(
            "REG-D05-04",
            "Shinto incomplete: weight, grade, seal required",
            "BLOCK",
            "LEGAL_REQUIREMENT",
          );
        }
      }
    }
    const movementId = randomUUID();
    const ev = this.commitEvent(session, "movement_send", {
      movementId,
      lotId: lot.lotId,
      toActorId: input.toActorId,
      senderDeclaredKg: input.senderDeclaredKg,
    }, [lot.lotId, movementId]);
    lot.inTransit = true;
    const mov: MovementRecord = {
      movementId,
      lotId: lot.lotId,
      fromActorId: session.actorId,
      toActorId: input.toActorId,
      senderDeclaredKg: input.senderDeclaredKg,
      destinationLocationId: input.destinationLocationId,
      state: "pending",
      dispatchEventId: ev.eventId,
      shinto: input.shinto
        ? {
            ...input.shinto,
            lotDisplayCode: lot.displayCode,
          }
        : undefined,
    };
    this.w.movements.set(movementId, mov);
    return mov;
  }

  receive(
    session: Session,
    input: {
      movementId: string;
      receiverDeclaredKg: number;
      gradedAtAuthorityBranch?: boolean;
      contractId?: string;
    },
  ): MovementRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "WarehouseOperator",
      "FacilityOperator",
    ]);
    const mov = this.w.movements.get(input.movementId);
    if (!mov) throw new EngineError("INV-11", "Unknown movement");
    if (mov.toActorId !== session.actorId) {
      throw new EngineError("AUTH-CAPACITY", "Not the receiving actor");
    }
    if (mov.state !== "pending" && mov.state !== "receipt_overdue") {
      throw new EngineError("INV-11", "Movement not awaiting receipt");
    }
    const lot = this.w.lots.get(mov.lotId)!;
    mov.receiverDeclaredKg = input.receiverDeclaredKg;
    const equal = massesEqual(mov.senderDeclaredKg, input.receiverDeclaredKg);
    mov.state = equal ? "received_clean" : "received_discrepant";
    if (!equal) {
      this.w.discrepancies.push({
        movementId: mov.movementId,
        senderKg: mov.senderDeclaredKg,
        receiverKg: input.receiverDeclaredKg,
        deltaKg: roundMass(input.receiverDeclaredKg - mov.senderDeclaredKg),
        status: "open",
      });
      this.w.issues.push({
        issueId: randomUUID(),
        lifecycle: "ANOMALY_WARNING",
        intervention: "FLAG",
        authorityTag: "INDUSTRY_BENCHMARK",
        subjectType: "movement",
        subjectId: mov.movementId,
        summary: `Weight discrepancy ${mov.senderDeclaredKg} vs ${input.receiverDeclaredKg}`,
      });
    }
    // Custody transfers; ownership unchanged; canonicalMassKg NOT rewritten
    lot.custodianActorId = session.actorId;
    lot.locationId = mov.destinationLocationId ?? lot.locationId;
    lot.inTransit = false;
    const ev = this.commitEvent(session, "movement_receive", {
      movementId: mov.movementId,
      receiverDeclaredKg: input.receiverDeclaredKg,
      state: mov.state,
    }, [lot.lotId, mov.movementId]);
    mov.receiptEventId = ev.eventId;

    if (input.contractId) {
      const c = this.w.contracts.get(input.contractId);
      if (c) {
        const deadline = input.gradedAtAuthorityBranch
          ? new Date()
          : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        this.w.obligations.push({
          obligationId: randomUUID(),
          kind: "payment_settlement",
          accountableActorId: c.exporterActorId,
          subjectType: "contract",
          subjectId: c.contractId,
          deadline: deadline.toISOString(),
          status: "open",
          payload: { reg: "REG-D05-03" },
        });
      }
    }
    return mov;
  }

  markOverdue(movementId: string): void {
    const mov = this.w.movements.get(movementId);
    if (mov && mov.state === "pending") mov.state = "receipt_overdue";
  }

  transferOwnership(
    session: Session,
    input: { lotId: string; newOwnerActorId: string },
  ): LotRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter"]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot || lot.status !== "active") throw new EngineError("INV-04", "Inactive lot");
    if (lot.inTransit) throw new EngineError("INV-09", "Lot in transit");
    const prev = lot.ownerActorId;
    lot.ownerActorId = input.newOwnerActorId;
    this.commitEvent(session, "ownership_transfer", {
      lotId: lot.lotId,
      previousOwnerActorId: prev,
      newOwnerActorId: input.newOwnerActorId,
    }, [lot.lotId]);
    return lot;
  }

  disaggregate(
    session: Session,
    input: { parentLotId: string; childMassesKg: number[] },
  ): LotRecord[] {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "FacilityOperator"]);
    const parent = this.w.lots.get(input.parentLotId);
    if (!parent || parent.status !== "active") {
      throw new EngineError("INV-05", "Parent lot inactive");
    }
    if (parent.inTransit) throw new EngineError("INV-09", "Lot in transit");
    if (parent.custodianActorId !== session.actorId) {
      throw new EngineError("INV-12", "Not custodian");
    }
    if (input.childMassesKg.length < 2) {
      throw new EngineError("INV-07", "Split needs ≥2 children");
    }
    const sum = roundMass(input.childMassesKg.reduce((a, b) => a + b, 0));
    if (!massesEqual(sum, parent.availableKg)) {
      throw new EngineError("INV-07", "Children must sum to parent kg");
    }
    if (sum > parent.availableKg + 1e-9) {
      throw new EngineError("DOUBLE-SPEND", "Insufficient available kg");
    }
    const children: LotRecord[] = [];
    const ev = this.commitEvent(session, "disaggregate", {
      parentLotId: parent.lotId,
      childMassesKg: input.childMassesKg,
    }, [parent.lotId]);
    for (const kg of input.childMassesKg) {
      const childId = randomUUID();
      const child: LotRecord = {
        ...parent,
        lotId: childId,
        displayCode: this.nextLotCode(),
        canonicalMassKg: roundMass(kg),
        availableKg: roundMass(kg),
        createdEventId: ev.eventId,
        inactiveEventId: undefined,
        status: "active",
        inTransit: false,
        provenance: { ...parent.provenance },
        cropYearComposition: { ...parent.cropYearComposition },
      };
      if (wouldCreateCycle(this.w.lineage, parent.lotId, childId)) {
        throw new EngineError("LINEAGE-CYCLE", "Circular lineage rejected");
      }
      this.w.lineage.push({
        parentLotId: parent.lotId,
        childLotId: childId,
        contributionKg: roundMass(kg),
        proportion: 1,
        eventId: ev.eventId,
      });
      this.w.lots.set(childId, child);
      children.push(child);
    }
    parent.status = "inactive";
    parent.availableKg = 0;
    parent.inactiveEventId = ev.eventId;
    return children;
  }

  aggregate(
    session: Session,
    input: { parentLotIds: string[] },
  ): LotRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "FacilityOperator"]);
    if (input.parentLotIds.length < 2) {
      throw new EngineError("INV-07", "Aggregate needs ≥2 parents");
    }
    const parents = input.parentLotIds.map((id) => {
      const l = this.w.lots.get(id);
      if (!l || l.status !== "active") throw new EngineError("INV-04", "Parent inactive");
      if (l.inTransit) throw new EngineError("INV-09", "In transit");
      if (l.custodianActorId !== session.actorId) {
        throw new EngineError("INV-12", "Not custodian");
      }
      return l;
    });
    const state0 = parents[0]!.processingState;
    const route0 = parents[0]!.processingRoute;
    for (const p of parents) {
      if (p.processingState !== state0 || p.processingRoute !== route0) {
        throw new EngineError("INV-07", "Parents must share form and route");
      }
    }
    const total = roundMass(parents.reduce((s, p) => s + p.canonicalMassKg, 0));
    const provenance = mixProvenance(
      parents.map((p) => ({ kg: p.canonicalMassKg, provenance: p.provenance })),
    );
    const cropYearComposition = mixCropYears(
      parents.map((p) => ({
        kg: p.canonicalMassKg,
        composition: p.cropYearComposition,
        cropYear: p.cropYear,
      })),
    );
    const childId = randomUUID();
    const ev = this.commitEvent(session, "aggregate", {
      parentLotIds: input.parentLotIds,
      childLotId: childId,
    }, [...input.parentLotIds, childId]);
    for (const p of parents) {
      if (wouldCreateCycle(this.w.lineage, p.lotId, childId)) {
        throw new EngineError("LINEAGE-CYCLE", "Circular lineage rejected");
      }
      this.w.lineage.push({
        parentLotId: p.lotId,
        childLotId: childId,
        contributionKg: p.canonicalMassKg,
        proportion: p.canonicalMassKg / total,
        eventId: ev.eventId,
      });
      p.status = "inactive";
      p.availableKg = 0;
      p.inactiveEventId = ev.eventId;
    }
    const first = parents[0]!;
    const child: LotRecord = {
      lotId: childId,
      displayCode: this.nextLotCode(),
      processingState: state0,
      processingRoute: route0,
      status: "active",
      canonicalMassKg: total,
      availableKg: total,
      ownerActorId: first.ownerActorId,
      custodianActorId: first.custodianActorId,
      locationId: first.locationId,
      cropYear: undefined, // never relabel mix as newest year
      cropYearComposition,
      originStatus: first.originStatus,
      createdByActorId: session.actorId,
      createdEventId: ev.eventId,
      provenance,
      inTransit: false,
    };
    this.w.lots.set(childId, child);
    return child;
  }

  process(
    session: Session,
    input: {
      inputLotIds: string[];
      outputState: CoffeeState;
      rejectKg: number;
      lossKg: number;
      lossCategory?: string;
      facilityActorId?: string;
      moisturePct?: number;
      blendingPermitRef?: string;
      byProducts?: Array<{ kind: string; massKg: number }>;
    },
  ): LotRecord {
    this.assertCapacity(session, [
      "Aggregator",
      "Exporter",
      "FacilityOperator",
      "WarehouseOperator",
    ]);
    const inputs = input.inputLotIds.map((id) => {
      const l = this.w.lots.get(id);
      if (!l || l.status !== "active") throw new EngineError("INV-04", "Input inactive");
      if (l.inTransit) throw new EngineError("INV-09", "In transit");
      if (l.custodianActorId !== session.actorId) {
        throw new EngineError("INV-12", "Not custodian");
      }
      return l;
    });
    if (input.lossKg == null || Number.isNaN(input.lossKg)) {
      throw new EngineError("INV-07", "Loss must be explicitly entered");
    }
    if (input.rejectKg == null || Number.isNaN(input.rejectKg)) {
      throw new EngineError("INV-07", "Reject must be entered");
    }
    const totalIn = roundMass(inputs.reduce((s, l) => s + l.canonicalMassKg, 0));
    const byProductKg = roundMass(
      (input.byProducts ?? []).reduce((s, b) => s + b.massKg, 0),
    );
    const outputMassKg = roundMass(totalIn - input.rejectKg - input.lossKg - byProductKg);
    if (outputMassKg < 0) {
      throw new EngineError("INV-07", "Outputs exceed inputs");
    }
    if (
      !massesEqual(
        totalIn,
        outputMassKg + input.rejectKg + input.lossKg + byProductKg,
      )
    ) {
      throw new EngineError("INV-07", "Mass balance does not close");
    }
    if (input.lossKg > 0) {
      const eligible = inputs.some((l) =>
        LOSS_ELIGIBLE_STATES.includes(l.processingState),
      );
      if (!eligible) {
        throw new EngineError("INV-08", "Loss not allowed for green-only inputs");
      }
    }
    if (input.facilityActorId) {
      const fac = this.w.facilities.get(input.facilityActorId);
      const needed =
        input.outputState.includes("washed") || input.outputState === "wet_parchment"
          ? "wet_milling"
          : "dry_milling";
      if (!fac || !fac.capabilities.some((c) => c.includes("mill") || c.includes("process") || c === needed || c === "washed_processing" || c === "natural_processing")) {
        // T4: block if clearly no capability
        if (!fac || fac.capabilities.length === 0) {
          throw new EngineError(
            "FACILITY-CAP",
            "Facility not authorized for this process",
          );
        }
      }
    }
    // Moisture BLOCK for supply/export greens
    const moisture = input.moisturePct ?? inputs[0]?.moisturePct;
    if (
      (input.outputState === "green_washed" ||
        input.outputState === "green_natural" ||
        input.outputState === "supply" ||
        input.outputState === "export") &&
      moisture != null &&
      (moisture < MOISTURE_MIN || moisture > MOISTURE_MAX)
    ) {
      throw new EngineError(
        "REG-D02-02",
        `Moisture ${moisture}% outside 10.0–12.5%`,
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    // Blending permit for mixed types/origins/crop years
    const cropKeys = new Set<string>();
    for (const l of inputs) {
      for (const k of Object.keys(l.cropYearComposition)) cropKeys.add(k);
      if (l.cropYear) cropKeys.add(l.cropYear);
    }
    const routes = new Set(inputs.map((l) => l.processingRoute));
    if ((cropKeys.size > 1 || routes.size > 1) && !input.blendingPermitRef) {
      throw new EngineError(
        "REG-D02-03",
        "Blending different crop years/types requires permit",
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }

    const yieldPct = totalIn > 0 ? (outputMassKg / totalIn) * 100 : 0;
    if (yieldPct < 75 || yieldPct > 85) {
      // FLAG unusual yield — still accept if balanced
      this.w.issues.push({
        issueId: randomUUID(),
        lifecycle: "ANOMALY_WARNING",
        intervention: "FLAG",
        authorityTag: "INDUSTRY_BENCHMARK",
        subjectType: "process",
        subjectId: inputs[0]!.lotId,
        summary: `Unusual yield ${yieldPct.toFixed(1)}% (expected 75–85)`,
      });
    }

    const provenance = mixProvenance(
      inputs.map((p) => ({ kg: p.canonicalMassKg, provenance: p.provenance })),
    );
    const cropYearComposition = mixCropYears(
      inputs.map((p) => ({
        kg: p.canonicalMassKg,
        composition: p.cropYearComposition,
        cropYear: p.cropYear,
      })),
    );
    const childId = randomUUID();
    const ev = this.commitEvent(session, "process", {
      inputLotIds: input.inputLotIds,
      outputState: input.outputState,
      outputMassKg,
      rejectKg: input.rejectKg,
      lossKg: input.lossKg,
      lossCategory: input.lossCategory,
      byProducts: input.byProducts,
      blendingPermitRef: input.blendingPermitRef,
    }, [...input.inputLotIds, childId]);

    for (const b of input.byProducts ?? []) {
      this.w.byProducts.push({
        id: randomUUID(),
        sourceEventId: ev.eventId,
        kind: b.kind,
        massKg: b.massKg,
      });
    }

    for (const p of inputs) {
      if (wouldCreateCycle(this.w.lineage, p.lotId, childId)) {
        throw new EngineError("LINEAGE-CYCLE", "Circular lineage");
      }
      this.w.lineage.push({
        parentLotId: p.lotId,
        childLotId: childId,
        contributionKg: p.canonicalMassKg,
        proportion: p.canonicalMassKg / totalIn,
        eventId: ev.eventId,
      });
      p.status = "inactive";
      p.availableKg = 0;
      p.inactiveEventId = ev.eventId;
    }
    const first = inputs[0]!;
    const child: LotRecord = {
      lotId: childId,
      displayCode: this.nextLotCode(),
      processingState: input.outputState,
      processingRoute: first.processingRoute,
      status: "active",
      canonicalMassKg: outputMassKg,
      availableKg: outputMassKg,
      ownerActorId: first.ownerActorId,
      custodianActorId: first.custodianActorId,
      locationId: first.locationId,
      cropYear: undefined,
      cropYearComposition,
      originStatus: first.originStatus,
      createdEventId: ev.eventId,
      provenance,
      inTransit: false,
      moisturePct: moisture,
    };
    this.w.lots.set(childId, child);
    return child;
  }

  terminalDispose(
    session: Session,
    input: {
      lotId: string;
      reason: "fob_export" | "domestic_disposition" | "destroyed";
      impurityPct?: number;
      divertingGrade?: boolean;
    },
  ): LotRecord {
    this.assertCapacity(session, ["Exporter", "Aggregator", "Collector"]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot || lot.status !== "active") throw new EngineError("INV-04", "Inactive");
    if (lot.inTransit) throw new EngineError("INV-09", "In transit");
    if (input.reason === "domestic_disposition") {
      if (input.impurityPct != null && input.impurityPct > 15) {
        throw new EngineError(
          "REG-D02-05",
          "Domestic coffee impurity > 15%",
          "BLOCK",
          "LEGAL_REQUIREMENT",
        );
      }
      if (input.divertingGrade) {
        throw new EngineError(
          "REG-D02-05",
          "Unauthorized grade diversion blocked",
          "BLOCK",
          "LEGAL_REQUIREMENT",
        );
      }
    }
    const ev = this.commitEvent(session, "terminal_disposition", {
      lotId: lot.lotId,
      reason: input.reason,
    }, [lot.lotId]);
    lot.status =
      input.reason === "fob_export"
        ? "exported"
        : input.reason === "destroyed"
          ? "destroyed"
          : "inactive";
    lot.availableKg = 0;
    lot.inactiveEventId = ev.eventId;
    return lot;
  }

  correct(
    session: Session,
    input: { correctsEventId: string; correctedPayload: Record<string, unknown>; reason: string },
  ): EventRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "PlatformAdmin",
      "Regulator",
    ]);
    const orig = this.w.events.find((e) => e.eventId === input.correctsEventId);
    if (!orig) throw new EngineError("INV-02", "Correction must reference existing event");
    return this.commitEvent(
      session,
      "correction",
      { reason: input.reason, corrected: input.correctedPayload },
      orig.affectedObjectIds,
      { correctsEventId: input.correctsEventId },
    );
  }

  registerContract(
    session: Session,
    input: {
      supplierActorId: string;
      exporterActorId: string;
      coffeeType: string;
      quantityKg: number;
      grade: string;
      priceEtbPerKg: number;
      executionPeriod: string;
      paymentTerms: string;
      deliverySite: string;
      transportCostAlloc: string;
      registrationRef: string;
      supplierHasCoC: boolean;
      exporterHasCoC: boolean;
    },
  ): ContractRecord {
    this.assertCapacity(session, ["Exporter", "Aggregator", "PlatformAdmin"]);
    if (!input.supplierHasCoC || !input.exporterHasCoC) {
      throw new EngineError(
        "REG-D05-06",
        "Both parties need valid Certificate of Competency",
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    const { maxEtb, minEtb, premiumPct } = this.w.priceBand;
    const ceiling = maxEtb * (1 + premiumPct / 100);
    if (input.priceEtbPerKg > ceiling || input.priceEtbPerKg < minEtb) {
      throw new EngineError(
        "REG-D05-06",
        `Price ${input.priceEtbPerKg} outside band ${minEtb}–${ceiling}`,
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    const contractId = randomUUID();
    const c: ContractRecord = {
      contractId,
      supplierActorId: input.supplierActorId,
      exporterActorId: input.exporterActorId,
      priceEtbPerKg: input.priceEtbPerKg,
      quantityKg: input.quantityKg,
      grade: input.grade,
      coffeeType: input.coffeeType,
      registrationRef: input.registrationRef,
    };
    this.w.contracts.set(contractId, c);
    this.commitEvent(session, "contract_registered", { ...c }, [contractId]);
    return c;
  }

  // ── Farms ─────────────────────────────────────────────────────────────────

  createFarm(
    session: Session,
    input: { ownerActorId: string; displayName: string; pointLat?: number; pointLng?: number },
  ): FarmRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Verifier", "PlatformAdmin"]);
    const farmId = randomUUID();
    const farm: FarmRecord = { farmId, ...input };
    this.w.farms.set(farmId, farm);
    this.commitEvent(session, "farm_created", farm, [farmId]);
    return farm;
  }

  createFarmUnit(
    session: Session,
    input: { farmId: string; displayName: string },
  ): FarmUnitRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Verifier", "PlatformAdmin"]);
    if (!this.w.farms.has(input.farmId)) {
      throw new EngineError("INV-04", "Farm not found");
    }
    const farmUnitId = randomUUID();
    const u: FarmUnitRecord = {
      farmUnitId,
      farmId: input.farmId,
      displayName: input.displayName,
      polygonPending: true,
    };
    this.w.farmUnits.set(farmUnitId, u);
    return u;
  }

  addGeometryVersion(
    session: Session,
    input: { farmUnitId: string; geojson?: { type: string; coordinates: unknown } },
  ): GeometryVersionRecord {
    this.assertCapacity(session, ["Farmer", "Verifier", "PlatformAdmin"]);
    const existing = this.w.geometries.filter((g) => g.farmUnitId === input.farmUnitId);
    const used = existing.find((g) => g.usedInCompliance);
    if (used && session.capacity === "Farmer") {
      throw new EngineError(
        "AUTH-CAPACITY",
        "Verified geometry requires elevated authority to change",
      );
    }
    const anomalyFlags: string[] = [];
    if (input.geojson?.type === "Polygon") {
      // naive self-intersection flag placeholder
      const coords = input.geojson.coordinates as number[][][];
      if (coords?.[0] && coords[0].length < 4) {
        anomalyFlags.push("implausible_ring");
      }
    }
    const g: GeometryVersionRecord = {
      id: randomUUID(),
      farmUnitId: input.farmUnitId,
      version: existing.length + 1,
      geojson: input.geojson,
      anomalyFlags,
      usedInCompliance: false,
    };
    this.w.geometries.push(g);
    const unit = this.w.farmUnits.get(input.farmUnitId);
    if (unit && input.geojson) unit.polygonPending = false;
    return g;
  }

  // ── Evidence ──────────────────────────────────────────────────────────────

  uploadEvidence(
    session: Session,
    input: {
      attachedType: string;
      attachedId: string;
      evidenceClass: EvidenceRecord["evidenceClass"];
      documentType: string;
      factSupported: string;
      validFrom?: string;
      validTo?: string;
      systemValidate?: boolean;
    },
  ): EvidenceRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "Verifier",
      "Regulator",
      "PlatformAdmin",
    ]);
    const evidenceId = randomUUID();
    const e: EvidenceRecord = {
      evidenceId,
      attachedType: input.attachedType,
      attachedId: input.attachedId,
      evidenceClass: input.evidenceClass,
      documentType: input.documentType,
      factSupported: input.factSupported,
      status: input.systemValidate ? "SYSTEM_VALIDATED" : "UPLOADED",
      validFrom: input.validFrom,
      validTo: input.validTo,
    };
    this.w.evidence.set(evidenceId, e);
    return e;
  }

  verifyEvidence(session: Session, evidenceId: string): EvidenceRecord {
    this.assertCapacity(session, ["Verifier", "Regulator", "PlatformAdmin"]);
    const e = this.w.evidence.get(evidenceId);
    if (!e) throw new EngineError("INV-04", "Evidence not found");
    e.status = "VERIFIED";
    return e;
  }

  revokeEvidence(
    session: Session,
    evidenceId: string,
    effectiveDate: string,
  ): EvidenceRecord {
    this.assertCapacity(session, ["Verifier", "Regulator", "PlatformAdmin"]);
    const e = this.w.evidence.get(evidenceId)!;
    e.status = "REVOKED";
    e.revokedEffective = effectiveDate;
    return e;
  }

  evidenceValidAt(evidenceId: string, atIso: string): boolean {
    const e = this.w.evidence.get(evidenceId);
    if (!e) return false;
    const at = new Date(atIso).getTime();
    if (e.revokedEffective && at >= new Date(e.revokedEffective).getTime()) return false;
    if (e.validFrom && at < new Date(e.validFrom).getTime()) return false;
    if (e.validTo && at > new Date(e.validTo).getTime()) return false;
    return e.status === "VERIFIED" || e.status === "UPLOADED" || e.status === "SYSTEM_VALIDATED";
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  stockBalance(actorId: string, coffeeState?: CoffeeState): number {
    let sum = 0;
    for (const l of this.w.lots.values()) {
      if (l.status === "active" && l.custodianActorId === actorId) {
        if (!coffeeState || l.processingState === coffeeState) {
          sum += l.canonicalMassKg;
        }
      }
    }
    return roundMass(sum);
  }

  stocktake(
    session: Session,
    input: {
      facilityActorId: string;
      coffeeState: CoffeeState;
      physicalKg: number;
    },
  ): { theoreticalKg: number; physicalKg: number; varianceKg: number } {
    this.assertCapacity(session, ["WarehouseOperator", "FacilityOperator", "Aggregator", "Exporter"]);
    const theoreticalKg = this.stockBalance(input.facilityActorId, input.coffeeState);
    const varianceKg = roundMass(input.physicalKg - theoreticalKg);
    this.w.stocktakes.push({
      id: randomUUID(),
      facilityActorId: input.facilityActorId,
      coffeeState: input.coffeeState,
      theoreticalKg,
      physicalKg: input.physicalKg,
      varianceKg,
    });
    if (Math.abs(varianceKg) > 50) {
      this.w.issues.push({
        issueId: randomUUID(),
        lifecycle: "ANOMALY_WARNING",
        intervention: "FLAG",
        subjectType: "stocktake",
        subjectId: input.facilityActorId,
        summary: `Stock variance ${varianceKg} kg`,
      });
    }
    return { theoreticalKg, physicalKg: input.physicalKg, varianceKg };
  }

  // ── Compliance ────────────────────────────────────────────────────────────

  assessLot(
    lotId: string,
    requirements: Array<{
      code: string;
      applies: boolean;
      basis?: string;
      satisfied?: boolean;
      geolocationCompleteShare?: number;
    }>,
  ): Array<{ code: string; status: string; basis?: string }> {
    return requirements.map((r) => {
      if (!r.applies) {
        return {
          code: r.code,
          status: "NOT_APPLICABLE",
          basis: r.basis ?? "market_mismatch",
        };
      }
      if (r.geolocationCompleteShare != null && r.geolocationCompleteShare < 1) {
        return {
          code: r.code,
          status: "INCOMPLETE",
          basis: `composition ${r.geolocationCompleteShare}`,
        };
      }
      return {
        code: r.code,
        status: r.satisfied ? "READY" : "INCOMPLETE",
      };
    });
  }

  claimSchemeVolume(
    lotId: string,
    scheme: string,
    claimedKg: number,
    allowance = false,
  ): void {
    const lot = this.w.lots.get(lotId);
    if (!lot) throw new EngineError("INV-04", "Lot not found");
    const existing = this.w.schemeClaims
      .filter((c) => c.lotId === lotId)
      .reduce((s, c) => s + c.claimedKg, 0);
    if (existing + claimedKg > lot.canonicalMassKg + 1e-9 && !allowance) {
      throw new EngineError(
        "AUTH-CAPACITY",
        "Cross-scheme claim exceeds physical quantity",
      );
    }
    this.w.schemeClaims.push({ lotId, scheme, claimedKg, allowance });
  }

  submitCompliance(payload: unknown): { id: string; status: string } {
    const id = randomUUID();
    this.w.submissions.push({ id, status: "READY", payloadSnapshot: payload });
    return { id, status: "READY" };
  }

  rejectSubmission(id: string, reason: string): void {
    const s = this.w.submissions.find((x) => x.id === id);
    if (!s) return;
    s.status = "EXCEPTION";
    s.rejectionReason = reason;
  }

  // ── Issues / Obligations ──────────────────────────────────────────────────

  resolveIssue(
    session: Session,
    issueId: string,
    disposition: string,
    allowed = true,
  ): void {
    if (!allowed) {
      throw new EngineError("AUTH-CAPACITY", "Outside resolution authority");
    }
    const issue = this.w.issues.find((i) => i.issueId === issueId);
    if (!issue) return;
    if (disposition === "Unresolved") {
      issue.disposition = "Unresolved";
      issue.lifecycle = "RESOLVED";
      return;
    }
    issue.disposition = disposition;
    issue.lifecycle = "RESOLVED";
  }

  registerBlockRule(input: {
    code: string;
    authorityTag?: string;
    sourceRef?: string;
    scope?: string;
    owner?: string;
    approvalRef?: string;
  }): void {
    if (
      !input.authorityTag ||
      !input.sourceRef ||
      !input.scope ||
      !input.owner ||
      !input.approvalRef
    ) {
      throw new EngineError(
        "AUTH-CAPACITY",
        "BLOCK rule requires source, scope, owner, approval, authority_tag",
      );
    }
    this.w.blockRules.push({
      code: input.code,
      authorityTag: input.authorityTag,
      sourceRef: input.sourceRef,
      scope: input.scope,
      owner: input.owner,
      approvalRef: input.approvalRef,
    });
  }

  quarantineConflict(
    quantityKg: number,
    accountableActorId: string,
  ): { id: string; deadline: string } {
    const id = randomUUID();
    const deadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    this.w.quarantines.push({
      id,
      quantityKg,
      deadline,
      accountableActorId,
      resolved: false,
    });
    this.w.obligations.push({
      obligationId: randomUUID(),
      kind: "quarantine_resolution",
      accountableActorId,
      subjectType: "quarantine",
      subjectId: id,
      deadline,
      status: "open",
      payload: { quantityKg },
    });
    return { id, deadline };
  }

  escalateOverdueQuarantines(now = new Date()): NotificationRecord[] {
    const notes: NotificationRecord[] = [];
    for (const q of this.w.quarantines) {
      if (!q.resolved && new Date(q.deadline) <= now) {
        const ob = this.w.obligations.find(
          (o) => o.subjectId === q.id && o.kind === "quarantine_resolution",
        );
        if (ob) {
          ob.status = "escalated";
          ob.payload = { ...ob.payload, escalated: true };
        }
        const note: NotificationRecord = {
          id: randomUUID(),
          userId: q.accountableActorId,
          category: "escalation",
          title: "Quarantine escalated",
          body: `72h quarantine ${q.id} unresolved`,
          triggerRef: q.id,
        };
        this.w.notifications.push(note);
        notes.push(note);
      }
    }
    return notes;
  }

  notifyAction(
    userId: string,
    category: string,
    title: string,
    body: string,
    triggerRef?: string,
  ): NotificationRecord | null {
    // Only action-worthy categories
    const allowed = [
      "required_receipt",
      "discrepancy",
      "conflict",
      "credential_expiry",
      "evidence_invalid",
      "approval",
      "escalation",
    ];
    if (!allowed.includes(category)) return null;
    const n: NotificationRecord = {
      id: randomUUID(),
      userId,
      category,
      title,
      body,
      triggerRef,
    };
    this.w.notifications.push(n);
    return n;
  }

  // ── Reporting ─────────────────────────────────────────────────────────────

  generateReport(lotId: string): ReportRecord {
    const lot = this.w.lots.get(lotId);
    const payload = {
      lot,
      lineage: this.traceBackward(lotId),
      movements: [...this.w.movements.values()].filter((m) => m.lotId === lotId),
      generatedAt: new Date().toISOString(),
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    const report: ReportRecord = {
      reportId: randomUUID(),
      lotId,
      payload,
      fingerprint,
      superseded: false,
    };
    this.w.reports.push(report);
    return report;
  }

  verifyReportFingerprint(reportId: string): boolean {
    const r = this.w.reports.find((x) => x.reportId === reportId);
    if (!r) return false;
    const fp = createHash("sha256").update(JSON.stringify(r.payload)).digest("hex");
    return fp === r.fingerprint;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  inventory(actorId: string): LotRecord[] {
    return [...this.w.lots.values()].filter(
      (l) => l.status === "active" && l.custodianActorId === actorId,
    );
  }

  pendingReceipts(actorId: string): MovementRecord[] {
    return [...this.w.movements.values()].filter(
      (m) =>
        m.toActorId === actorId &&
        (m.state === "pending" || m.state === "receipt_overdue"),
    );
  }

  visibleLots(actorId: string): LotRecord[] {
    const movLotIds = new Set(
      [...this.w.movements.values()]
        .filter((m) => m.fromActorId === actorId || m.toActorId === actorId)
        .map((m) => m.lotId),
    );
    return [...this.w.lots.values()].filter(
      (l) =>
        l.ownerActorId === actorId ||
        l.custodianActorId === actorId ||
        movLotIds.has(l.lotId),
    );
  }

  traceBackward(lotId: string): string[] {
    const parents = new Map<string, string[]>();
    for (const e of this.w.lineage) {
      const list = parents.get(e.childLotId) ?? [];
      list.push(e.parentLotId);
      parents.set(e.childLotId, list);
    }
    const origins: string[] = [];
    const stack = [lotId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const p = parents.get(id);
      if (!p || p.length === 0) {
        origins.push(id);
      } else {
        stack.push(...p);
      }
    }
    return origins;
  }

  forwardOneHop(lotId: string): string[] {
    return this.w.lineage.filter((e) => e.parentLotId === lotId).map((e) => e.childLotId);
  }

  networkTree(actorId: string): ActorRecord[] {
    return [...this.w.actors.values()].filter((a) => a.sponsorActorId === actorId);
  }

  displayNameFor(viewerId: string, subjectId: string): string {
    const viewer = this.w.actors.get(viewerId);
    const subject = this.w.actors.get(subjectId);
    if (!viewer || !subject) return subjectId;
    if (viewer.actorType === "farmer") return subject.displayName;
    if (subject.actorType === "farmer" || subject.actorType === "collector" || subject.actorType === "akrabi") {
      const siblings = [...this.w.actors.values()].filter(
        (a) =>
          a.sponsorActorId === subject.sponsorActorId &&
          a.actorType === subject.actorType,
      );
      const idx = siblings.findIndex((a) => a.actorId === subjectId) + 1;
      const label =
        subject.actorType === "akrabi"
          ? `Aggregator ${idx}`
          : subject.actorType === "collector"
            ? `Collector ${idx}`
            : `Farmer ${idx}`;
      if (subject.metadata.userOnboarded === "true" && subject.displayName) {
        return `${label} · ${subject.displayName}`;
      }
      return label;
    }
    return subject.displayName;
  }

  integrityChecks(): {
    traceability: { ok: boolean; farmerVerified: number; counterparty: number };
    weightBalance: {
      ok: boolean;
      minted: number;
      active: number;
      closed: number;
      rejectLoss: number;
    };
    discrepancies: { open: number };
  } {
    let farmerVerified = 0;
    let counterparty = 0;
    for (const l of this.w.lots.values()) {
      if (l.status !== "active") continue;
      const origins = this.traceBackward(l.lotId);
      for (const oid of origins) {
        const o = this.w.lots.get(oid);
        if (o?.originStatus === "farmer_verified") farmerVerified++;
        else counterparty++;
      }
    }
    let minted = 0;
    let rejectLoss = 0;
    for (const e of this.w.events) {
      if (e.eventType === "origin_lot_created") {
        minted += Number(e.payload.massKg ?? 0);
      }
      if (e.eventType === "process") {
        rejectLoss += Number(e.payload.rejectKg ?? 0) + Number(e.payload.lossKg ?? 0);
        for (const b of (e.payload.byProducts as Array<{ massKg: number }>) ?? []) {
          rejectLoss += b.massKg;
        }
      }
    }
    let active = 0;
    let closed = 0;
    for (const l of this.w.lots.values()) {
      if (l.status === "active") active += l.canonicalMassKg;
      else if (
        l.inactiveEventId &&
        this.w.events.find((e) => e.eventId === l.inactiveEventId)?.eventType ===
          "terminal_disposition"
      ) {
        closed += l.canonicalMassKg;
      }
    }
    const weightOk = Math.abs(minted - (active + closed + rejectLoss)) <= 0.01;
    return {
      traceability: {
        ok: true,
        farmerVerified,
        counterparty,
      },
      weightBalance: {
        ok: weightOk,
        minted: roundMass(minted),
        active: roundMass(active),
        closed: roundMass(closed),
        rejectLoss: roundMass(rejectLoss),
      },
      discrepancies: {
        open: this.w.discrepancies.filter((d) => d.status === "open").length,
      },
    };
  }

  getEvents(): EventRecord[] {
    return [...this.w.events];
  }

  getActors(): ActorRecord[] {
    return [...this.w.actors.values()];
  }

  getLots(): LotRecord[] {
    return [...this.w.lots.values()];
  }

  getLineage(): LineageEdgeRecord[] {
    return [...this.w.lineage];
  }

  getMovements(): MovementRecord[] {
    return [...this.w.movements.values()];
  }

  getIssues(): IssueRecord[] {
    return [...this.w.issues];
  }

  getObligations(): ObligationRecord[] {
    return [...this.w.obligations];
  }

  getNotifications(userId: string): NotificationRecord[] {
    return this.w.notifications.filter((n) => n.userId === userId);
  }

  getEvidence(): EvidenceRecord[] {
    return [...this.w.evidence.values()];
  }

  getRegionalCredentialMatrix(): unknown[] {
    return this.w.credentialMatrixRegional;
  }

  setFacility(actorId: string, capabilities: string[]): void {
    this.w.facilities.set(actorId, { actorId, capabilities });
  }
}

export function createEngine(): LedgerEngine {
  return new LedgerEngine();
}
