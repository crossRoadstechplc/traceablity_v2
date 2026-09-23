import { createHash, randomUUID } from "node:crypto";
import {
  type ActorType,
  type AuthorityTag,
  type CapacityCode,
  type CoffeeState,
  type IssueDisposition,
  type ProcessingRoute,
  type SanctionStep,
  type TransactionChannel,
  EngineError,
  FEDERAL_COC_CRITERIA,
  FRAMEWORK_VERSIONS,
  INTAKE_MATRIX,
  ISSUE_DISPOSITIONS,
  LOSS_ELIGIBLE_STATES,
  MOISTURE_MAX,
  MOISTURE_MIN,
  NOTIFICATION_TRIGGERS,
  ONBOARD_MATRIX,
  PROCESS_CAPABILITY_FOR_OUTPUT,
  PROCESS_OUTPUT_STATES,
  QUARANTINE_WINDOW_HOURS,
  RECEIPT_WINDOW_HOURS,
  SANCTION_LADDER,
  SEND_MATRIX,
  SUPPLY_EXPORT_STATES,
  TRANSACTION_CHANNELS,
  TRANSFER_FALLBACK_MATRIX,
  YIELD_REFERENCE_RANGES,
  YIELD_REFERENCE_VERSION,
  DEFAULT_FACILITY_CAPABILITIES,
  canonicalJson,
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
  /** Module 13 T3: the actor whose user physically entered data for `actorId` */
  assistedByActorId?: string;
  /** Module 15 T4: model/AI callers are rejected at the write path */
  agentKind?: "human" | "integration" | "ai_model";
  /** Module 13 T1/T2: offline capture time, preserved separately from commit time */
  eventTimeActual?: string;
};

export const EVENT_SCHEMA_VERSION = "1.1";

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

export type LineageTraceNode = {
  lotId: string;
  displayCode: string;
  title: string;
  summary: string;
  kind: "origin" | "aggregate" | "process" | "split" | "other";
  massKg: number;
  processingState: string;
  processingRoute: string;
  status: string;
  cropYear?: string;
  originStatus?: string;
  yieldPct?: number;
  parentLotIds: string[];
  parentCount: number;
  ownerLabel: string;
  custodianLabel: string;
  locationId?: string;
  originLocationId?: string;
  ownerActorId: string;
  custodianActorId: string;
  cropYearComposition: Record<string, number>;
  provenance: Record<string, number>;
  contributions: Array<{
    parentLotId: string;
    contributionKg: number;
    proportion: number;
  }>;
  eventId: string;
  eventType?: string;
  processDetail?: {
    inputKg: number;
    productKg: number;
    rejectKg: number;
    lossKg: number;
    lossCategory?: string;
    byProductKg: number;
    balanced: boolean;
    facilityLabel?: string;
    moisturePct?: number;
  };
  aggregateDetail?: {
    combinedFrom: number;
    provenance: Array<{ actorId: string; label: string; pct: number }>;
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function coffeeStateLabel(state: string): string {
  if (state === "green_washed") return "Green (washed)";
  if (state === "green_natural") return "Green (natural)";
  if (state === "wet_parchment") return "Wet parchment";
  if (state === "dry_parchment") return "Dry parchment";
  return titleCase(state);
}

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
  dispatchedAt?: string;
  transporterActorId?: string;
  contractId?: string;
  shinto?: ShintoPass;
};

export type ShintoPass = {
  weightKg: number;
  volumeBags: number;
  grade: string;
  lotDisplayCode: string;
  sealStatusOrigin: string;
  stationSealIntact?: boolean;
  stationNetWeightKg?: number;
};

export type DiscrepancyRecord = {
  movementId: string;
  senderKg: number;
  receiverKg: number;
  deltaKg: number;
  status: "open" | "resolved";
  disposition?: IssueDisposition;
  note?: string;
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
  createdEventId?: string;
};

export type OverlayRecord = {
  id: string;
  farmUnitId: string;
  geometryVersionId: string;
  dataset: string;
  result: string;
  authorityTag: AuthorityTag;
};

export type VerificationRecord = {
  verifierActorId: string;
  authority: string;
  at: string;
  eventId: string;
};

export type EvidenceRecord = {
  evidenceId: string;
  attachedType: string;
  attachedId: string;
  evidenceClass: "self_assessment" | "laboratory" | "official_authority";
  documentType: string;
  factSupported: string;
  issuer?: string;
  sha256?: string;
  uploaderActorId?: string;
  uploadedAt?: string;
  status: "UPLOADED" | "SYSTEM_VALIDATED" | "VERIFIED" | "EXPIRED" | "SUPERSEDED" | "REVOKED";
  validFrom?: string;
  validTo?: string;
  revokedEffective?: string;
  revokeReason?: string;
  verifications: VerificationRecord[];
  systemChecks?: string[];
};

export type IssueRecord = {
  issueId: string;
  lifecycle: "NORMAL" | "ANOMALY_WARNING" | "INVESTIGATION" | "CONFIRMED_EXCEPTION" | "RESOLVED";
  intervention: "BLOCK" | "WARN" | "FLAG";
  authorityTag?: AuthorityTag;
  subjectType: string;
  subjectId: string;
  summary: string;
  disposition?: IssueDisposition;
  lotIds: string[];
  partyActorIds: string[];
  raisedByActorId?: string;
  raisedByCapacity?: string;
  ruleRef?: string;
  evidenceIds?: string[];
  referenceRange?: { minPct: number; maxPct: number; version: string; sourceRef: string };
  stage?: string;
  createdEventId: string;
};

export type ObligationRecord = {
  obligationId: string;
  kind: string;
  accountableActorId: string;
  subjectType: string;
  subjectId: string;
  deadline?: string;
  status: "open" | "escalated" | "closed";
  payload: Record<string, unknown>;
  history: Array<{ fromActorId?: string; toActorId: string; reason: string; eventId: string }>;
};

export type ContractRecord = {
  contractId: string;
  supplierActorId: string;
  exporterActorId: string;
  priceEtbPerKg: number;
  quantityKg: number;
  grade: string;
  coffeeType: string;
  executionPeriod: string;
  paymentTerms: string;
  deliverySite: string;
  transportCostAlloc: string;
  disputeRecourse: string;
  registrationRef: string;
};

export type ByProductRecord = {
  id: string;
  sourceEventId: string;
  kind: string;
  massKg: number;
  disposition: string;
};

export type NotificationRecord = {
  id: string;
  recipientActorId: string;
  category: string;
  title: string;
  body: string;
  triggerRef?: string;
  eventId: string;
};

export type ReportRecord = {
  reportId: string;
  lotId?: string;
  version: number;
  payload: unknown;
  fingerprint: string;
  contentHash: string;
  generatedAt: string;
  generatedByActorId?: string;
  superseded: boolean;
  supersedesReportId?: string;
  supersededByReportId?: string;
};

export type ComplianceRequirementResult = {
  code: string;
  title: string;
  status: "READY" | "INCOMPLETE" | "EXCEPTION" | "REQUIRES_EXTERNAL_VERIFICATION" | "NOT_APPLICABLE";
  basis: string;
  composition?: { complete: number; missing: number; completeFarmers: string[]; missingFarmers: string[] };
  evidenceIds?: string[];
};

export type ComplianceAssessmentRecord = {
  assessmentId: string;
  lotId: string;
  frameworkCode: string;
  frameworkVersion: string;
  evaluatedAtEventTime: string;
  market: string;
  results: ComplianceRequirementResult[];
  eventId: string;
};

export type SubmissionRecord = {
  submissionId: string;
  assessmentId: string;
  lotId: string;
  recipient: string;
  status: "READY" | "ACKNOWLEDGED" | "EXCEPTION" | "REVIEW_REQUIRED";
  payloadSnapshot: unknown;
  submittedByActorId?: string;
  submittedAt: string;
  externalRef?: string;
  rejectionReason?: string;
  discrepancy?: { internalDetermination: string; externalReason: string };
  history: Array<{ outcome: string; at: string; eventId: string; detail?: string }>;
};

export type CredentialRecord = {
  credentialId: string;
  actorId: string;
  kind: string;
  criteria: Record<string, boolean>;
  missingCriteria: string[];
  status: "ACTIVE" | "INCOMPLETE" | "REVOKED";
  validFrom: string;
  validTo: string;
  issuedByActorId?: string;
};

export type StocktakeRecord = {
  id: string;
  facilityActorId: string;
  stockHolderActorId: string;
  coffeeState: CoffeeState;
  theoreticalKg: number;
  physicalKg: number;
  varianceKg: number;
  at: string;
  adjustments: Array<{ eventId: string; reason: string; byActorId?: string }>;
};

export type ExternalClaimRecord = {
  claimId: string;
  source: string;
  lotId: string;
  field: string;
  claimedValue: number;
  ledgerValue: number | null;
  conflict: boolean;
  eventId: string;
};

export type ModelRegistryEntry = {
  modelId: string;
  purpose: string;
  owner: string;
  trainingData: string;
  features: string;
  version: string;
  performance: string;
  limitations: string;
  deploymentScope: string;
  monitoringPlan: string;
  retirementPath: string;
  enabled: boolean;
};

export type RegulatorAccessRecord = {
  id: string;
  regulatorActorId: string;
  userId: string;
  dataAccessed: string;
  purpose: string;
  action: string;
  at: string;
};

export type QuarantineRecord = {
  id: string;
  quantityKg: number;
  deadline: string;
  accountableActorId: string;
  resolved: boolean;
  lotId?: string;
  dispositions: unknown[];
};

export type World = {
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
  overlays: OverlayRecord[];
  evidence: Map<string, EvidenceRecord>;
  issues: IssueRecord[];
  obligations: ObligationRecord[];
  contracts: Map<string, ContractRecord>;
  byProducts: ByProductRecord[];
  notifications: NotificationRecord[];
  reports: ReportRecord[];
  stocktakes: StocktakeRecord[];
  schemeClaims: Array<{ lotId: string; scheme: string; claimedKg: number; allowance: boolean }>;
  assessments: ComplianceAssessmentRecord[];
  submissions: SubmissionRecord[];
  blockRules: Array<{
    code: string;
    authorityTag: string;
    sourceRef: string;
    scope: string;
    owner: string;
    approvalRef: string;
  }>;
  credentials: CredentialRecord[];
  sanctions: Array<{ actorId: string; step: SanctionStep; reason: string; eventId: string }>;
  externalClaims: ExternalClaimRecord[];
  modelRegistry: ModelRegistryEntry[];
  regulatorAccess: RegulatorAccessRecord[];
  priceBand: { maxEtb: number; minEtb: number; premiumPct: number };
  credentialMatrixRegional: unknown[];
  lotSeq: number;
  lastHash: string;
  quarantines: QuarantineRecord[];
};

const BASE_BLOCK_RULES: World["blockRules"] = [
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
  {
    code: "REG-D02-05",
    authorityTag: "LEGAL_REQUIREMENT",
    sourceRef: "Directive 02/2012 Art. 7",
    scope: "domestic impurity / grade diversion",
    owner: "ECTA",
    approvalRef: "REG-D02",
  },
  {
    code: "REG-D05-04",
    authorityTag: "LEGAL_REQUIREMENT",
    sourceRef: "Directive 05/2013 Art. 7",
    scope: "transport pass (Shinto) at dispatch",
    owner: "ECTA",
    approvalRef: "REG-D05",
  },
  {
    code: "REG-D05-06",
    authorityTag: "LEGAL_REQUIREMENT",
    sourceRef: "Directive 05/2013 Art. 9",
    scope: "direct linkage price band",
    owner: "ECTA",
    approvalRef: "REG-D05",
  },
];

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
    overlays: [],
    evidence: new Map(),
    issues: [],
    obligations: [],
    contracts: new Map(),
    byProducts: [],
    notifications: [],
    reports: [],
    stocktakes: [],
    schemeClaims: [],
    assessments: [],
    submissions: [],
    blockRules: BASE_BLOCK_RULES.map((r) => ({ ...r })),
    credentials: [],
    sanctions: [],
    externalClaims: [],
    modelRegistry: [],
    regulatorAccess: [],
    priceBand: { maxEtb: 200, minEtb: 170, premiumPct: 5 },
    credentialMatrixRegional: [],
    lotSeq: 1,
    lastHash: "genesis",
    quarantines: [],
  };
}

function hoursFrom(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600 * 1000).toISOString();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Module 06 T5: proper segment-intersection test for polygon rings. */
function ringSelfIntersects(ring: number[][]): boolean {
  const pts = ring.slice();
  if (pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  const n = pts.length;
  const orient = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[1]! - p[1]!) * (r[0]! - q[0]!) - (q[0]! - p[0]!) * (r[1]! - q[1]!));
  const cross = (p1: number[], p2: number[], p3: number[], p4: number[]) => {
    const o1 = orient(p1, p2, p3);
    const o2 = orient(p1, p2, p4);
    const o3 = orient(p3, p4, p1);
    const o4 = orient(p3, p4, p2);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  };
  for (let i = 0; i < n; i++) {
    const a1 = pts[i]!;
    const a2 = pts[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = pts[j]!;
      const b2 = pts[(j + 1) % n]!;
      if (cross(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

const DEFAULT_CAPACITY: Partial<Record<ActorType, CapacityCode>> = {
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

function defaultFacilityCapabilities(t: "washing_station" | "mill"): string[] {
  return [...DEFAULT_FACILITY_CAPABILITIES[t]];
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
  private pendingClientEventId?: string;

  snapshot(): World {
    return this.w;
  }

  /** Replace the entire in-memory world (used when hydrating from Postgres). */
  replaceWorld(world: World): void {
    this.w = world;
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

  /** Actor holding PlatformAdmin — attributes scheduled sweeps (overdue, escalation). */
  platformActorId(): string | undefined {
    return [...this.w.actors.values()].find((a) => a.capacities.includes("PlatformAdmin"))
      ?.actorId;
  }

  private activeSanction(actorId: string): SanctionStep | undefined {
    const list = this.w.sanctions.filter((s) => s.actorId === actorId);
    return list[list.length - 1]?.step;
  }

  private assertCapacity(session: Session, allowed: CapacityCode[]): void {
    if (session.agentKind === "ai_model") {
      throw new EngineError("AI-WRITE-BAN", "AI/model components cannot write canonical records");
    }
    const user = this.w.users.get(session.userId);
    if (!user) {
      throw new EngineError(
        "AUTH-CAPACITY",
        "Unknown user — every action must trace to one identified User",
      );
    }
    if (user.status === "revoked") {
      throw new EngineError("AUTH-CAPACITY", "User access revoked for new actions");
    }
    const actor = this.w.actors.get(session.actorId);
    if (!actor || actor.status !== "active") {
      throw new EngineError("AUTH-CAPACITY", "Actor not active");
    }
    const boundActor = session.assistedByActorId ?? session.actorId;
    if (!user.actorIds.includes(boundActor)) {
      throw new EngineError("AUTH-CAPACITY", "User is not bound to this actor");
    }
    if (session.assistedByActorId && actor.sponsorActorId !== session.assistedByActorId) {
      throw new EngineError(
        "AUTH-CAPACITY",
        "Assisted entry is only allowed for parties you sponsor",
      );
    }
    const sanction = this.activeSanction(actor.actorId);
    if (sanction && SANCTION_LADDER.indexOf(sanction) >= 1) {
      throw new EngineError(
        "REG-D02-06",
        `Actor under sanction (${sanction.replace(/_/g, " ")})`,
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
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

  /** Module 01 step-up: re-authenticate by re-entering the acting actor's legal identity code. */
  private assertStepUp(session: Session, proof?: string): void {
    const actor = this.w.actors.get(session.actorId);
    if (!actor || !proof || proof.trim() !== actor.legalIdentityRef) {
      throw new EngineError(
        "STEP-UP-REQUIRED",
        "Re-authentication required: re-enter your legal identity code",
      );
    }
  }

  private hashFor(ev: Omit<EventRecord, "integrityHash" | "sequence" | "serverCommitTime" | "eventTimeRecorded" | "sourceChannel" | "retrospectiveFlag" | "schemaVersion" | "deviceId" | "channelDetail">, prev: string): string {
    return sha256(
      canonicalJson({
        eventId: ev.eventId,
        eventType: ev.eventType,
        actorId: ev.actorId ?? undefined,
        actingCapacity: ev.actingCapacity ?? undefined,
        userId: ev.userId ?? undefined,
        eventTimeActual: new Date(ev.eventTimeActual).toISOString(),
        affectedObjectIds: [...ev.affectedObjectIds].sort(),
        payload: ev.payload,
        correctsEventId: ev.correctsEventId ?? undefined,
        prev,
      }),
    );
  }

  private commitEvent(
    session: Session,
    eventType: string,
    payload: Record<string, unknown>,
    affected: string[],
    opts?: { correctsEventId?: string },
  ): EventRecord {
    if (session.agentKind === "ai_model") {
      throw new EngineError("AI-WRITE-BAN", "AI/model components cannot write canonical records");
    }
    const eventId = this.pendingClientEventId ?? randomUUID();
    this.pendingClientEventId = undefined;
    if (this.w.events.some((e) => e.eventId === eventId)) {
      throw new EngineError("DUPLICATE-EVENT", `Event ${eventId} already committed`);
    }
    const now = new Date().toISOString();
    const actual = session.eventTimeActual
      ? new Date(session.eventTimeActual).toISOString()
      : now;
    const fullPayload: Record<string, unknown> = { ...payload };
    if (session.assistedByActorId) fullPayload.enteredByActorId = session.assistedByActorId;
    if (session.channelDetail) fullPayload.channelDetail = session.channelDetail;
    const sourceChannel = session.sourceChannel ?? "web";
    const partial = {
      eventId,
      eventType,
      actorId: session.actorId || undefined,
      actingCapacity: session.capacity,
      userId: session.userId || undefined,
      // Postgres stores affected ids as uuid[] — anything else would break the hash after a round trip
      affectedObjectIds: [...new Set(affected.filter((id) => UUID_RE.test(id)))],
      eventTimeActual: actual,
      payload: fullPayload,
      correctsEventId: opts?.correctsEventId,
    };
    const integrityHash = this.hashFor(partial, this.w.lastHash);
    const ev: EventRecord = {
      ...partial,
      schemaVersion: EVENT_SCHEMA_VERSION,
      deviceId: session.deviceId,
      eventTimeRecorded: now,
      serverCommitTime: now,
      sourceChannel,
      channelDetail: session.channelDetail,
      retrospectiveFlag:
        sourceChannel === "mobile_offline_sync" || sourceChannel === "retrospective",
      integrityHash,
      sequence: this.w.events.length + 1,
    };
    this.w.events.push(ev);
    this.w.lastHash = integrityHash;
    this.applyModuleEvent(ev);
    return ev;
  }

  /**
   * Module 00 idempotency: run a command whose first committed event uses the
   * client-generated event_id. A replay of the same id is rejected, never double-applied.
   */
  withClientEventId<T>(clientEventId: string | undefined, fn: () => T): T {
    if (!clientEventId) return fn();
    if (this.w.events.some((e) => e.eventId === clientEventId)) {
      throw new EngineError("DUPLICATE-EVENT", `Event ${clientEventId} already committed`);
    }
    this.pendingClientEventId = clientEventId;
    try {
      return fn();
    } finally {
      this.pendingClientEventId = undefined;
    }
  }

  hasEvent(eventId: string): boolean {
    return this.w.events.some((e) => e.eventId === eventId);
  }

  /** Module 10 T3: recompute the hash chain; any stored-payload edit breaks it. */
  verifyChain(): {
    ok: boolean;
    checked: number;
    legacyUnverifiable: number;
    mismatches: Array<{ sequence: number; eventId: string; eventType: string }>;
    sequenceGaps: number[];
    duplicateEventIds: string[];
  } {
    let prev = "genesis";
    let legacy = 0;
    const mismatches: Array<{ sequence: number; eventId: string; eventType: string }> = [];
    const sequenceGaps: number[] = [];
    const seen = new Set<string>();
    const duplicateEventIds: string[] = [];
    this.w.events.forEach((e, i) => {
      if (seen.has(e.eventId)) duplicateEventIds.push(e.eventId);
      seen.add(e.eventId);
      if (e.sequence !== i + 1) sequenceGaps.push(i + 1);
      if (e.schemaVersion === EVENT_SCHEMA_VERSION) {
        if (this.hashFor(e, prev) !== e.integrityHash) {
          mismatches.push({ sequence: e.sequence, eventId: e.eventId, eventType: e.eventType });
        }
      } else {
        const old = sha256(
          JSON.stringify({ eventId: e.eventId, eventType: e.eventType, payload: e.payload, prev }),
        );
        if (old !== e.integrityHash) legacy++;
      }
      prev = e.integrityHash;
    });
    return {
      ok: mismatches.length === 0 && sequenceGaps.length === 0 && duplicateEventIds.length === 0,
      checked: this.w.events.length,
      legacyUnverifiable: legacy,
      mismatches,
      sequenceGaps,
      duplicateEventIds,
    };
  }

  /**
   * Module 10 T6: after restoration, verify events, sequence, duplicates, lot
   * quantities and lineage. Anything uncertain is an explicit Recovery Exception.
   */
  recoveryVerification(): {
    ok: boolean;
    exceptions: Array<{ kind: string; ref: string; detail: string }>;
  } {
    const exceptions: Array<{ kind: string; ref: string; detail: string }> = [];
    const chain = this.verifyChain();
    for (const m of chain.mismatches) {
      exceptions.push({ kind: "hash_chain_mismatch", ref: m.eventId, detail: `seq ${m.sequence} ${m.eventType}` });
    }
    for (const g of chain.sequenceGaps) {
      exceptions.push({ kind: "sequence_gap", ref: String(g), detail: "event sequence not contiguous" });
    }
    for (const d of chain.duplicateEventIds) {
      exceptions.push({ kind: "duplicate_event", ref: d, detail: "event id appears twice" });
    }
    const eventIds = new Set(this.w.events.map((e) => e.eventId));
    for (const l of this.w.lots.values()) {
      if (!eventIds.has(l.createdEventId)) {
        exceptions.push({ kind: "lot_without_event", ref: l.displayCode, detail: "creating event missing" });
      }
      if (l.inactiveEventId && !eventIds.has(l.inactiveEventId)) {
        exceptions.push({ kind: "lot_without_event", ref: l.displayCode, detail: "deactivating event missing" });
      }
    }
    for (const e of this.w.lineage) {
      if (!this.w.lots.has(e.parentLotId) || !this.w.lots.has(e.childLotId)) {
        exceptions.push({ kind: "lineage_dangling", ref: e.eventId, detail: "edge references missing lot" });
      }
    }
    for (const m of this.w.movements.values()) {
      if (!this.w.lots.has(m.lotId)) {
        exceptions.push({ kind: "movement_dangling", ref: m.movementId, detail: "movement references missing lot" });
      }
    }
    if (!this.integrityChecks().weightBalance.ok) {
      exceptions.push({ kind: "mass_balance", ref: "ledger", detail: "minted ≠ active + closed + reject/loss" });
    }
    return { ok: exceptions.length === 0, exceptions };
  }

  /** Module 15 T4: explicit AI write attempt — always rejected. */
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
    const genericMailbox = /^(info|admin|office|shared|team|sales|contact|general|all|staff|hello)@/i;
    if (input.email && genericMailbox.test(input.email)) {
      throw new EngineError(
        "AUTH-SHARED-LOGIN",
        "Shared organisational logins are not allowed — create one User per person",
      );
    }
    if (/\b(shared|generic|team account|all staff)\b/i.test(input.displayName)) {
      throw new EngineError(
        "AUTH-SHARED-LOGIN",
        "Shared organisational logins are not allowed — create one User per person",
      );
    }
    if (
      input.email &&
      [...this.w.users.values()].some((u) => u.email?.toLowerCase() === input.email!.toLowerCase())
    ) {
      throw new EngineError("AUTH-SHARED-LOGIN", "That email already belongs to another User");
    }
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

  /** Module 01 T4: revocation blocks new actions; history is untouched. Step-up required. */
  revokeUser(session: Session, input: { userId: string; stepUpProof?: string }): void {
    this.assertCapacity(session, ["PlatformAdmin"]);
    this.assertStepUp(session, input.stepUpProof);
    if (!this.w.users.has(input.userId)) throw new EngineError("AUTH-CAPACITY", "User not found");
    this.commitEvent(session, "user_revoked", { userId: input.userId }, []);
  }

  /** Module 01 T1: add a capacity without changing the Actor UID. Step-up required. */
  grantCapacity(
    session: Session,
    input: { actorId: string; capacity: CapacityCode; stepUpProof?: string },
  ): void {
    this.assertCapacity(session, ["PlatformAdmin"]);
    this.assertStepUp(session, input.stepUpProof);
    if (!this.w.actors.has(input.actorId)) throw new EngineError("AUTH-CAPACITY", "Actor not found");
    this.commitEvent(session, "capacity_added", { actorId: input.actorId, capacity: input.capacity }, [
      input.actorId,
    ]);
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
      facility?: {
        capabilities?: string[];
        displayName?: string;
        facilityType?: "washing_station" | "mill";
        metadata?: Record<string, string>;
      };
    },
  ): ActorRecord {
    this.assertCapacity(session, ["Importer", "Exporter", "Aggregator", "Collector", "PlatformAdmin"]);
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
      throw new EngineError("AUTH-CAPACITY", "Sponsor must be acting actor");
    }
    if (!input.displayName?.trim()) {
      throw new EngineError("AUTH-CAPACITY", "Display name required");
    }
    const refs = new Set([...this.w.actors.values()].map((a) => a.legalIdentityRef));
    if (refs.has(input.legalIdentityRef)) {
      throw new EngineError("AUTH-CAPACITY", "legalIdentityRef must be unique");
    }
    const actorId = randomUUID();
    const caps =
      input.capacities ??
      (DEFAULT_CAPACITY[input.actorType] ? [DEFAULT_CAPACITY[input.actorType]!] : []);
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
    const affectedIds = [actorId];
    let facilityActor: ActorRecord | undefined;
    if (input.facility && input.actorType === "akrabi") {
      const facType = input.facility.facilityType ?? "washing_station";
      const facId = randomUUID();
      facilityActor = {
        actorId: facId,
        actorType: facType,
        displayName:
          input.facility.displayName ??
          `${input.displayName} ${facType === "mill" ? "Mill" : "Washing Station"}`,
        legalIdentityRef: `REG-FAC-${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        status: "active",
        sponsorActorId: actorId,
        metadata: {
          region: input.metadata?.region ?? "",
          zone: input.metadata?.zone ?? "",
          woreda: input.metadata?.woreda ?? "",
          ...input.facility.metadata,
          userOnboarded: "true",
        },
        capacities: ["FacilityOperator"],
      };
      this.w.actors.set(facId, facilityActor);
      this.w.facilities.set(facId, {
        actorId: facId,
        capabilities: input.facility.capabilities ?? defaultFacilityCapabilities(facType),
      });
      affectedIds.push(facId);
    }
    if (input.actorType === "washing_station" || input.actorType === "mill") {
      this.w.facilities.set(actorId, {
        actorId,
        capabilities: input.facility?.capabilities ?? defaultFacilityCapabilities(input.actorType),
      });
    }
    this.commitEvent(
      session,
      "actor_onboarded",
      { actor, facility: facilityActor ?? null },
      affectedIds,
    );
    return actor;
  }

  /**
   * Seed/bootstrap onboarding. Still writes `actor_onboarded` (CORE §3.1) —
   * attributed to the platform session when one is given.
   */
  seedActor(
    actor: Omit<ActorRecord, "capacities"> & { capacities?: CapacityCode[] },
    platform?: Session,
  ): ActorRecord {
    const full: ActorRecord = {
      ...actor,
      capacities:
        actor.capacities ??
        (DEFAULT_CAPACITY[actor.actorType] ? [DEFAULT_CAPACITY[actor.actorType]!] : []),
    };
    this.w.actors.set(full.actorId, full);
    const envelope: Session = platform ?? {
      userId: "",
      actorId: full.actorId,
      capacity: full.capacities[0] ?? "PlatformAdmin",
      sourceChannel: "api",
    };
    this.commitEvent(envelope, "actor_onboarded", { actor: full, bootstrap: true }, [full.actorId]);
    return full;
  }

  /** Bootstrap-only repair used when hydrated rows lost their capacity. */
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
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "Importer"]);
    const farmerId = input.farmerActorId ?? session.actorId;
    const farmer = this.w.actors.get(farmerId);
    if (!farmer || farmer.actorType !== "farmer") {
      throw new EngineError("INV-10", "Origin requires a named farmer");
    }
    if (!(input.massKg > 0)) {
      throw new EngineError("INV-07", "Mass must be positive");
    }
    // Farmers are never blocked for missing CoC (Module 01 T5)
    const cropYear = input.cropYear ?? "2025-2026";
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
      createdEventId: "",
      provenance: { [farmerId]: 1 },
      inTransit: false,
      moisturePct: input.moisturePct,
    };
    const ev = this.commitEvent(
      session,
      "origin_lot_created",
      {
        lotId,
        displayCode: lot.displayCode,
        massKg: lot.canonicalMassKg,
        farmerActorId: farmerId,
        processingState: lot.processingState,
        processingRoute: lot.processingRoute,
        cropYear,
        originStatus,
        originalUnit: input.originalUnit,
        originalQuantity: input.originalQuantity,
        conversionBasis: input.conversionBasis,
        moisturePct: input.moisturePct,
      },
      [lotId, farmerId],
    );
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
    this.assertCapacity(session, ["Collector", "Aggregator", "Exporter", "Importer"]);
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
    if (!this.sponsoredSubtreeIds(acting.actorId).has(supplier.actorId)) {
      throw new EngineError("AUTH-CAPACITY", "Supplier not in sponsored network");
    }
    const farmerId = this.resolveFarmerOrigin(input.supplierActorId);
    if (!farmerId) throw new EngineError("INV-10", "No farmer in supplier tree");
    const lot = this.createOriginLot(session, {
      ...input,
      farmerActorId: farmerId,
      processingState:
        input.processingState ??
        (acting.actorType === "exporter" || acting.actorType === "importer" ? "green_washed" : "cherry"),
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
    if (s.actorType === "exporter") {
      for (const agg of this.w.actors.values()) {
        if (agg.sponsorActorId !== s.actorId || agg.actorType !== "akrabi") continue;
        const found = this.resolveFarmerOrigin(agg.actorId);
        if (found) return found;
      }
    }
    return null;
  }

  allowedSendTargets(actorId: string): ActorRecord[] {
    const a = this.w.actors.get(actorId);
    if (!a) return [];
    const types = SEND_MATRIX[a.actorType] ?? [];
    return [...this.w.actors.values()].filter((t) => {
      if (t.status !== "active") return false;
      if (!types.includes(t.actorType)) return false;
      if (a.actorType === "farmer") return t.actorId === a.sponsorActorId;
      if (a.actorType === "collector") return t.actorId === a.sponsorActorId;
      if (a.actorType === "akrabi") return t.actorType === "exporter";
      if (a.actorType === "exporter") {
        if (t.actorType === "akrabi") return t.sponsorActorId === a.actorId;
        return t.actorType === "importer" && t.actorId === a.sponsorActorId;
      }
      if (a.actorType === "importer") return t.actorType === "exporter" && t.sponsorActorId === a.actorId;
      return false;
    });
  }

  /** CORE §7.6: send targets; if empty, chain-partner fallback within the sponsorship tree. */
  allowedTransferTargets(actorId: string): ActorRecord[] {
    const send = this.allowedSendTargets(actorId);
    if (send.length > 0) return send;
    const a = this.w.actors.get(actorId);
    if (!a) return [];
    const types = TRANSFER_FALLBACK_MATRIX[a.actorType] ?? [];
    return [...this.w.actors.values()].filter(
      (t) =>
        t.status === "active" &&
        types.includes(t.actorType) &&
        (t.actorId === a.sponsorActorId || t.sponsorActorId === a.actorId),
    );
  }

  /** Sponsored suppliers allowed for intake (CORE §2.4). */
  allowedIntakeTargets(actorId: string): ActorRecord[] {
    const a = this.w.actors.get(actorId);
    if (!a) return [];
    const types = INTAKE_MATRIX[a.actorType] ?? [];
    const subtree = this.sponsoredSubtreeIds(actorId);
    return [...this.w.actors.values()].filter(
      (t) => subtree.has(t.actorId) && types.includes(t.actorType),
    );
  }

  /** Farm count for lineage header: union of provenance keys on origin lots. */
  farmCountForLot(lotId: string): number {
    const origins = this.traceBackward(lotId);
    const farms = new Set<string>();
    for (const oid of origins) {
      const o = this.w.lots.get(oid);
      if (!o) continue;
      const keys = Object.keys(o.provenance);
      if (keys.length === 0) farms.add(oid);
      else for (const k of keys) farms.add(k);
    }
    return farms.size;
  }

  private isOversight(actorId: string): boolean {
    const a = this.w.actors.get(actorId);
    return !!a && (a.capacities.includes("Regulator") || a.capacities.includes("PlatformAdmin"));
  }

  /**
   * CORE §9 events visible to A: A executed it (acting actor), A is the
   * assisted-entry actor, or A is the payload farmer. Oversight roles see all
   * (and their access is logged by the caller).
   */
  visibleEvents(actorId: string): EventRecord[] {
    if (this.isOversight(actorId)) return [...this.w.events];
    const userIds = new Set(
      [...this.w.users.values()].filter((u) => u.actorIds.includes(actorId)).map((u) => u.userId),
    );
    return this.w.events.filter(
      (e) =>
        e.actorId === actorId ||
        (e.userId != null && userIds.has(e.userId)) ||
        String(e.payload.enteredByActorId ?? "") === actorId ||
        String(e.payload.farmerActorId ?? "") === actorId,
    );
  }

  canSeeLot(actorId: string, lotId: string): boolean {
    if (this.isOversight(actorId)) return this.w.lots.has(lotId);
    return this.visibleLots(actorId).some((l) => l.lotId === lotId);
  }

  /** Last completed inbound movement supplier for a lot (workspace detail). */
  priorSupplierLabel(lotId: string, viewerId: string): string {
    const inbound = [...this.w.movements.values()]
      .filter(
        (m) =>
          m.lotId === lotId &&
          m.toActorId === viewerId &&
          m.state !== "pending" &&
          m.state !== "receipt_overdue",
      )
      .sort((a, b) => (a.dispatchedAt ?? "").localeCompare(b.dispatchedAt ?? ""));
    const last = inbound[inbound.length - 1];
    if (!last) return "Harvest origin";
    return this.displayNameFor(viewerId, last.fromActorId);
  }

  /** REG-D05-04: supply/export coffee needs a complete Shinto transport pass at dispatch. */
  requiresShinto(lotId: string): boolean {
    const lot = this.w.lots.get(lotId);
    return !!lot && SUPPLY_EXPORT_STATES.includes(lot.processingState);
  }

  send(
    session: Session,
    input: {
      lotId: string;
      toActorId: string;
      senderDeclaredKg: number;
      destinationLocationId?: string;
      transporterActorId?: string;
      shinto?: {
        weightKg: number;
        volumeBags: number;
        grade: string;
        sealStatusOrigin: string;
      };
    },
  ): MovementRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "Importer",
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
    if (!(input.senderDeclaredKg > 0)) {
      throw new EngineError("INV-07", "Sender kg must be positive");
    }
    if (input.transporterActorId) {
      const t = this.w.actors.get(input.transporterActorId);
      if (!t || !t.capacities.some((c) => c === "Transporter" || c === "Driver")) {
        throw new EngineError("AUTH-CAPACITY", "Transporter must hold Transporter or Driver capacity");
      }
    }
    let shinto: ShintoPass | undefined;
    if (this.requiresShinto(lot.lotId)) {
      const s = input.shinto;
      if (
        !s ||
        !(s.weightKg > 0) ||
        !(s.volumeBags > 0) ||
        !s.grade?.trim() ||
        !s.sealStatusOrigin?.trim()
      ) {
        throw new EngineError(
          "REG-D05-04",
          "Shinto transport pass incomplete: weight, bags, grade and origin seal status are required",
          "BLOCK",
          "LEGAL_REQUIREMENT",
        );
      }
    }
    if (input.shinto) {
      shinto = {
        weightKg: input.shinto.weightKg,
        volumeBags: input.shinto.volumeBags,
        grade: input.shinto.grade,
        sealStatusOrigin: input.shinto.sealStatusOrigin,
        lotDisplayCode: lot.displayCode,
      };
    }
    const movementId = randomUUID();
    const ev = this.commitEvent(session, "movement_send", {
      movementId,
      lotId: lot.lotId,
      fromActorId: session.actorId,
      toActorId: input.toActorId,
      senderDeclaredKg: input.senderDeclaredKg,
      destinationLocationId: input.destinationLocationId,
      transporterActorId: input.transporterActorId,
      shinto,
    }, [lot.lotId, movementId, input.toActorId]);
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
      dispatchedAt: ev.eventTimeActual,
      transporterActorId: input.transporterActorId,
      shinto,
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
      transactionChannel?: TransactionChannel;
      stationSealIntact?: boolean;
      stationNetWeightKg?: number;
    },
  ): MovementRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "Importer",
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
    if (!(input.receiverDeclaredKg > 0)) {
      throw new EngineError("INV-07", "Receiver kg must be positive");
    }
    if (mov.shinto && input.stationSealIntact == null) {
      throw new EngineError(
        "REG-D05-04",
        "Receiving station must record the Shinto seal check",
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    if (input.transactionChannel && !TRANSACTION_CHANNELS.includes(input.transactionChannel)) {
      throw new EngineError("REG-D02-04", "Unknown transaction channel", "BLOCK", "LEGAL_REQUIREMENT");
    }
    let contract: ContractRecord | undefined;
    if (input.contractId) {
      contract = this.w.contracts.get(input.contractId);
      if (!contract) throw new EngineError("REG-D05-06", "Contract not registered", "BLOCK", "LEGAL_REQUIREMENT");
      if (contract.supplierActorId !== mov.fromActorId || contract.exporterActorId !== session.actorId) {
        throw new EngineError("REG-D05-06", "Contract parties do not match this movement", "BLOCK", "LEGAL_REQUIREMENT");
      }
    }
    if (input.transactionChannel === "direct_linkage" && !contract) {
      throw new EngineError(
        "REG-D05-06",
        "Direct linkage requires a registered contract",
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    const lot = this.w.lots.get(mov.lotId)!;
    const receiver = this.w.actors.get(session.actorId)!;
    const equal = massesEqual(mov.senderDeclaredKg, input.receiverDeclaredKg);
    const state: MovementRecord["state"] = equal ? "received_clean" : "received_discrepant";
    const discrepancyIssueId = equal ? undefined : randomUUID();
    const sealIssueId = mov.shinto && input.stationSealIntact === false ? randomUUID() : undefined;
    const channelIssueId =
      receiver.actorType === "exporter" && !input.transactionChannel ? randomUUID() : undefined;
    const obligation = contract
      ? {
          obligationId: randomUUID(),
          deadline: input.gradedAtAuthorityBranch
            ? new Date().toISOString()
            : new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
          accountableActorId: contract.exporterActorId,
          contractId: contract.contractId,
        }
      : undefined;

    mov.receiverDeclaredKg = input.receiverDeclaredKg;
    mov.state = state;
    if (!equal) {
      this.w.discrepancies.push({
        movementId: mov.movementId,
        senderKg: mov.senderDeclaredKg,
        receiverKg: input.receiverDeclaredKg,
        deltaKg: roundMass(input.receiverDeclaredKg - mov.senderDeclaredKg),
        status: "open",
      });
    }
    // Custody transfers; ownership unchanged; canonicalMassKg NOT rewritten
    lot.custodianActorId = session.actorId;
    lot.locationId = mov.destinationLocationId ?? lot.locationId;
    lot.inTransit = false;
    const ev = this.commitEvent(session, "movement_receive", {
      movementId: mov.movementId,
      lotId: lot.lotId,
      lotDisplayCode: lot.displayCode,
      fromActorId: mov.fromActorId,
      toActorId: mov.toActorId,
      senderDeclaredKg: mov.senderDeclaredKg,
      receiverDeclaredKg: input.receiverDeclaredKg,
      state,
      contractId: input.contractId,
      transactionChannel: input.transactionChannel,
      stationSealIntact: input.stationSealIntact,
      stationNetWeightKg: input.stationNetWeightKg,
      discrepancyIssueId,
      sealIssueId,
      channelIssueId,
      obligation,
    }, [lot.lotId, mov.movementId, mov.fromActorId]);
    mov.receiptEventId = ev.eventId;
    return mov;
  }

  /** CORE §7.5 + Module 09: movement parties dispose a discrepancy; Unresolved is a valid terminal. */
  resolveDiscrepancy(
    session: Session,
    input: { movementId: string; disposition: IssueDisposition; note?: string },
  ): DiscrepancyRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "Importer", "Regulator", "PlatformAdmin"]);
    const mov = this.w.movements.get(input.movementId);
    const d = this.w.discrepancies.find((x) => x.movementId === input.movementId);
    if (!mov || !d) throw new EngineError("INV-11", "No discrepancy on that movement");
    if (d.status !== "open") throw new EngineError("INV-11", "Discrepancy already disposed");
    const party = mov.fromActorId === session.actorId || mov.toActorId === session.actorId;
    if (!party && !this.isOversight(session.actorId)) {
      throw new EngineError("ISSUE-AUTHORITY", "Only movement parties may dispose this discrepancy");
    }
    if (!ISSUE_DISPOSITIONS.includes(input.disposition)) {
      throw new EngineError("ISSUE-AUTHORITY", "Unknown disposition");
    }
    if (input.disposition === "Explained" && !input.note?.trim()) {
      throw new EngineError("ISSUE-EVIDENCE", "An explanation note is required");
    }
    this.commitEvent(session, "discrepancy_resolved", {
      movementId: mov.movementId,
      disposition: input.disposition,
      note: input.note,
    }, [mov.movementId, mov.lotId]);
    return d;
  }

  /** @deprecated use sweep(); kept for callers that mark a single movement. */
  markOverdue(movementId: string): void {
    const mov = this.w.movements.get(movementId);
    const admin = this.platformActorId();
    if (!mov || mov.state !== "pending" || !admin) return;
    this.commitEvent(this.systemSession(admin), "movement_receipt_overdue", {
      movementId,
      lotId: mov.lotId,
      toActorId: mov.toActorId,
      fromActorId: mov.fromActorId,
    }, [movementId, mov.lotId]);
  }

  private systemSession(adminActorId: string): Session {
    const user = [...this.w.users.values()].find((u) => u.actorIds.includes(adminActorId));
    return {
      userId: user?.userId ?? "",
      actorId: adminActorId,
      capacity: "PlatformAdmin",
      sourceChannel: "api",
      agentKind: "integration",
    };
  }

  transferOwnership(
    session: Session,
    input: {
      lotId: string;
      newOwnerActorId: string;
      transactionChannel?: TransactionChannel;
      contractId?: string;
    },
  ): LotRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "Importer"]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot || lot.status !== "active") throw new EngineError("INV-04", "Inactive lot");
    if (lot.inTransit) throw new EngineError("INV-09", "Lot in transit");
    if (lot.ownerActorId !== session.actorId && lot.custodianActorId !== session.actorId) {
      throw new EngineError("INV-12", "Only the current owner or custodian may transfer ownership");
    }
    if (input.newOwnerActorId === lot.ownerActorId) {
      throw new EngineError("INV-07", "Lot already owned by that actor");
    }
    const targets = this.allowedTransferTargets(session.actorId).map((t) => t.actorId);
    if (!targets.includes(input.newOwnerActorId)) {
      throw new EngineError("AUTH-CAPACITY", "Ownership target not allowed");
    }
    if (input.transactionChannel && !TRANSACTION_CHANNELS.includes(input.transactionChannel)) {
      throw new EngineError("REG-D02-04", "Unknown transaction channel", "BLOCK", "LEGAL_REQUIREMENT");
    }
    if (input.contractId && !this.w.contracts.has(input.contractId)) {
      throw new EngineError("REG-D05-06", "Contract not registered", "BLOCK", "LEGAL_REQUIREMENT");
    }
    if (input.transactionChannel === "direct_linkage" && !input.contractId) {
      throw new EngineError(
        "REG-D05-06",
        "Direct linkage requires a registered contract",
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    const newOwner = this.w.actors.get(input.newOwnerActorId)!;
    const acting = this.w.actors.get(session.actorId)!;
    const exporterParty = newOwner.actorType === "exporter" || acting.actorType === "exporter";
    const channelIssueId = exporterParty && !input.transactionChannel ? randomUUID() : undefined;
    const prev = lot.ownerActorId;
    lot.ownerActorId = input.newOwnerActorId;
    if (input.transactionChannel) lot.transactionChannel = input.transactionChannel;
    this.commitEvent(session, "ownership_transfer", {
      lotId: lot.lotId,
      lotDisplayCode: lot.displayCode,
      previousOwnerActorId: prev,
      newOwnerActorId: input.newOwnerActorId,
      transactionChannel: input.transactionChannel,
      contractId: input.contractId,
      channelIssueId,
    }, [lot.lotId, prev, input.newOwnerActorId]);
    return lot;
  }

  disaggregate(
    session: Session,
    input: { parentLotId: string; childMassesKg: number[] },
  ): LotRecord[] {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "Importer", "FacilityOperator"]);
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
    if (input.childMassesKg.some((kg) => !(kg > 0))) {
      throw new EngineError("INV-07", "Every child needs a positive mass");
    }
    const sum = roundMass(input.childMassesKg.reduce((a, b) => a + b, 0));
    if (sum > parent.availableKg + 1e-9) {
      throw new EngineError("DOUBLE-SPEND", "Insufficient available kg");
    }
    if (!massesEqual(sum, parent.availableKg)) {
      throw new EngineError("INV-07", "Children must sum to parent kg");
    }
    const childIds = input.childMassesKg.map(() => randomUUID());
    const ev = this.commitEvent(session, "disaggregate", {
      parentLotId: parent.lotId,
      childLotIds: childIds,
      childMassesKg: input.childMassesKg,
    }, [parent.lotId, ...childIds]);
    const children: LotRecord[] = [];
    input.childMassesKg.forEach((kg, i) => {
      const childId = childIds[i]!;
      const child: LotRecord = {
        ...parent,
        lotId: childId,
        displayCode: this.nextLotCode(),
        canonicalMassKg: roundMass(kg),
        availableKg: roundMass(kg),
        createdByActorId: session.actorId,
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
    });
    parent.status = "inactive";
    parent.availableKg = 0;
    parent.inactiveEventId = ev.eventId;
    return children;
  }

  aggregate(
    session: Session,
    input: { parentLotIds: string[] },
  ): LotRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "Importer", "FacilityOperator"]);
    if (new Set(input.parentLotIds).size < 2) {
      throw new EngineError("INV-07", "Aggregate needs ≥2 distinct parents");
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
    for (const p of parents) {
      if (wouldCreateCycle(this.w.lineage, p.lotId, childId)) {
        throw new EngineError("LINEAGE-CYCLE", "Circular lineage rejected");
      }
    }
    const ev = this.commitEvent(session, "aggregate", {
      parentLotIds: input.parentLotIds,
      childLotId: childId,
      massKg: total,
    }, [...input.parentLotIds, childId]);
    for (const p of parents) {
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
    const years = Object.keys(cropYearComposition);
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
      // never relabel a mix as the newest year; a single-year mix keeps its year
      cropYear: years.length === 1 ? years[0] : undefined,
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
      outputMassKg?: number;
      byProducts?: Array<{ kind: string; massKg: number; disposition?: string }>;
    },
  ): LotRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "FacilityOperator",
      "WarehouseOperator",
    ]);
    if (!PROCESS_OUTPUT_STATES.includes(input.outputState)) {
      throw new EngineError("INV-07", `Cannot process into ${input.outputState}`);
    }
    if (new Set(input.inputLotIds).size !== input.inputLotIds.length || input.inputLotIds.length === 0) {
      throw new EngineError("INV-07", "Inputs must be distinct lots");
    }
    const inputs = input.inputLotIds.map((id) => {
      const l = this.w.lots.get(id);
      if (!l || l.status !== "active") throw new EngineError("INV-04", "Input inactive");
      if (l.inTransit) throw new EngineError("INV-09", "In transit");
      if (l.custodianActorId !== session.actorId) {
        throw new EngineError("INV-12", "Not custodian");
      }
      return l;
    });
    if (input.lossKg == null || Number.isNaN(input.lossKg) || input.lossKg < 0) {
      throw new EngineError("INV-07", "Loss must be explicitly entered (0 or more)");
    }
    if (input.rejectKg == null || Number.isNaN(input.rejectKg) || input.rejectKg < 0) {
      throw new EngineError("INV-07", "Reject must be explicitly entered (0 or more)");
    }
    const byProducts = (input.byProducts ?? []).filter((b) => b.massKg > 0);
    const totalIn = roundMass(inputs.reduce((s, l) => s + l.canonicalMassKg, 0));
    const byProductKg = roundMass(byProducts.reduce((s, b) => s + b.massKg, 0));
    const outputMassKg = roundMass(totalIn - input.rejectKg - input.lossKg - byProductKg);
    if (!(outputMassKg > 0)) {
      throw new EngineError("INV-07", "Reject + loss leave no product");
    }
    if (input.outputMassKg != null && !massesEqual(input.outputMassKg, outputMassKg)) {
      throw new EngineError(
        "INV-07",
        `Mass balance does not close: input ${totalIn} ≠ product ${input.outputMassKg} + reject ${input.rejectKg} + loss ${input.lossKg}${byProductKg ? ` + by-products ${byProductKg}` : ""}`,
      );
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
      const needed = PROCESS_CAPABILITY_FOR_OUTPUT[input.outputState];
      if (!fac || (needed && !fac.capabilities.includes(needed))) {
        throw new EngineError(
          "FACILITY-CAP",
          `Facility lacks the ${needed ?? "required"} capability for ${input.outputState}`,
          "BLOCK",
          "LEGAL_REQUIREMENT",
        );
      }
      const facActor = this.w.actors.get(input.facilityActorId);
      if (!facActor || facActor.status !== "active") {
        throw new EngineError("FACILITY-CAP", "Facility is not active", "BLOCK", "LEGAL_REQUIREMENT");
      }
    }
    const isSupplyExport = SUPPLY_EXPORT_STATES.includes(input.outputState);
    const moisture = input.moisturePct;
    if (
      isSupplyExport &&
      moisture != null &&
      (moisture < MOISTURE_MIN || moisture > MOISTURE_MAX)
    ) {
      throw new EngineError(
        "REG-D02-02",
        `Moisture ${moisture}% outside ${MOISTURE_MIN.toFixed(1)}–${MOISTURE_MAX.toFixed(1)}%`,
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
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

    const childId = randomUUID();
    const inState = inputs[0]!.processingState;
    const yieldPct = totalIn > 0 ? (outputMassKg / totalIn) * 100 : 0;
    const ref = YIELD_REFERENCE_RANGES.find(
      (r) => r.from.includes(inState) && r.to.includes(input.outputState),
    );
    const yieldIssueId =
      ref && (yieldPct < ref.minPct || yieldPct > ref.maxPct) ? randomUUID() : undefined;
    // Missing moisture on supply/export output is a FLAG — never stored as 0 (Module 00 §6)
    const moistureIssueId = isSupplyExport && moisture == null ? randomUUID() : undefined;
    const byProductRecords = byProducts.map((b) => ({
      id: randomUUID(),
      kind: b.kind,
      massKg: roundMass(b.massKg),
      disposition: b.disposition ?? "recorded",
    }));
    for (const p of inputs) {
      if (wouldCreateCycle(this.w.lineage, p.lotId, childId)) {
        throw new EngineError("LINEAGE-CYCLE", "Circular lineage");
      }
    }

    const ev = this.commitEvent(session, "process", {
      inputLotIds: input.inputLotIds,
      childLotId: childId,
      inputMassKg: totalIn,
      outputState: input.outputState,
      outputMassKg,
      rejectKg: input.rejectKg,
      lossKg: input.lossKg,
      lossCategory: input.lossCategory,
      byProducts: byProductRecords,
      facilityActorId: input.facilityActorId,
      moisturePct: moisture,
      blendingPermitRef: input.blendingPermitRef,
      yieldPct: Math.round(yieldPct * 10) / 10,
      yieldReference: ref
        ? { minPct: ref.minPct, maxPct: ref.maxPct, version: YIELD_REFERENCE_VERSION, sourceRef: ref.sourceRef, authorityTag: ref.authorityTag }
        : undefined,
      yieldIssueId,
      moistureIssueId,
    }, [...input.inputLotIds, childId, ...(input.facilityActorId ? [input.facilityActorId] : [])]);

    for (const p of inputs) {
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
    const cropYearComposition = mixCropYears(
      inputs.map((p) => ({
        kg: p.canonicalMassKg,
        composition: p.cropYearComposition,
        cropYear: p.cropYear,
      })),
    );
    const years = Object.keys(cropYearComposition);
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
      cropYear: years.length === 1 ? years[0] : undefined,
      cropYearComposition,
      originStatus: first.originStatus,
      createdByActorId: session.actorId,
      createdEventId: ev.eventId,
      provenance: mixProvenance(
        inputs.map((p) => ({ kg: p.canonicalMassKg, provenance: p.provenance })),
      ),
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
      buyerActorId?: string;
      note?: string;
    },
  ): LotRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Aggregator", "Exporter", "Importer"]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot || lot.status !== "active") throw new EngineError("INV-04", "Inactive");
    if (lot.inTransit) throw new EngineError("INV-09", "In transit");
    if (lot.custodianActorId !== session.actorId) {
      throw new EngineError("INV-12", "Only the current custodian may close this lot");
    }
    if (!["fob_export", "domestic_disposition", "destroyed"].includes(input.reason)) {
      throw new EngineError("INV-07", "Unknown close reason");
    }
    if (input.buyerActorId) {
      const b = this.w.actors.get(input.buyerActorId);
      if (!b || !b.capacities.includes("Importer")) {
        throw new EngineError("AUTH-CAPACITY", "FOB buyer must be an Importer");
      }
    }
    if (input.reason === "domestic_disposition") {
      if (input.impurityPct == null || Number.isNaN(input.impurityPct)) {
        throw new EngineError(
          "REG-D02-05",
          "Domestic disposition needs the measured impurity %",
          "BLOCK",
          "LEGAL_REQUIREMENT",
        );
      }
      if (input.impurityPct > 15) {
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
      lotDisplayCode: lot.displayCode,
      reason: input.reason,
      massKg: lot.canonicalMassKg,
      impurityPct: input.impurityPct,
      buyerActorId: input.buyerActorId,
      note: input.note,
    }, [lot.lotId, ...(input.buyerActorId ? [input.buyerActorId] : [])]);
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

  /**
   * Module 00: corrections are new events referencing the original; the
   * original is never edited. Only its executor (or oversight) may correct.
   */
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
    if (!input.reason?.trim()) throw new EngineError("INV-02", "A correction reason is required");
    if (orig.actorId !== session.actorId && !this.isOversight(session.actorId)) {
      throw new EngineError("AUTH-CAPACITY", "Only the recording actor may correct this event");
    }
    return this.commitEvent(
      session,
      "correction",
      { reason: input.reason, corrected: input.correctedPayload, originalEventType: orig.eventType },
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
      disputeRecourse?: string;
      registrationRef: string;
      supplierHasCoC?: boolean;
      exporterHasCoC?: boolean;
    },
  ): ContractRecord {
    this.assertCapacity(session, ["Exporter", "Aggregator", "PlatformAdmin"]);
    const required: Array<keyof typeof input> = [
      "coffeeType",
      "grade",
      "executionPeriod",
      "paymentTerms",
      "deliverySite",
      "transportCostAlloc",
      "registrationRef",
    ];
    const missing = required.filter((k) => !String(input[k] ?? "").trim());
    if (missing.length || !(input.quantityKg > 0)) {
      throw new EngineError(
        "REG-D05-06",
        `Contract missing mandatory terms: ${[...missing, ...(input.quantityKg > 0 ? [] : ["quantityKg"])].join(", ")}`,
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    const supplierCoC = input.supplierHasCoC ?? this.hasActiveCoC(input.supplierActorId);
    const exporterCoC = input.exporterHasCoC ?? this.hasActiveCoC(input.exporterActorId);
    if (!supplierCoC || !exporterCoC) {
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
    const c: ContractRecord = {
      contractId: randomUUID(),
      supplierActorId: input.supplierActorId,
      exporterActorId: input.exporterActorId,
      priceEtbPerKg: input.priceEtbPerKg,
      quantityKg: input.quantityKg,
      grade: input.grade,
      coffeeType: input.coffeeType,
      executionPeriod: input.executionPeriod,
      paymentTerms: input.paymentTerms,
      deliverySite: input.deliverySite,
      transportCostAlloc: input.transportCostAlloc,
      disputeRecourse: input.disputeRecourse ?? "ECTA arbitration",
      registrationRef: input.registrationRef,
    };
    this.commitEvent(session, "contract_registered", { contract: c }, [
      c.contractId,
      c.supplierActorId,
      c.exporterActorId,
    ]);
    return this.w.contracts.get(c.contractId)!;
  }

  private hasActiveCoC(actorId: string): boolean {
    const now = Date.now();
    return this.w.credentials.some(
      (c) =>
        c.actorId === actorId &&
        c.status === "ACTIVE" &&
        new Date(c.validTo).getTime() > now,
    );
  }

  // ── Farms & geometry (Module 06) ─────────────────────────────────────────

  createFarm(
    session: Session,
    input: { ownerActorId: string; displayName: string; pointLat?: number; pointLng?: number },
  ): FarmRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Verifier", "PlatformAdmin"]);
    const owner = this.w.actors.get(input.ownerActorId);
    if (!owner || owner.actorType !== "farmer") {
      throw new EngineError("INV-10", "Farm owner must be a farmer");
    }
    if (
      session.capacity === "Farmer" && session.actorId !== input.ownerActorId
    ) {
      throw new EngineError("AUTH-CAPACITY", "Farmers may only register their own farms");
    }
    if (
      session.capacity === "Collector" && owner.sponsorActorId !== session.actorId
    ) {
      throw new EngineError("AUTH-CAPACITY", "Collectors may only register farms of farmers they sponsor");
    }
    const farm: FarmRecord = { farmId: randomUUID(), ...input };
    this.commitEvent(session, "farm_created", { farm }, [farm.farmId, input.ownerActorId]);
    return this.w.farms.get(farm.farmId)!;
  }

  createFarmUnit(
    session: Session,
    input: { farmId: string; displayName: string },
  ): FarmUnitRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Verifier", "PlatformAdmin"]);
    const farm = this.w.farms.get(input.farmId);
    if (!farm) throw new EngineError("INV-04", "Farm not found");
    const unit: FarmUnitRecord = {
      farmUnitId: randomUUID(),
      farmId: input.farmId,
      displayName: input.displayName,
      polygonPending: true,
    };
    this.commitEvent(session, "farm_unit_created", { unit, farmerActorId: farm.ownerActorId }, [
      unit.farmUnitId,
      input.farmId,
    ]);
    return this.w.farmUnits.get(unit.farmUnitId)!;
  }

  addGeometryVersion(
    session: Session,
    input: { farmUnitId: string; geojson?: { type: string; coordinates: unknown } },
  ): GeometryVersionRecord {
    this.assertCapacity(session, ["Farmer", "Collector", "Verifier", "PlatformAdmin"]);
    const unit = this.w.farmUnits.get(input.farmUnitId);
    if (!unit) throw new EngineError("INV-04", "Farm unit not found");
    const existing = this.w.geometries.filter((g) => g.farmUnitId === input.farmUnitId);
    const used = existing.find((g) => g.usedInCompliance);
    if (used && (session.capacity === "Farmer" || session.capacity === "Collector")) {
      throw new EngineError(
        "AUTH-CAPACITY",
        "Geometry already used in compliance — a Verifier must record the new version",
      );
    }
    const anomalyFlags: string[] = [];
    if (input.geojson?.type === "Polygon") {
      const ring = (input.geojson.coordinates as number[][][] | undefined)?.[0] ?? [];
      if (ring.length < 4) anomalyFlags.push("implausible_ring");
      else if (ringSelfIntersects(ring)) anomalyFlags.push("self_intersection");
    } else if (input.geojson) {
      anomalyFlags.push("unsupported_geometry_type");
    }
    const g: GeometryVersionRecord = {
      id: randomUUID(),
      farmUnitId: input.farmUnitId,
      version: existing.length + 1,
      geojson: input.geojson,
      anomalyFlags,
      usedInCompliance: false,
    };
    const farm = this.w.farms.get(unit.farmId);
    this.commitEvent(session, "geometry_version_added", { geometry: g, farmerActorId: farm?.ownerActorId }, [
      g.id,
      input.farmUnitId,
    ]);
    return this.w.geometries.find((x) => x.id === g.id)!;
  }

  /** Module 06 T4: overlay results reference the exact geometry version and dataset. */
  recordOverlay(
    session: Session,
    input: { farmUnitId: string; dataset: string; result: string },
  ): OverlayRecord {
    this.assertCapacity(session, ["Verifier", "PlatformAdmin"]);
    const versions = this.w.geometries.filter((g) => g.farmUnitId === input.farmUnitId);
    const latest = versions[versions.length - 1];
    if (!latest) throw new EngineError("INV-04", "No geometry version to overlay");
    const o: OverlayRecord = {
      id: randomUUID(),
      farmUnitId: input.farmUnitId,
      geometryVersionId: latest.id,
      dataset: input.dataset,
      result: input.result,
      authorityTag: "OFFICIAL_TECHNICAL_STANDARD",
    };
    this.commitEvent(session, "overlay_recorded", { overlay: o }, [o.id, latest.id]);
    return o;
  }

  // ── Evidence (Module 07) ─────────────────────────────────────────────────

  uploadEvidence(
    session: Session,
    input: {
      attachedType: string;
      attachedId: string;
      evidenceClass: EvidenceRecord["evidenceClass"];
      documentType: string;
      factSupported: string;
      issuer?: string;
      sha256?: string;
      validFrom?: string;
      validTo?: string;
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
    if (input.attachedType === "lot" && !this.canSeeLot(session.actorId, input.attachedId)) {
      throw new EngineError("AUTH-CAPACITY", "Evidence can only be attached to lots you can see");
    }
    if (!input.documentType?.trim() || !input.factSupported?.trim()) {
      throw new EngineError("ISSUE-EVIDENCE", "Evidence needs a document type and the fact it supports");
    }
    const evidenceId = randomUUID();
    const e: EvidenceRecord = {
      evidenceId,
      attachedType: input.attachedType,
      attachedId: input.attachedId,
      evidenceClass: input.evidenceClass,
      documentType: input.documentType,
      factSupported: input.factSupported,
      issuer: input.issuer,
      sha256: input.sha256,
      uploaderActorId: session.actorId,
      status: "UPLOADED",
      validFrom: input.validFrom,
      validTo: input.validTo,
      verifications: [],
    };
    const ev = this.commitEvent(session, "evidence_uploaded", { evidence: e }, [
      evidenceId,
      ...(input.attachedType === "lot" ? [input.attachedId] : []),
    ]);
    this.systemValidateEvidence(session, evidenceId, ev.eventTimeActual);
    return this.w.evidence.get(evidenceId)!;
  }

  /** Module 07 T2: SYSTEM_VALIDATED means format/date/hash checks only — never authority verification. */
  private systemValidateEvidence(session: Session, evidenceId: string, atIso: string): void {
    const e = this.w.evidence.get(evidenceId)!;
    const failures: string[] = [];
    if (e.validFrom && Number.isNaN(Date.parse(e.validFrom))) failures.push("valid_from_unparseable");
    if (e.validTo && Number.isNaN(Date.parse(e.validTo))) failures.push("valid_to_unparseable");
    if (e.validFrom && e.validTo && Date.parse(e.validTo) < Date.parse(e.validFrom)) {
      failures.push("valid_to_before_valid_from");
    }
    if (e.validTo && Date.parse(e.validTo) < Date.parse(atIso)) failures.push("already_expired");
    if (e.sha256 && !/^[a-f0-9]{64}$/i.test(e.sha256)) failures.push("hash_malformed");
    if (e.evidenceClass !== "self_assessment" && !e.issuer?.trim()) failures.push("issuer_missing");
    this.commitEvent(session, "evidence_system_validated", {
      evidenceId,
      passed: failures.length === 0,
      failures,
    }, [evidenceId]);
  }

  verifyEvidence(
    session: Session,
    evidenceId: string,
    input: { authority?: string } = {},
  ): EvidenceRecord {
    this.assertCapacity(session, ["Verifier", "Regulator", "PlatformAdmin"]);
    const e = this.w.evidence.get(evidenceId);
    if (!e) throw new EngineError("INV-04", "Evidence not found");
    if (e.uploaderActorId === session.actorId) {
      throw new EngineError("ISSUE-AUTHORITY", "An uploader cannot verify their own evidence");
    }
    if (e.status === "REVOKED" || e.status === "SUPERSEDED") {
      throw new EngineError("ISSUE-EVIDENCE", `Evidence is ${e.status.toLowerCase()}`);
    }
    const actor = this.w.actors.get(session.actorId)!;
    this.commitEvent(session, "evidence_verified", {
      evidenceId,
      verifierActorId: session.actorId,
      authority: input.authority ?? actor.displayName,
    }, [evidenceId]);
    return e;
  }

  revokeEvidence(
    session: Session,
    evidenceId: string,
    effectiveDate: string,
    reason = "revoked by issuer",
  ): EvidenceRecord {
    this.assertCapacity(session, ["Verifier", "Regulator", "PlatformAdmin"]);
    const e = this.w.evidence.get(evidenceId);
    if (!e) throw new EngineError("INV-04", "Evidence not found");
    if (Number.isNaN(Date.parse(effectiveDate))) {
      throw new EngineError("ISSUE-EVIDENCE", "Revocation needs a valid effective date");
    }
    this.commitEvent(session, "evidence_revoked", {
      evidenceId,
      effectiveDate: new Date(effectiveDate).toISOString(),
      reason,
      uploaderActorId: e.uploaderActorId,
    }, [evidenceId]);
    return e;
  }

  /** Module 07 T4: validity is evaluated at a point in time; revocation is not retroactive past its effective date. */
  evidenceValidAt(evidenceId: string, atIso: string): boolean {
    const e = this.w.evidence.get(evidenceId);
    if (!e) return false;
    const at = new Date(atIso).getTime();
    if (e.revokedEffective && at >= new Date(e.revokedEffective).getTime()) return false;
    if (e.validFrom && at < new Date(e.validFrom).getTime()) return false;
    if (e.validTo && at > new Date(e.validTo).getTime()) return false;
    return e.status !== "SUPERSEDED";
  }

  // ── Inventory (Module 05) ────────────────────────────────────────────────

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

  /**
   * Module 05: stocktake compares physical count to the theoretical balance of
   * the stock holder. Variance is recorded, never silently written into lots.
   */
  stocktake(
    session: Session,
    input: {
      facilityActorId?: string;
      coffeeState: CoffeeState;
      physicalKg: number;
    },
  ): StocktakeRecord {
    this.assertCapacity(session, ["WarehouseOperator", "FacilityOperator", "Aggregator", "Exporter", "Collector"]);
    if (!(input.physicalKg >= 0)) throw new EngineError("INV-07", "Physical count must be 0 or more");
    const stockHolderActorId = session.actorId;
    const theoreticalKg = this.stockBalance(stockHolderActorId, input.coffeeState);
    const varianceKg = roundMass(input.physicalKg - theoreticalKg);
    const tolerance = Math.max(50, theoreticalKg * 0.02);
    const prior = this.w.stocktakes
      .filter((s) => s.stockHolderActorId === stockHolderActorId && s.coffeeState === input.coffeeState)
      .slice(-2);
    const pattern =
      varianceKg < 0 && prior.length === 2 && prior.every((s) => s.varianceKg < 0);
    const id = randomUUID();
    const varianceIssueId = Math.abs(varianceKg) > tolerance ? randomUUID() : undefined;
    const patternIssueId = pattern ? randomUUID() : undefined;
    this.commitEvent(session, "stocktake_recorded", {
      stocktake: {
        id,
        facilityActorId: input.facilityActorId ?? stockHolderActorId,
        stockHolderActorId,
        coffeeState: input.coffeeState,
        theoreticalKg,
        physicalKg: input.physicalKg,
        varianceKg,
        adjustments: [],
      },
      toleranceKg: tolerance,
      varianceIssueId,
      patternIssueId,
    }, [id, stockHolderActorId]);
    return this.w.stocktakes.find((s) => s.id === id)!;
  }

  recordStockAdjustment(
    session: Session,
    input: { stocktakeId: string; reason: string },
  ): StocktakeRecord {
    this.assertCapacity(session, ["WarehouseOperator", "FacilityOperator", "Aggregator", "Exporter", "Collector"]);
    const st = this.w.stocktakes.find((s) => s.id === input.stocktakeId);
    if (!st) throw new EngineError("INV-04", "Stocktake not found");
    if (st.stockHolderActorId !== session.actorId) {
      throw new EngineError("AUTH-CAPACITY", "Only the stock holder may explain this variance");
    }
    if (!input.reason?.trim()) throw new EngineError("ISSUE-EVIDENCE", "Adjustment reason required");
    this.commitEvent(session, "stock_adjustment_recorded", {
      stocktakeId: st.id,
      reason: input.reason,
    }, [st.id]);
    return st;
  }

  // ── Compliance (Module 08) ───────────────────────────────────────────────

  /** Framework version effective at a given time (versions are immutable). */
  frameworkVersionAt(frameworkCode: string, atIso: string) {
    const at = Date.parse(atIso);
    return FRAMEWORK_VERSIONS.filter(
      (f) => f.frameworkCode === frameworkCode && Date.parse(f.effectiveFrom) <= at,
    ).sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
  }

  private farmerGeolocated(farmerActorId: string): boolean {
    const farmer = this.w.actors.get(farmerActorId);
    const farms = [...this.w.farms.values()].filter((f) => f.ownerActorId === farmerActorId);
    for (const f of farms) {
      const units = [...this.w.farmUnits.values()].filter((u) => u.farmId === f.farmId);
      for (const u of units) {
        const versions = this.w.geometries.filter((g) => g.farmUnitId === u.farmUnitId);
        const latest = versions[versions.length - 1];
        if (latest?.geojson && latest.anomalyFlags.length === 0) return true;
      }
      // EUDR Art. 2(28): plots ≤ 4 ha may be described by a single point
      const ha = Number(farmer?.metadata?.farmSizeHa ?? NaN);
      if (f.pointLat != null && f.pointLng != null && Number.isFinite(ha) && ha <= 4) return true;
    }
    return false;
  }

  private ancestorLotIds(lotId: string): Set<string> {
    const ids = new Set<string>([lotId]);
    const queue = [lotId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of this.w.lineage) {
        if (e.childLotId === id && !ids.has(e.parentLotId)) {
          ids.add(e.parentLotId);
          queue.push(e.parentLotId);
        }
      }
    }
    return ids;
  }

  assessLotCompliance(
    session: Session,
    input: { lotId: string; frameworkCode: string; market: string; atEventTime?: string },
  ): ComplianceAssessmentRecord {
    this.assertCapacity(session, ["Exporter", "Aggregator", "Verifier", "Regulator", "PlatformAdmin", "Importer"]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot || !this.canSeeLot(session.actorId, input.lotId)) {
      throw new EngineError("AUTH-CAPACITY", "Lot not visible");
    }
    const createdAt =
      this.w.events.find((e) => e.eventId === lot.createdEventId)?.eventTimeActual ??
      new Date().toISOString();
    const at = input.atEventTime ?? createdAt;
    const fw = this.frameworkVersionAt(input.frameworkCode, at);
    if (!fw) throw new EngineError("INV-04", `No ${input.frameworkCode} version effective at ${at}`);
    const lotIds = this.ancestorLotIds(lot.lotId);
    const farmerIds = new Set<string>();
    for (const oid of this.traceBackward(lot.lotId)) {
      for (const k of Object.keys(this.w.lots.get(oid)?.provenance ?? {})) farmerIds.add(k);
    }
    const nowIso = new Date().toISOString();
    const results: ComplianceRequirementResult[] = fw.requirements.map((r) => {
      if (!r.appliesToMarkets.includes(input.market)) {
        return { code: r.code, title: r.title, status: "NOT_APPLICABLE", basis: `market ${input.market} not in scope` };
      }
      if (r.kind === "all_origins_geolocated") {
        const complete: string[] = [];
        const missing: string[] = [];
        for (const f of farmerIds) (this.farmerGeolocated(f) ? complete : missing).push(f);
        return {
          code: r.code,
          title: r.title,
          status: missing.length === 0 && complete.length > 0 ? "READY" : "INCOMPLETE",
          basis: `${complete.length} of ${farmerIds.size} origin farmers geolocated · ${r.sourceRef}`,
          composition: {
            complete: complete.length,
            missing: missing.length,
            completeFarmers: complete,
            missingFarmers: missing,
          },
        };
      }
      if (r.kind === "lot_evidence_verified") {
        const ev = [...this.w.evidence.values()].filter(
          (e) =>
            e.attachedType === "lot" &&
            lotIds.has(e.attachedId) &&
            e.documentType === r.evidenceDocumentType &&
            e.status === "VERIFIED" &&
            this.evidenceValidAt(e.evidenceId, nowIso),
        );
        return {
          code: r.code,
          title: r.title,
          status: ev.length ? "READY" : "INCOMPLETE",
          basis: ev.length
            ? `verified ${r.evidenceDocumentType} on file · ${r.sourceRef}`
            : `no verified ${r.evidenceDocumentType} · ${r.sourceRef}`,
          evidenceIds: ev.map((e) => e.evidenceId),
        };
      }
      return {
        code: r.code,
        title: r.title,
        status: "REQUIRES_EXTERNAL_VERIFICATION",
        basis: `outside ledger scope · ${r.sourceRef}`,
      };
    });
    const openException = this.w.issues.some(
      (i) => i.lifecycle === "CONFIRMED_EXCEPTION" && i.lotIds.some((id) => lotIds.has(id)),
    );
    if (openException) {
      results.push({
        code: "LEDGER-EXCEPTION",
        title: "No confirmed exception on lot ancestry",
        status: "EXCEPTION",
        basis: "confirmed exception open on this lot or an ancestor",
      });
    }
    const assessment: ComplianceAssessmentRecord = {
      assessmentId: randomUUID(),
      lotId: lot.lotId,
      frameworkCode: fw.frameworkCode,
      frameworkVersion: fw.version,
      evaluatedAtEventTime: at,
      market: input.market,
      results,
      eventId: "",
    };
    this.commitEvent(session, "compliance_assessed", {
      assessment,
      farmerActorIds: [...farmerIds],
    }, [assessment.assessmentId, lot.lotId]);
    return this.w.assessments.find((a) => a.assessmentId === assessment.assessmentId)!;
  }

  submitCompliance(
    session: Session,
    input: { assessmentId: string; recipient: string },
  ): SubmissionRecord {
    this.assertCapacity(session, ["Exporter", "PlatformAdmin"]);
    const a = this.w.assessments.find((x) => x.assessmentId === input.assessmentId);
    if (!a) throw new EngineError("INV-04", "Assessment not found");
    const blocking = a.results.filter((r) => r.status === "INCOMPLETE" || r.status === "EXCEPTION");
    if (blocking.length) {
      throw new EngineError(
        "COMPLIANCE-INCOMPLETE",
        `Cannot submit: ${blocking.map((r) => `${r.code} ${r.status}`).join(", ")}`,
      );
    }
    const submissionId = randomUUID();
    this.commitEvent(session, "submission_created", {
      submissionId,
      assessmentId: a.assessmentId,
      lotId: a.lotId,
      recipient: input.recipient,
      payloadSnapshot: { assessment: a },
    }, [submissionId, a.assessmentId, a.lotId]);
    return this.w.submissions.find((s) => s.submissionId === submissionId)!;
  }

  /** Module 08 T6: an external rejection is an EXCEPTION with both determinations kept — never overwritten. */
  recordSubmissionOutcome(
    session: Session,
    input: {
      submissionId: string;
      outcome: "ACKNOWLEDGED" | "REJECTED";
      externalRef?: string;
      reason?: string;
    },
  ): SubmissionRecord {
    this.assertCapacity(session, ["Exporter", "PlatformAdmin"]);
    const s = this.w.submissions.find((x) => x.submissionId === input.submissionId);
    if (!s) throw new EngineError("INV-04", "Submission not found");
    if (input.outcome === "REJECTED" && !input.reason?.trim()) {
      throw new EngineError("ISSUE-EVIDENCE", "Rejection reason required");
    }
    this.commitEvent(session, "submission_outcome_recorded", {
      submissionId: s.submissionId,
      lotId: s.lotId,
      outcome: input.outcome,
      externalRef: input.externalRef,
      reason: input.reason,
      issueId: input.outcome === "REJECTED" ? randomUUID() : undefined,
    }, [s.submissionId, s.lotId]);
    return s;
  }

  claimSchemeVolume(
    session: Session,
    input: { lotId: string; scheme: string; claimedKg: number; allowance?: boolean },
  ): void {
    this.assertCapacity(session, ["Exporter", "Aggregator", "Verifier", "PlatformAdmin"]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot) throw new EngineError("INV-04", "Lot not found");
    const existing = this.w.schemeClaims
      .filter((c) => c.lotId === input.lotId)
      .reduce((s, c) => s + c.claimedKg, 0);
    if (existing + input.claimedKg > lot.canonicalMassKg + 1e-9 && !input.allowance) {
      throw new EngineError(
        "AUTH-CAPACITY",
        "Cross-scheme claim exceeds physical quantity",
      );
    }
    this.commitEvent(session, "scheme_claim_recorded", {
      lotId: input.lotId,
      scheme: input.scheme,
      claimedKg: input.claimedKg,
      allowance: !!input.allowance,
    }, [input.lotId]);
  }

  // ── Issues & obligations (Module 09) ─────────────────────────────────────

  raiseIssue(
    session: Session,
    input: {
      intervention: IssueRecord["intervention"];
      authorityTag?: AuthorityTag;
      subjectType: string;
      subjectId: string;
      summary: string;
      lotIds?: string[];
      partyActorIds?: string[];
      ruleRef?: string;
      lifecycle?: IssueRecord["lifecycle"];
    },
  ): IssueRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "Verifier",
      "Regulator",
      "PlatformAdmin",
      "FacilityOperator",
      "WarehouseOperator",
      "Importer",
    ]);
    if (!input.summary?.trim()) throw new EngineError("ISSUE-EVIDENCE", "Issue summary required");
    const issueId = randomUUID();
    this.commitEvent(session, "issue_raised", {
      issue: {
        issueId,
        lifecycle: input.lifecycle ?? (session.capacity === "Regulator" ? "INVESTIGATION" : "ANOMALY_WARNING"),
        intervention: input.intervention,
        authorityTag: input.authorityTag,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        summary: input.summary,
        lotIds: input.lotIds ?? [],
        partyActorIds: [...new Set([session.actorId, ...(input.partyActorIds ?? [])])],
        raisedByActorId: session.actorId,
        raisedByCapacity: session.capacity,
        ruleRef: input.ruleRef,
      },
    }, [issueId, ...(input.lotIds ?? [])]);
    return this.w.issues.find((i) => i.issueId === issueId)!;
  }

  /** REG-D05-05: a grading dispute is a WARN issue between the parties — the grade is never overwritten. */
  raiseGradingDispute(
    session: Session,
    input: { lotId: string; assignedGrade: string; claimedGrade: string; note?: string },
  ): IssueRecord {
    const lot = this.w.lots.get(input.lotId);
    if (!lot || !this.canSeeLot(session.actorId, input.lotId)) {
      throw new EngineError("AUTH-CAPACITY", "Lot not visible");
    }
    return this.raiseIssue(session, {
      intervention: "WARN",
      authorityTag: "LEGAL_REQUIREMENT",
      subjectType: "lot",
      subjectId: lot.lotId,
      summary: `Grading dispute on ${lot.displayCode}: assigned ${input.assignedGrade}, claimed ${input.claimedGrade}${input.note ? ` — ${input.note}` : ""}`,
      lotIds: [lot.lotId],
      partyActorIds: [lot.ownerActorId, lot.custodianActorId],
      ruleRef: "REG-D05-05",
    });
  }

  private canResolveIssue(session: Session, issue: IssueRecord): boolean {
    if (session.capacity === "Regulator" || session.capacity === "PlatformAdmin") return true;
    if (issue.raisedByCapacity === "Regulator" || issue.authorityTag === "LEGAL_REQUIREMENT") {
      return false;
    }
    return issue.partyActorIds.includes(session.actorId);
  }

  transitionIssue(
    session: Session,
    input: {
      issueId: string;
      to: IssueRecord["lifecycle"];
      disposition?: IssueDisposition;
      ruleRef?: string;
      evidenceIds?: string[];
      note?: string;
    },
  ): IssueRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "Verifier",
      "Regulator",
      "PlatformAdmin",
      "FacilityOperator",
      "WarehouseOperator",
      "Importer",
    ]);
    const issue = this.w.issues.find((i) => i.issueId === input.issueId);
    if (!issue) throw new EngineError("INV-04", "Issue not found");
    if (issue.lifecycle === "RESOLVED") throw new EngineError("ISSUE-AUTHORITY", "Issue already resolved");
    const order: IssueRecord["lifecycle"][] = [
      "NORMAL",
      "ANOMALY_WARNING",
      "INVESTIGATION",
      "CONFIRMED_EXCEPTION",
      "RESOLVED",
    ];
    if (order.indexOf(input.to) <= order.indexOf(issue.lifecycle)) {
      throw new EngineError("ISSUE-AUTHORITY", `Cannot move from ${issue.lifecycle} to ${input.to}`);
    }
    if (!this.canResolveIssue(session, issue)) {
      this.commitEvent(session, "issue_resolution_rejected", {
        issueId: issue.issueId,
        attemptedTo: input.to,
        reason: "outside resolution authority",
      }, [issue.issueId]);
      throw new EngineError("ISSUE-AUTHORITY", "Outside resolution authority for this issue");
    }
    if (input.to === "CONFIRMED_EXCEPTION") {
      const ruleRef = input.ruleRef ?? issue.ruleRef;
      const hasEvidence = (input.evidenceIds ?? []).some((id) => this.w.evidence.has(id));
      if (!ruleRef || (!hasEvidence && session.capacity !== "Regulator")) {
        throw new EngineError(
          "ISSUE-EVIDENCE",
          "Confirming an exception needs the rule reference and supporting evidence (or a Regulator)",
        );
      }
    }
    if (input.to === "RESOLVED") {
      if (!input.disposition || !ISSUE_DISPOSITIONS.includes(input.disposition)) {
        throw new EngineError("ISSUE-AUTHORITY", "A final disposition is required to resolve");
      }
      if (input.disposition === "Explained" && !input.note?.trim()) {
        throw new EngineError("ISSUE-EVIDENCE", "An explanation note is required");
      }
    }
    this.commitEvent(session, "issue_transitioned", {
      issueId: issue.issueId,
      from: issue.lifecycle,
      to: input.to,
      disposition: input.disposition,
      ruleRef: input.ruleRef,
      evidenceIds: input.evidenceIds,
      note: input.note,
    }, [issue.issueId, ...issue.lotIds]);
    return issue;
  }

  /** @deprecated use transitionIssue — kept for older callers; authority is now checked by the engine. */
  resolveIssue(session: Session, issueId: string, disposition: IssueDisposition, note?: string): void {
    this.transitionIssue(session, { issueId, to: "RESOLVED", disposition, note });
  }

  handoverObligation(
    session: Session,
    input: { obligationId: string; toActorId: string; reason: string },
  ): ObligationRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "PlatformAdmin",
      "FacilityOperator",
      "WarehouseOperator",
    ]);
    const ob = this.w.obligations.find((o) => o.obligationId === input.obligationId);
    if (!ob) throw new EngineError("INV-04", "Obligation not found");
    if (ob.status === "closed") throw new EngineError("OBLIGATION-OWNER", "Obligation already closed");
    if (ob.accountableActorId !== session.actorId && session.capacity !== "PlatformAdmin") {
      throw new EngineError("OBLIGATION-OWNER", "Only the accountable actor may hand this over");
    }
    const to = this.w.actors.get(input.toActorId);
    if (!to || to.status !== "active") throw new EngineError("OBLIGATION-OWNER", "New owner must be an active actor");
    if (!input.reason?.trim()) throw new EngineError("OBLIGATION-OWNER", "Handover reason required");
    this.commitEvent(session, "obligation_handover", {
      obligationId: ob.obligationId,
      fromActorId: ob.accountableActorId,
      toActorId: input.toActorId,
      reason: input.reason,
    }, [ob.obligationId, input.toActorId]);
    return ob;
  }

  closeObligation(
    session: Session,
    input: { obligationId: string; note: string },
  ): ObligationRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "PlatformAdmin",
      "Regulator",
      "FacilityOperator",
      "WarehouseOperator",
    ]);
    const ob = this.w.obligations.find((o) => o.obligationId === input.obligationId);
    if (!ob) throw new EngineError("INV-04", "Obligation not found");
    if (ob.status === "closed") throw new EngineError("OBLIGATION-OWNER", "Obligation already closed");
    if (ob.accountableActorId !== session.actorId && !this.isOversight(session.actorId)) {
      throw new EngineError("OBLIGATION-OWNER", "Only the accountable actor may close this");
    }
    this.commitEvent(session, "obligation_closed", {
      obligationId: ob.obligationId,
      note: input.note,
    }, [ob.obligationId]);
    return ob;
  }

  /** Module 13 T4: sync conflict quantity goes to quarantine with one accountable actor and a 72h deadline. */
  quarantineConflict(
    session: Session,
    input: { quantityKg: number; accountableActorId: string; lotId?: string; reason: string },
  ): QuarantineRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "PlatformAdmin",
      "FacilityOperator",
      "WarehouseOperator",
    ]);
    if (!(input.quantityKg > 0)) throw new EngineError("INV-07", "Quarantine quantity must be positive");
    if (!this.w.actors.has(input.accountableActorId)) {
      throw new EngineError("OBLIGATION-OWNER", "Accountable actor not found");
    }
    const quarantineId = randomUUID();
    const now = session.eventTimeActual ?? new Date().toISOString();
    this.commitEvent(session, "quarantine_opened", {
      quarantineId,
      obligationId: randomUUID(),
      quantityKg: input.quantityKg,
      accountableActorId: input.accountableActorId,
      lotId: input.lotId,
      reason: input.reason,
      deadline: hoursFrom(new Date().toISOString() > now ? new Date().toISOString() : now, QUARANTINE_WINDOW_HOURS),
    }, [quarantineId, input.accountableActorId, ...(input.lotId ? [input.lotId] : [])]);
    return this.w.quarantines.find((q) => q.id === quarantineId)!;
  }

  resolveQuarantine(
    session: Session,
    input: { quarantineId: string; disposition: string; note?: string },
  ): QuarantineRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "PlatformAdmin",
      "FacilityOperator",
      "WarehouseOperator",
    ]);
    const q = this.w.quarantines.find((x) => x.id === input.quarantineId);
    if (!q) throw new EngineError("INV-04", "Quarantine not found");
    if (q.resolved) throw new EngineError("OBLIGATION-OWNER", "Quarantine already resolved");
    const ob = this.w.obligations.find((o) => o.subjectId === q.id);
    const owner = ob?.accountableActorId ?? q.accountableActorId;
    if (owner !== session.actorId && session.capacity !== "PlatformAdmin") {
      throw new EngineError("OBLIGATION-OWNER", "Only the accountable actor may resolve this quarantine");
    }
    this.commitEvent(session, "quarantine_resolved", {
      quarantineId: q.id,
      disposition: input.disposition,
      note: input.note,
    }, [q.id]);
    return q;
  }

  /** Raise an action-worthy notification (Module 11). Informational categories are refused. */
  notifyAction(
    recipientActorId: string,
    category: string,
    title: string,
    body: string,
    triggerRef?: string,
    session?: Session,
  ): NotificationRecord | null {
    if (!(NOTIFICATION_TRIGGERS as readonly string[]).includes(category)) return null;
    if (!this.w.actors.has(recipientActorId)) return null;
    const admin = this.platformActorId();
    const s = session ?? (admin ? this.systemSession(admin) : undefined);
    if (!s) return null;
    const id = randomUUID();
    this.commitEvent(s, "notification_raised", {
      notification: { id, recipientActorId, category, title, body, triggerRef },
    }, [recipientActorId]);
    return this.w.notifications.find((n) => n.id === id) ?? null;
  }

  /**
   * Scheduled sweep (Modules 03, 09, 11, 13): overdue receipts after 72h,
   * quarantine escalation after 72h, credential expiry within 7 days.
   * Attributed to the platform actor so each change is an event.
   */
  sweep(now: Date = new Date()): {
    overdue: number;
    escalated: number;
    credentialNotices: number;
  } {
    const admin = this.platformActorId();
    if (!admin) return { overdue: 0, escalated: 0, credentialNotices: 0 };
    const s = this.systemSession(admin);
    let overdue = 0;
    for (const m of this.w.movements.values()) {
      if (m.state !== "pending") continue;
      const sentAt = m.dispatchedAt ?? this.w.events.find((e) => e.eventId === m.dispatchEventId)?.eventTimeActual;
      if (!sentAt) continue;
      if (now.getTime() - Date.parse(sentAt) >= RECEIPT_WINDOW_HOURS * 3600 * 1000) {
        this.commitEvent(s, "movement_receipt_overdue", {
          movementId: m.movementId,
          lotId: m.lotId,
          fromActorId: m.fromActorId,
          toActorId: m.toActorId,
        }, [m.movementId, m.lotId]);
        overdue++;
      }
    }
    let escalated = 0;
    for (const q of this.w.quarantines) {
      if (q.resolved || Date.parse(q.deadline) > now.getTime()) continue;
      const ob = this.w.obligations.find((o) => o.subjectId === q.id);
      if (ob?.status === "escalated") continue;
      const current = ob?.accountableActorId ?? q.accountableActorId;
      const to = this.w.actors.get(current)?.sponsorActorId ?? admin;
      this.commitEvent(s, "quarantine_escalated", {
        quarantineId: q.id,
        fromActorId: current,
        escalatedToActorId: to,
      }, [q.id, to]);
      escalated++;
    }
    let credentialNotices = 0;
    const soon = now.getTime() + 7 * 24 * 3600 * 1000;
    for (const c of this.w.credentials) {
      if (c.status !== "ACTIVE") continue;
      const exp = Date.parse(c.validTo);
      if (exp > soon) continue;
      const already = this.w.notifications.some(
        (n) => n.category === "credential_expiry" && n.triggerRef === c.credentialId,
      );
      if (already) continue;
      this.commitEvent(s, "credential_expiry_notice", {
        credentialId: c.credentialId,
        actorId: c.actorId,
        validTo: c.validTo,
      }, [c.actorId]);
      credentialNotices++;
    }
    return { overdue, escalated, credentialNotices };
  }

  escalateOverdueQuarantines(now = new Date()): NotificationRecord[] {
    const before = this.w.notifications.length;
    this.sweep(now);
    return this.w.notifications.slice(before).filter((n) => n.category === "escalation");
  }

  // ── Governance (Modules 01, 10, 15, 16) ──────────────────────────────────

  registerBlockRule(
    session: Session,
    input: {
      code: string;
      authorityTag?: string;
      sourceRef?: string;
      scope?: string;
      owner?: string;
      approvalRef?: string;
      stepUpProof?: string;
    },
  ): void {
    this.assertCapacity(session, ["PlatformAdmin"]);
    this.assertStepUp(session, input.stepUpProof);
    if (
      !input.code ||
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
    if (input.authorityTag !== "LEGAL_REQUIREMENT" && input.authorityTag !== "OFFICIAL_TECHNICAL_STANDARD") {
      throw new EngineError(
        "AUTH-CAPACITY",
        "Only legal or official-standard rules may BLOCK; benchmarks and control rules can only WARN/FLAG",
      );
    }
    this.commitEvent(session, "block_rule_registered", {
      rule: {
        code: input.code,
        authorityTag: input.authorityTag,
        sourceRef: input.sourceRef,
        scope: input.scope,
        owner: input.owner,
        approvalRef: input.approvalRef,
      },
    }, []);
  }

  /** REG-D02-06 federal CoC: all four criteria must be met for an ACTIVE credential. */
  issueCredential(
    session: Session,
    input: {
      actorId: string;
      kind: "federal_coc" | "regional_coc";
      criteria: Partial<Record<(typeof FEDERAL_COC_CRITERIA)[number], boolean>>;
      validFrom: string;
      validTo: string;
    },
  ): CredentialRecord {
    this.assertCapacity(session, ["Regulator", "PlatformAdmin"]);
    if (!this.w.actors.has(input.actorId)) throw new EngineError("INV-04", "Actor not found");
    if (Number.isNaN(Date.parse(input.validFrom)) || Number.isNaN(Date.parse(input.validTo))) {
      throw new EngineError("REG-D02-06", "Credential validity dates required");
    }
    const missingCriteria = FEDERAL_COC_CRITERIA.filter((c) => !input.criteria[c]);
    const credentialId = randomUUID();
    this.commitEvent(session, "credential_issued", {
      credential: {
        credentialId,
        actorId: input.actorId,
        kind: input.kind,
        criteria: Object.fromEntries(FEDERAL_COC_CRITERIA.map((c) => [c, !!input.criteria[c]])),
        missingCriteria,
        status: missingCriteria.length ? "INCOMPLETE" : "ACTIVE",
        validFrom: new Date(input.validFrom).toISOString(),
        validTo: new Date(input.validTo).toISOString(),
        issuedByActorId: session.actorId,
      },
    }, [credentialId, input.actorId]);
    return this.w.credentials.find((c) => c.credentialId === credentialId)!;
  }

  /** REG-D02-06 sanction ladder: steps follow the published order; suspension and above block new actions. */
  recordSanction(
    session: Session,
    input: { actorId: string; step: SanctionStep; reason: string },
  ): void {
    this.assertCapacity(session, ["Regulator"]);
    if (!this.w.actors.has(input.actorId)) throw new EngineError("INV-04", "Actor not found");
    const nextIdx = SANCTION_LADDER.indexOf(input.step);
    if (nextIdx < 0) throw new EngineError("REG-D02-06", "Unknown sanction step");
    const cur = this.activeSanction(input.actorId);
    const curIdx = cur ? SANCTION_LADDER.indexOf(cur) : -1;
    if (nextIdx > curIdx + 1 || nextIdx < curIdx) {
      throw new EngineError(
        "REG-D02-06",
        `Sanction must follow the ladder (current: ${cur ?? "none"})`,
        "BLOCK",
        "LEGAL_REQUIREMENT",
      );
    }
    if (!input.reason?.trim()) throw new EngineError("REG-D02-06", "Sanction reason required");
    this.commitEvent(session, "sanction_recorded", {
      actorId: input.actorId,
      step: input.step,
      reason: input.reason,
    }, [input.actorId]);
  }

  /** Module 14: every regulator read of ledger data is itself logged. */
  logRegulatorAccess(
    session: Session,
    input: { dataAccessed: string; purpose: string; action: string },
  ): void {
    const actor = this.w.actors.get(session.actorId);
    if (!actor?.capacities.includes("Regulator") || session.capacity !== "Regulator") return;
    this.commitEvent(session, "regulator_access_logged", {
      access: {
        id: randomUUID(),
        regulatorActorId: session.actorId,
        userId: session.userId,
        dataAccessed: input.dataAccessed,
        purpose: input.purpose,
        action: input.action,
      },
    }, []);
  }

  /** Module 15 T3: external data is stored as a claim; a conflict raises a FLAG and never overwrites the ledger. */
  ingestExternalClaim(
    session: Session,
    input: { source: string; lotId: string; field: "massKg" | "moisturePct"; claimedValue: number },
  ): ExternalClaimRecord {
    this.assertCapacity(session, ["PlatformAdmin", "Exporter", "Importer"]);
    const lot = this.w.lots.get(input.lotId);
    if (!lot) throw new EngineError("INV-04", "Lot not found");
    const ledgerValue = input.field === "massKg" ? lot.canonicalMassKg : (lot.moisturePct ?? null);
    const conflict = ledgerValue != null && !massesEqual(ledgerValue, input.claimedValue, 1e-3);
    const claimId = randomUUID();
    this.commitEvent(session, "external_claim_recorded", {
      claim: {
        claimId,
        source: input.source,
        lotId: lot.lotId,
        field: input.field,
        claimedValue: input.claimedValue,
        ledgerValue,
        conflict,
      },
      issueId: conflict ? randomUUID() : undefined,
    }, [claimId, lot.lotId]);
    return this.w.externalClaims.find((c) => c.claimId === claimId)!;
  }

  /** Module 15 T2: a model may only be enabled once its registry entry is complete. */
  registerModel(session: Session, entry: Omit<ModelRegistryEntry, "enabled">): ModelRegistryEntry {
    this.assertCapacity(session, ["PlatformAdmin"]);
    const fields: Array<keyof Omit<ModelRegistryEntry, "enabled">> = [
      "modelId",
      "purpose",
      "owner",
      "trainingData",
      "features",
      "version",
      "performance",
      "limitations",
      "deploymentScope",
      "monitoringPlan",
      "retirementPath",
    ];
    const missing = fields.filter((f) => !String(entry[f] ?? "").trim());
    if (missing.length) {
      throw new EngineError("MODEL-REGISTRY", `Model registry entry incomplete: ${missing.join(", ")}`);
    }
    this.commitEvent(session, "model_registered", { entry: { ...entry, enabled: false } }, []);
    return this.w.modelRegistry.find((m) => m.modelId === entry.modelId)!;
  }

  enableModel(session: Session, modelId: string): ModelRegistryEntry {
    this.assertCapacity(session, ["PlatformAdmin"]);
    const m = this.w.modelRegistry.find((x) => x.modelId === modelId);
    if (!m) throw new EngineError("MODEL-REGISTRY", "Model not registered");
    this.commitEvent(session, "model_enabled", { modelId }, []);
    return m;
  }

  // ── Reporting (Module 12) ────────────────────────────────────────────────

  private buildReportPayload(lotId: string, viewerId: string): Record<string, unknown> {
    const lot = this.w.lots.get(lotId)!;
    const lotIds = this.ancestorLotIds(lotId);
    const trace = this.lineageTrace(lotId, viewerId);
    return {
      lot: {
        lotId: lot.lotId,
        displayCode: lot.displayCode,
        processingState: lot.processingState,
        processingRoute: lot.processingRoute,
        status: lot.status,
        canonicalMassKg: lot.canonicalMassKg,
        cropYearComposition: lot.cropYearComposition,
        provenance: lot.provenance,
      },
      farmCount: trace.farmCount,
      origins: trace.origins,
      edges: trace.edges.map((e) => ({ ...e })),
      movements: [...this.w.movements.values()]
        .filter((m) => lotIds.has(m.lotId))
        .map((m) => ({
          movementId: m.movementId,
          lotId: m.lotId,
          fromActorId: m.fromActorId,
          toActorId: m.toActorId,
          senderDeclaredKg: m.senderDeclaredKg,
          receiverDeclaredKg: m.receiverDeclaredKg ?? null,
          state: m.state,
        })),
      openIssues: this.lotIssues(lotId).map((i) => ({
        issueId: i.issueId,
        intervention: i.intervention,
        lifecycle: i.lifecycle,
        summary: i.summary,
      })),
      evidence: [...this.w.evidence.values()]
        .filter((e) => e.attachedType === "lot" && lotIds.has(e.attachedId))
        .map((e) => ({ evidenceId: e.evidenceId, documentType: e.documentType, status: e.status })),
      compliance: this.w.assessments
        .filter((a) => a.lotId === lotId)
        .slice(-1)
        .map((a) => ({ framework: `${a.frameworkCode} v${a.frameworkVersion}`, results: a.results })),
      chainHeadHash: this.w.lastHash,
    };
  }

  /** Module 12 T5: reports are fingerprinted; regenerating supersedes (and links) the prior version. */
  generateReport(session: Session, lotId: string): ReportRecord {
    this.assertCapacity(session, [
      "Farmer",
      "Collector",
      "Aggregator",
      "Exporter",
      "Verifier",
      "Regulator",
      "PlatformAdmin",
      "Importer",
    ]);
    if (!this.w.lots.has(lotId) || !this.canSeeLot(session.actorId, lotId)) {
      throw new EngineError("AUTH-CAPACITY", "Lot not visible");
    }
    const payload = this.buildReportPayload(lotId, session.actorId);
    const contentHash = sha256(canonicalJson(payload));
    const prior = this.w.reports.filter((r) => r.lotId === lotId && !r.superseded).slice(-1)[0];
    const reportId = randomUUID();
    this.commitEvent(session, "report_generated", {
      reportId,
      lotId,
      payload,
      contentHash,
      supersedesReportId: prior?.reportId,
    }, [reportId, lotId, ...(prior ? [prior.reportId] : [])]);
    return this.w.reports.find((r) => r.reportId === reportId)!;
  }

  verifyReportFingerprint(reportId: string): boolean {
    const r = this.w.reports.find((x) => x.reportId === reportId);
    if (!r) return false;
    return sha256(canonicalJson(r.payload)) === r.contentHash;
  }

  /** Module 12 T6 / Module 14: audit package = report + lot events + chain verification. */
  auditPackage(session: Session, lotId: string): {
    report: ReportRecord;
    events: EventRecord[];
    chain: ReturnType<LedgerEngine["verifyChain"]>;
  } {
    const report = this.generateReport(session, lotId);
    const ids = this.ancestorLotIds(lotId);
    const movementIds = new Set(
      [...this.w.movements.values()].filter((m) => ids.has(m.lotId)).map((m) => m.movementId),
    );
    const events = this.w.events.filter((e) =>
      e.affectedObjectIds.some((id) => ids.has(id) || movementIds.has(id)),
    );
    this.logRegulatorAccess(session, {
      dataAccessed: `audit package ${this.w.lots.get(lotId)?.displayCode ?? lotId}`,
      purpose: "audit",
      action: "export",
    });
    return { report, events, chain: this.verifyChain() };
  }

  // ── Event-sourced module projections ─────────────────────────────────────

  private pushIssue(issue: IssueRecord): void {
    if (this.w.issues.some((i) => i.issueId === issue.issueId)) return;
    this.w.issues.push(issue);
  }

  private pushNotification(n: NotificationRecord): void {
    if (this.w.notifications.some((x) => x.id === n.id)) return;
    this.w.notifications.push(n);
  }

  /**
   * Apply one committed event to the module projections (issues, evidence,
   * obligations, notifications, …). Runs on commit and again on hydrate, so it
   * must be idempotent and must only read the event payload.
   */
  private applyModuleEvent(ev: EventRecord): void {
    const p = ev.payload as Record<string, any>;
    const at = ev.eventTimeActual;
    switch (ev.eventType) {
      case "user_revoked": {
        const u = this.w.users.get(String(p.userId));
        if (u) u.status = "revoked";
        break;
      }
      case "capacity_added": {
        const a = this.w.actors.get(String(p.actorId));
        if (a && !a.capacities.includes(p.capacity)) a.capacities.push(p.capacity);
        break;
      }
      case "movement_send": {
        const m = this.w.movements.get(String(p.movementId));
        if (m) {
          m.dispatchedAt = at;
          if (p.transporterActorId) m.transporterActorId = p.transporterActorId;
          if (p.shinto) m.shinto = { ...p.shinto };
        }
        if (p.toActorId) {
          this.pushNotification({
            id: `${ev.eventId}:receipt`,
            recipientActorId: String(p.toActorId),
            category: "required_receipt",
            title: "Receipt required",
            body: `${p.senderDeclaredKg} kg on the way — confirm receipt with your own weight`,
            triggerRef: String(p.movementId),
            eventId: ev.eventId,
          });
        }
        break;
      }
      case "movement_receive": {
        const m = this.w.movements.get(String(p.movementId));
        if (m) {
          if (p.contractId) m.contractId = p.contractId;
          if (m.shinto && p.stationSealIntact != null) {
            m.shinto = {
              ...m.shinto,
              stationSealIntact: p.stationSealIntact,
              stationNetWeightKg: p.stationNetWeightKg,
            };
          }
        }
        const lot = p.lotId ? this.w.lots.get(String(p.lotId)) : m ? this.w.lots.get(m.lotId) : undefined;
        if (lot && p.transactionChannel) lot.transactionChannel = p.transactionChannel;
        const lotIds = lot ? [lot.lotId] : [];
        const parties = [String(p.fromActorId ?? m?.fromActorId ?? ""), String(p.toActorId ?? m?.toActorId ?? ev.actorId ?? "")].filter(Boolean);
        if (p.state === "received_discrepant") {
          const issueId = String(p.discrepancyIssueId ?? `legacy-${ev.eventId}`);
          const sender = Number(p.senderDeclaredKg ?? m?.senderDeclaredKg ?? 0);
          this.pushIssue({
            issueId,
            lifecycle: "ANOMALY_WARNING",
            intervention: "FLAG",
            authorityTag: "ANKUARU_CONTROL_RULE",
            subjectType: "movement",
            subjectId: String(p.movementId),
            summary: `Weight discrepancy: sender ${sender} kg vs receiver ${p.receiverDeclaredKg} kg`,
            lotIds,
            partyActorIds: parties,
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            createdEventId: ev.eventId,
          });
          for (const r of parties) {
            this.pushNotification({
              id: `${ev.eventId}:disc:${r}`,
              recipientActorId: r,
              category: "discrepancy",
              title: "Weight discrepancy recorded",
              body: `${p.lotDisplayCode ?? "Lot"}: ${sender} kg sent, ${p.receiverDeclaredKg} kg received`,
              triggerRef: String(p.movementId),
              eventId: ev.eventId,
            });
          }
        }
        if (p.sealIssueId) {
          this.pushIssue({
            issueId: String(p.sealIssueId),
            lifecycle: "ANOMALY_WARNING",
            intervention: "WARN",
            authorityTag: "LEGAL_REQUIREMENT",
            subjectType: "movement",
            subjectId: String(p.movementId),
            summary: "Shinto seal not intact at receiving station",
            lotIds,
            partyActorIds: parties,
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            ruleRef: "REG-D05-04",
            createdEventId: ev.eventId,
          });
        }
        if (p.channelIssueId) {
          this.pushIssue({
            issueId: String(p.channelIssueId),
            lifecycle: "ANOMALY_WARNING",
            intervention: "FLAG",
            authorityTag: "LEGAL_REQUIREMENT",
            subjectType: "movement",
            subjectId: String(p.movementId),
            summary: "Transaction channel not recorded (primary centre, direct linkage or ECX)",
            lotIds,
            partyActorIds: parties,
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            ruleRef: "REG-D02-04",
            createdEventId: ev.eventId,
          });
        }
        if (p.obligation && !this.w.obligations.some((o) => o.obligationId === p.obligation.obligationId)) {
          this.w.obligations.push({
            obligationId: p.obligation.obligationId,
            kind: "payment_settlement",
            accountableActorId: p.obligation.accountableActorId,
            subjectType: "contract",
            subjectId: p.obligation.contractId,
            deadline: p.obligation.deadline,
            status: "open",
            payload: { reg: "REG-D05-03", movementId: p.movementId },
            history: [{ toActorId: p.obligation.accountableActorId, reason: "raised at receipt", eventId: ev.eventId }],
          });
        }
        break;
      }
      case "discrepancy_resolved": {
        const d = this.w.discrepancies.find((x) => x.movementId === p.movementId);
        if (d) {
          d.status = "resolved";
          d.disposition = p.disposition;
          d.note = p.note;
        }
        for (const i of this.w.issues) {
          if (i.subjectType === "movement" && i.subjectId === p.movementId && i.lifecycle !== "RESOLVED" && i.summary.startsWith("Weight discrepancy")) {
            i.lifecycle = "RESOLVED";
            i.disposition = p.disposition;
          }
        }
        break;
      }
      case "movement_receipt_overdue": {
        const m = this.w.movements.get(String(p.movementId));
        if (m && m.state === "pending") m.state = "receipt_overdue";
        for (const r of [p.toActorId, p.fromActorId].filter(Boolean)) {
          this.pushNotification({
            id: `${ev.eventId}:${r}`,
            recipientActorId: String(r),
            category: "escalation",
            title: "Receipt overdue",
            body: `No receipt confirmed within ${RECEIPT_WINDOW_HOURS}h`,
            triggerRef: String(p.movementId),
            eventId: ev.eventId,
          });
        }
        break;
      }
      case "ownership_transfer": {
        const lot = this.w.lots.get(String(p.lotId));
        if (lot && p.transactionChannel) lot.transactionChannel = p.transactionChannel;
        if (p.channelIssueId) {
          this.pushIssue({
            issueId: String(p.channelIssueId),
            lifecycle: "ANOMALY_WARNING",
            intervention: "FLAG",
            authorityTag: "LEGAL_REQUIREMENT",
            subjectType: "lot",
            subjectId: String(p.lotId),
            summary: "Ownership transfer with an exporter recorded without a transaction channel",
            lotIds: [String(p.lotId)],
            partyActorIds: [String(p.previousOwnerActorId), String(p.newOwnerActorId)],
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            ruleRef: "REG-D02-04",
            createdEventId: ev.eventId,
          });
        }
        break;
      }
      case "process": {
        const bps = (p.byProducts as Array<{ id?: string; kind: string; massKg: number; disposition?: string }>) ?? [];
        bps.forEach((b, i) => {
          const id = b.id ?? `${ev.eventId}:bp${i}`;
          if (b.massKg > 0 && !this.w.byProducts.some((x) => x.id === id)) {
            this.w.byProducts.push({
              id,
              sourceEventId: ev.eventId,
              kind: b.kind,
              massKg: b.massKg,
              disposition: b.disposition ?? "recorded",
            });
          }
        });
        const lotIds = [...((p.inputLotIds as string[]) ?? []), ...(p.childLotId ? [String(p.childLotId)] : [])];
        if (p.yieldIssueId && p.yieldReference) {
          const ref = p.yieldReference;
          this.pushIssue({
            issueId: String(p.yieldIssueId),
            lifecycle: "ANOMALY_WARNING",
            intervention: "FLAG",
            authorityTag: ref.authorityTag,
            subjectType: "process",
            subjectId: String(p.childLotId ?? ""),
            summary: `Yield ${p.yieldPct}% outside reference ${ref.minPct}–${ref.maxPct}% (${ref.version})`,
            lotIds,
            partyActorIds: ev.actorId ? [ev.actorId] : [],
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            referenceRange: { minPct: ref.minPct, maxPct: ref.maxPct, version: ref.version, sourceRef: ref.sourceRef },
            stage: `${p.outputState}`,
            createdEventId: ev.eventId,
          });
        }
        if (p.moistureIssueId) {
          this.pushIssue({
            issueId: String(p.moistureIssueId),
            lifecycle: "ANOMALY_WARNING",
            intervention: "FLAG",
            authorityTag: "LEGAL_REQUIREMENT",
            subjectType: "process",
            subjectId: String(p.childLotId ?? ""),
            summary: "Moisture not recorded for supply/export coffee (required 10.0–12.5%)",
            lotIds,
            partyActorIds: ev.actorId ? [ev.actorId] : [],
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            ruleRef: "REG-D02-02",
            createdEventId: ev.eventId,
          });
        }
        break;
      }
      case "contract_registered": {
        const c = (p.contract ?? p) as ContractRecord;
        if (c.contractId) this.w.contracts.set(c.contractId, { ...c });
        break;
      }
      case "farm_created": {
        const f = (p.farm ?? p) as FarmRecord;
        if (f.farmId) this.w.farms.set(f.farmId, { ...f });
        break;
      }
      case "farm_unit_created": {
        const u = p.unit as FarmUnitRecord;
        if (u?.farmUnitId) this.w.farmUnits.set(u.farmUnitId, { ...u });
        break;
      }
      case "geometry_version_added": {
        const g = p.geometry as GeometryVersionRecord;
        if (g && !this.w.geometries.some((x) => x.id === g.id)) {
          this.w.geometries.push({ ...g, createdEventId: ev.eventId });
          const unit = this.w.farmUnits.get(g.farmUnitId);
          if (unit && g.geojson) unit.polygonPending = false;
        }
        break;
      }
      case "overlay_recorded": {
        const o = p.overlay as OverlayRecord;
        if (o && !this.w.overlays.some((x) => x.id === o.id)) this.w.overlays.push({ ...o });
        break;
      }
      case "evidence_uploaded": {
        const e = p.evidence as EvidenceRecord;
        if (e?.evidenceId) {
          this.w.evidence.set(e.evidenceId, { ...e, uploadedAt: at, verifications: [] });
        }
        break;
      }
      case "evidence_system_validated": {
        const e = this.w.evidence.get(String(p.evidenceId));
        if (e) {
          e.systemChecks = p.failures ?? [];
          if (p.passed && e.status === "UPLOADED") e.status = "SYSTEM_VALIDATED";
        }
        break;
      }
      case "evidence_verified": {
        const e = this.w.evidence.get(String(p.evidenceId));
        if (e) {
          e.status = "VERIFIED";
          e.verifications.push({
            verifierActorId: String(p.verifierActorId),
            authority: String(p.authority ?? ""),
            at,
            eventId: ev.eventId,
          });
        }
        break;
      }
      case "evidence_revoked": {
        const e = this.w.evidence.get(String(p.evidenceId));
        if (e) {
          e.status = "REVOKED";
          e.revokedEffective = p.effectiveDate;
          e.revokeReason = p.reason;
        }
        if (p.uploaderActorId) {
          this.pushNotification({
            id: `${ev.eventId}:revoked`,
            recipientActorId: String(p.uploaderActorId),
            category: "evidence_invalid",
            title: "Evidence revoked",
            body: `${e?.documentType ?? "Evidence"} revoked from ${String(p.effectiveDate).slice(0, 10)}: ${p.reason}`,
            triggerRef: String(p.evidenceId),
            eventId: ev.eventId,
          });
        }
        break;
      }
      case "stocktake_recorded": {
        const st = p.stocktake as StocktakeRecord;
        if (st && !this.w.stocktakes.some((s) => s.id === st.id)) {
          this.w.stocktakes.push({ ...st, at, adjustments: [] });
        }
        if (p.varianceIssueId) {
          this.pushIssue({
            issueId: String(p.varianceIssueId),
            lifecycle: "ANOMALY_WARNING",
            intervention: "FLAG",
            authorityTag: "ANKUARU_CONTROL_RULE",
            subjectType: "stocktake",
            subjectId: st.id,
            summary: `Stock variance ${st.varianceKg} kg on ${st.coffeeState} (tolerance ±${Math.round(Number(p.toleranceKg))} kg)`,
            lotIds: [],
            partyActorIds: [st.stockHolderActorId],
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            createdEventId: ev.eventId,
          });
        }
        if (p.patternIssueId) {
          this.pushIssue({
            issueId: String(p.patternIssueId),
            lifecycle: "INVESTIGATION",
            intervention: "FLAG",
            authorityTag: "ANKUARU_CONTROL_RULE",
            subjectType: "stocktake",
            subjectId: st.id,
            summary: `Three consecutive stock shortfalls on ${st.coffeeState}`,
            lotIds: [],
            partyActorIds: [st.stockHolderActorId],
            raisedByActorId: ev.actorId,
            raisedByCapacity: ev.actingCapacity,
            createdEventId: ev.eventId,
          });
        }
        break;
      }
      case "stock_adjustment_recorded": {
        const st = this.w.stocktakes.find((s) => s.id === p.stocktakeId);
        if (st && !st.adjustments.some((a) => a.eventId === ev.eventId)) {
          st.adjustments.push({ eventId: ev.eventId, reason: String(p.reason), byActorId: ev.actorId });
        }
        break;
      }
      case "issue_raised": {
        const i = p.issue as IssueRecord;
        if (i?.issueId) this.pushIssue({ ...i, lotIds: i.lotIds ?? [], partyActorIds: i.partyActorIds ?? [], createdEventId: ev.eventId });
        break;
      }
      case "issue_transitioned": {
        const i = this.w.issues.find((x) => x.issueId === p.issueId);
        if (i) {
          i.lifecycle = p.to;
          if (p.disposition) i.disposition = p.disposition;
          if (p.ruleRef) i.ruleRef = p.ruleRef;
          if (p.evidenceIds) i.evidenceIds = [...(i.evidenceIds ?? []), ...p.evidenceIds];
        }
        break;
      }
      case "obligation_handover": {
        const o = this.w.obligations.find((x) => x.obligationId === p.obligationId);
        if (o && !o.history.some((h) => h.eventId === ev.eventId)) {
          o.accountableActorId = String(p.toActorId);
          o.history.push({ fromActorId: p.fromActorId, toActorId: String(p.toActorId), reason: String(p.reason), eventId: ev.eventId });
        }
        break;
      }
      case "obligation_closed": {
        const o = this.w.obligations.find((x) => x.obligationId === p.obligationId);
        if (o) o.status = "closed";
        break;
      }
      case "notification_raised": {
        const n = p.notification;
        if (n?.id) this.pushNotification({ ...n, eventId: ev.eventId });
        break;
      }
      case "quarantine_opened": {
        if (!this.w.quarantines.some((q) => q.id === p.quarantineId)) {
          this.w.quarantines.push({
            id: String(p.quarantineId),
            quantityKg: Number(p.quantityKg),
            deadline: String(p.deadline),
            accountableActorId: String(p.accountableActorId),
            resolved: false,
            lotId: p.lotId,
            dispositions: [],
          });
          this.w.obligations.push({
            obligationId: String(p.obligationId),
            kind: "quarantine_resolution",
            accountableActorId: String(p.accountableActorId),
            subjectType: "quarantine",
            subjectId: String(p.quarantineId),
            deadline: String(p.deadline),
            status: "open",
            payload: { quantityKg: p.quantityKg, reason: p.reason },
            history: [{ toActorId: String(p.accountableActorId), reason: String(p.reason ?? "sync conflict"), eventId: ev.eventId }],
          });
          this.pushNotification({
            id: `${ev.eventId}:conflict`,
            recipientActorId: String(p.accountableActorId),
            category: "conflict",
            title: "Quantity quarantined",
            body: `${p.quantityKg} kg held for resolution within ${QUARANTINE_WINDOW_HOURS}h`,
            triggerRef: String(p.quarantineId),
            eventId: ev.eventId,
          });
        }
        break;
      }
      case "quarantine_escalated": {
        const ob = this.w.obligations.find((o) => o.subjectId === p.quarantineId);
        if (ob && ob.status !== "escalated") {
          ob.status = "escalated";
          ob.accountableActorId = String(p.escalatedToActorId);
          ob.history.push({ fromActorId: p.fromActorId, toActorId: String(p.escalatedToActorId), reason: "72h deadline passed", eventId: ev.eventId });
        }
        for (const r of [p.fromActorId, p.escalatedToActorId].filter(Boolean)) {
          this.pushNotification({
            id: `${ev.eventId}:${r}`,
            recipientActorId: String(r),
            category: "escalation",
            title: "Quarantine escalated",
            body: `Quarantine unresolved after ${QUARANTINE_WINDOW_HOURS}h`,
            triggerRef: String(p.quarantineId),
            eventId: ev.eventId,
          });
        }
        break;
      }
      case "quarantine_resolved": {
        const q = this.w.quarantines.find((x) => x.id === p.quarantineId);
        if (q && !q.resolved) {
          q.resolved = true;
          q.dispositions.push({ disposition: p.disposition, note: p.note, eventId: ev.eventId });
        }
        const ob = this.w.obligations.find((o) => o.subjectId === p.quarantineId);
        if (ob) ob.status = "closed";
        break;
      }
      case "credential_expiry_notice": {
        this.pushNotification({
          id: `${ev.eventId}:expiry`,
          recipientActorId: String(p.actorId),
          category: "credential_expiry",
          title: "Credential expiring",
          body: `Certificate of Competency expires ${String(p.validTo).slice(0, 10)}`,
          triggerRef: String(p.credentialId),
          eventId: ev.eventId,
        });
        break;
      }
      case "compliance_assessed": {
        const a = p.assessment as ComplianceAssessmentRecord;
        if (a && !this.w.assessments.some((x) => x.assessmentId === a.assessmentId)) {
          this.w.assessments.push({ ...a, eventId: ev.eventId });
          const farmers = new Set((p.farmerActorIds as string[]) ?? []);
          const farmIds = new Set([...this.w.farms.values()].filter((f) => farmers.has(f.ownerActorId)).map((f) => f.farmId));
          const unitIds = new Set([...this.w.farmUnits.values()].filter((u) => farmIds.has(u.farmId)).map((u) => u.farmUnitId));
          for (const g of this.w.geometries) if (unitIds.has(g.farmUnitId) && g.geojson) g.usedInCompliance = true;
          const statusKey = (x: ComplianceAssessmentRecord) => x.results.map((r) => `${r.code}:${r.status}`).join("|");
          for (const s of this.w.submissions) {
            if (s.lotId !== a.lotId || s.status !== "ACKNOWLEDGED") continue;
            const prev = this.w.assessments.find((x) => x.assessmentId === s.assessmentId);
            if (prev && prev.frameworkCode === a.frameworkCode && statusKey(prev) !== statusKey(a)) {
              s.status = "REVIEW_REQUIRED";
              s.history.push({ outcome: "REVIEW_REQUIRED", at, eventId: ev.eventId, detail: "later assessment differs from submitted snapshot" });
            }
          }
        }
        break;
      }
      case "submission_created": {
        if (!this.w.submissions.some((s) => s.submissionId === p.submissionId)) {
          this.w.submissions.push({
            submissionId: String(p.submissionId),
            assessmentId: String(p.assessmentId),
            lotId: String(p.lotId),
            recipient: String(p.recipient),
            status: "READY",
            payloadSnapshot: p.payloadSnapshot,
            submittedByActorId: ev.actorId,
            submittedAt: at,
            history: [{ outcome: "READY", at, eventId: ev.eventId }],
          });
        }
        break;
      }
      case "submission_outcome_recorded": {
        const s = this.w.submissions.find((x) => x.submissionId === p.submissionId);
        if (s && !s.history.some((h) => h.eventId === ev.eventId)) {
          s.externalRef = p.externalRef ?? s.externalRef;
          if (p.outcome === "ACKNOWLEDGED") {
            s.status = "ACKNOWLEDGED";
          } else {
            s.status = "EXCEPTION";
            s.rejectionReason = p.reason;
            s.discrepancy = { internalDetermination: "READY", externalReason: String(p.reason) };
            if (p.issueId) {
              this.pushIssue({
                issueId: String(p.issueId),
                lifecycle: "INVESTIGATION",
                intervention: "WARN",
                authorityTag: "LEGAL_REQUIREMENT",
                subjectType: "submission",
                subjectId: s.submissionId,
                summary: `Submission to ${s.recipient} rejected: ${p.reason}`,
                lotIds: [s.lotId],
                partyActorIds: s.submittedByActorId ? [s.submittedByActorId] : [],
                raisedByActorId: ev.actorId,
                raisedByCapacity: ev.actingCapacity,
                createdEventId: ev.eventId,
              });
            }
          }
          s.history.push({ outcome: String(p.outcome), at, eventId: ev.eventId, detail: p.reason });
        }
        break;
      }
      case "scheme_claim_recorded": {
        this.w.schemeClaims.push({
          lotId: String(p.lotId),
          scheme: String(p.scheme),
          claimedKg: Number(p.claimedKg),
          allowance: !!p.allowance,
        });
        break;
      }
      case "block_rule_registered": {
        const r = p.rule;
        if (r && !this.w.blockRules.some((x) => x.code === r.code)) this.w.blockRules.push({ ...r });
        break;
      }
      case "credential_issued": {
        const c = p.credential as CredentialRecord;
        if (c && !this.w.credentials.some((x) => x.credentialId === c.credentialId)) {
          this.w.credentials.push({ ...c });
        }
        break;
      }
      case "sanction_recorded": {
        if (!this.w.sanctions.some((s) => s.eventId === ev.eventId)) {
          this.w.sanctions.push({ actorId: String(p.actorId), step: p.step, reason: String(p.reason), eventId: ev.eventId });
        }
        if (SANCTION_LADDER.indexOf(p.step) >= 2) {
          const a = this.w.actors.get(String(p.actorId));
          if (a) a.status = "inactive";
          for (const c of this.w.credentials) if (c.actorId === p.actorId) c.status = "REVOKED";
        }
        break;
      }
      case "regulator_access_logged": {
        const a = p.access;
        if (a && !this.w.regulatorAccess.some((x) => x.id === a.id)) this.w.regulatorAccess.push({ ...a, at });
        break;
      }
      case "external_claim_recorded": {
        const c = p.claim;
        if (c && !this.w.externalClaims.some((x) => x.claimId === c.claimId)) {
          this.w.externalClaims.push({ ...c, eventId: ev.eventId });
          if (p.issueId) {
            this.pushIssue({
              issueId: String(p.issueId),
              lifecycle: "ANOMALY_WARNING",
              intervention: "FLAG",
              authorityTag: "ANKUARU_CONTROL_RULE",
              subjectType: "lot",
              subjectId: c.lotId,
              summary: `External ${c.source} reports ${c.field} ${c.claimedValue}; ledger records ${c.ledgerValue}`,
              lotIds: [c.lotId],
              partyActorIds: [],
              raisedByActorId: ev.actorId,
              raisedByCapacity: ev.actingCapacity,
              createdEventId: ev.eventId,
            });
          }
        }
        break;
      }
      case "model_registered": {
        const m = p.entry as ModelRegistryEntry;
        if (m && !this.w.modelRegistry.some((x) => x.modelId === m.modelId)) this.w.modelRegistry.push({ ...m });
        break;
      }
      case "model_enabled": {
        const m = this.w.modelRegistry.find((x) => x.modelId === p.modelId);
        if (m) m.enabled = true;
        break;
      }
      case "report_generated": {
        if (this.w.reports.some((r) => r.reportId === p.reportId)) break;
        const prior = p.supersedesReportId
          ? this.w.reports.find((r) => r.reportId === p.supersedesReportId)
          : undefined;
        if (prior) {
          prior.superseded = true;
          prior.supersededByReportId = String(p.reportId);
        }
        this.w.reports.push({
          reportId: String(p.reportId),
          lotId: p.lotId,
          version: this.w.reports.filter((r) => r.lotId === p.lotId).length + 1,
          payload: p.payload,
          fingerprint: String(p.contentHash),
          contentHash: String(p.contentHash),
          generatedAt: at,
          generatedByActorId: ev.actorId,
          superseded: false,
          supersedesReportId: p.supersedesReportId,
        });
        break;
      }
      default:
        break;
    }
  }

  /** Rebuild module projections from the event log (after hydrate from Postgres). */
  rebuildModuleProjections(): void {
    this.w.issues = [];
    this.w.obligations = [];
    this.w.notifications = [];
    this.w.evidence = new Map();
    this.w.farms = new Map();
    this.w.farmUnits = new Map();
    this.w.geometries = [];
    this.w.overlays = [];
    this.w.contracts = new Map();
    this.w.byProducts = [];
    this.w.reports = [];
    this.w.stocktakes = [];
    this.w.schemeClaims = [];
    this.w.assessments = [];
    this.w.submissions = [];
    this.w.blockRules = BASE_BLOCK_RULES.map((r) => ({ ...r }));
    this.w.credentials = [];
    this.w.sanctions = [];
    this.w.externalClaims = [];
    this.w.modelRegistry = [];
    this.w.regulatorAccess = [];
    this.w.quarantines = [];
    for (const m of this.w.movements.values()) {
      const send = this.w.events.find((e) => e.eventId === m.dispatchEventId);
      if (send) m.dispatchedAt = send.eventTimeActual;
    }
    for (const ev of this.w.events) this.applyModuleEvent(ev);
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

  /**
   * CORE §9: owned, held, or on a movement from/to A. Service roles add their
   * own scope (Module 14): transporter → movements they carry; facility → lots
   * processed at it; importer → lots sold to it FOB. Oversight sees everything.
   */
  visibleLots(actorId: string): LotRecord[] {
    if (this.isOversight(actorId)) return [...this.w.lots.values()];
    const scoped = new Set<string>();
    for (const m of this.w.movements.values()) {
      if (m.fromActorId === actorId || m.toActorId === actorId || m.transporterActorId === actorId) {
        scoped.add(m.lotId);
      }
    }
    for (const e of this.w.events) {
      if (e.eventType === "process" && e.payload.facilityActorId === actorId) {
        for (const id of (e.payload.inputLotIds as string[]) ?? []) scoped.add(id);
        if (e.payload.childLotId) scoped.add(String(e.payload.childLotId));
      }
      if (e.eventType === "terminal_disposition" && e.payload.buyerActorId === actorId) {
        scoped.add(String(e.payload.lotId));
      }
    }
    return [...this.w.lots.values()].filter(
      (l) =>
        l.ownerActorId === actorId ||
        l.custodianActorId === actorId ||
        scoped.has(l.lotId),
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

  /** All actors in the sponsored subtree (excluding self). */
  sponsoredSubtreeIds(rootActorId: string): Set<string> {
    const ids = new Set<string>();
    const queue = [rootActorId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const child of this.networkTree(id)) {
        if (!ids.has(child.actorId)) {
          ids.add(child.actorId);
          queue.push(child.actorId);
        }
      }
    }
    return ids;
  }

  networkCounts(actorId: string): {
    collectors: number;
    farmers: number;
    processingSites: number;
    aggregators: number;
    exporters: number;
  } {
    const subtree = this.sponsoredSubtreeIds(actorId);
    let collectors = 0;
    let farmers = 0;
    let processingSites = 0;
    let aggregators = 0;
    let exporters = 0;
    for (const id of subtree) {
      const a = this.w.actors.get(id);
      if (!a) continue;
      if (a.actorType === "collector") collectors++;
      else if (a.actorType === "farmer") farmers++;
      else if (a.actorType === "washing_station" || a.actorType === "mill") processingSites++;
      else if (a.actorType === "akrabi") aggregators++;
      else if (a.actorType === "exporter") exporters++;
    }
    return { collectors, farmers, processingSites, aggregators, exporters };
  }

  /**
   * Lots that reached `viewerId` via custody movement from `subjectId`
   * (or from someone in subject's sponsored tree).
   */
  actorDeliveriesTo(
    viewerId: string,
    subjectId: string,
  ): Array<{
    lotId: string;
    displayCode: string;
    form: string;
    weightKg: number;
    receivedAt: string;
    movementId: string;
  }> {
    const fromSet = new Set(this.sponsoredSubtreeIds(subjectId));
    fromSet.add(subjectId);
    const out: Array<{
      lotId: string;
      displayCode: string;
      form: string;
      weightKg: number;
      receivedAt: string;
      movementId: string;
    }> = [];
    for (const m of this.w.movements.values()) {
      if (m.toActorId !== viewerId) continue;
      if (!fromSet.has(m.fromActorId)) continue;
      if (m.state === "pending" || m.state === "receipt_overdue") continue;
      const lot = this.w.lots.get(m.lotId);
      if (!lot) continue;
      const receiptEv = m.receiptEventId
        ? this.w.events.find((e) => e.eventId === m.receiptEventId)
        : undefined;
      out.push({
        lotId: lot.lotId,
        displayCode: lot.displayCode,
        form: lot.processingState,
        weightKg: m.receiverDeclaredKg ?? m.senderDeclaredKg,
        receivedAt: receiptEv?.eventTimeActual ?? receiptEv?.serverCommitTime ?? "",
        movementId: m.movementId,
      });
    }
    out.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
    return out;
  }

  networkProfile(viewerId: string, subjectId: string): {
    actor: ActorRecord;
    displayLabel: string;
    relation: string;
    metadata: Record<string, string>;
    legalIdentityRef: string;
    counts: ReturnType<LedgerEngine["networkCounts"]>;
    networkMembers: Array<{
      actorId: string;
      actorType: string;
      displayLabel: string;
    }>;
    deliveries: ReturnType<LedgerEngine["actorDeliveriesTo"]>;
  } | null {
    const actor = this.w.actors.get(subjectId);
    if (!actor) return null;
    const viewer = this.w.actors.get(viewerId);
    const inTree =
      subjectId === viewerId ||
      this.sponsoredSubtreeIds(viewerId).has(subjectId) ||
      actor.sponsorActorId === viewerId;
    if (!inTree && viewer) {
      return null;
    }
    const relation =
      subjectId === viewerId
        ? "Your profile"
        : actor.sponsorActorId === viewerId
          ? "In your sponsored network"
          : "In your network";

    const typeOrder = (t: string) => {
      if (t === "collector") return 0;
      if (t === "washing_station" || t === "mill") return 1;
      if (t === "farmer") return 2;
      if (t === "akrabi") return 3;
      if (t === "exporter") return 4;
      return 9;
    };

    const networkMembers = this.networkTree(subjectId)
      .map((c) => ({
        actorId: c.actorId,
        actorType: c.actorType,
        displayLabel: this.displayNameFor(viewerId, c.actorId),
      }))
      .sort((a, b) => typeOrder(a.actorType) - typeOrder(b.actorType));

    return {
      actor,
      displayLabel: this.displayNameFor(viewerId, subjectId),
      relation,
      metadata: { ...actor.metadata },
      legalIdentityRef: actor.legalIdentityRef,
      counts: this.networkCounts(subjectId),
      networkMembers,
      deliveries: this.actorDeliveriesTo(viewerId, subjectId),
    };
  }

  displayNameFor(viewerId: string, subjectId: string): string {
    const viewer = this.w.actors.get(viewerId);
    const subject = this.w.actors.get(subjectId);
    if (!viewer || !subject) return subjectId;
    if (viewer.actorType === "farmer") return subject.displayName;
    const numberedExporter =
      subject.actorType === "exporter" && !!subject.sponsorActorId && subjectId !== viewerId;
    if (
      subject.actorType === "farmer" ||
      subject.actorType === "collector" ||
      subject.actorType === "akrabi" ||
      numberedExporter
    ) {
      const siblings = [...this.w.actors.values()].filter(
        (a) =>
          a.sponsorActorId === subject.sponsorActorId &&
          a.actorType === subject.actorType,
      );
      const idx = siblings.findIndex((a) => a.actorId === subjectId) + 1;
      const label =
        subject.actorType === "exporter"
          ? `Exporter ${idx}`
          : subject.actorType === "akrabi"
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
    traceability: {
      ok: boolean;
      farmerVerified: number;
      counterparty: number;
      untraced: number;
      activeLots: number;
    };
    weightBalance: {
      ok: boolean;
      minted: number;
      active: number;
      closed: number;
      rejectLoss: number;
    };
    discrepancies: { open: number };
  } {
    const roots = new Set<string>();
    let untraced = 0;
    let activeLots = 0;
    for (const l of this.w.lots.values()) {
      if (l.status !== "active") continue;
      activeLots++;
      let traced = true;
      for (const oid of this.traceBackward(l.lotId)) {
        roots.add(oid);
        const o = this.w.lots.get(oid);
        const hasFarmer = !!o && Object.keys(o.provenance).some(
          (k) => this.w.actors.get(k)?.actorType === "farmer",
        );
        if (!hasFarmer) traced = false;
      }
      if (!traced) untraced++;
    }
    let farmerVerified = 0;
    let counterparty = 0;
    for (const oid of roots) {
      const o = this.w.lots.get(oid);
      if (o?.originStatus === "farmer_verified") farmerVerified++;
      else counterparty++;
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
    const terminalEvents = new Set(
      this.w.events.filter((e) => e.eventType === "terminal_disposition").map((e) => e.eventId),
    );
    let active = 0;
    let closed = 0;
    for (const l of this.w.lots.values()) {
      if (l.status === "active") active += l.canonicalMassKg;
      else if (l.inactiveEventId && terminalEvents.has(l.inactiveEventId)) {
        closed += l.canonicalMassKg;
      }
    }
    const weightOk = Math.abs(minted - (active + closed + rejectLoss)) <= 0.01;
    return {
      traceability: {
        ok: untraced === 0,
        farmerVerified,
        counterparty,
        untraced,
        activeLots,
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

  /** Open issues on a lot or its ancestry (Module 12: BLOCK/WARN stays in the panel header). */
  lotIssues(lotId: string): IssueRecord[] {
    const ids = this.ancestorLotIds(lotId);
    const movementIds = new Set(
      [...this.w.movements.values()].filter((m) => ids.has(m.lotId)).map((m) => m.movementId),
    );
    return this.w.issues.filter(
      (i) =>
        i.lifecycle !== "RESOLVED" &&
        (i.lotIds.some((id) => ids.has(id)) ||
          ids.has(i.subjectId) ||
          movementIds.has(i.subjectId)),
    );
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

  /** Full backward ancestry tree for inspector UI (all hops + node cards). */
  lineageTrace(lotId: string, viewerActorId?: string): {
    origins: string[];
    forward: string[];
    forwardLots: Array<{
      lotId: string;
      displayCode: string;
      form: string;
      status: string;
    }>;
    farmCount: number;
    lot?: LotRecord;
    edges: LineageEdgeRecord[];
    nodes: LineageTraceNode[];
  } {
    const lotIds = this.ancestorLotIds(lotId);
    const edges = this.w.lineage.filter(
      (e) => lotIds.has(e.childLotId) && lotIds.has(e.parentLotId),
    );
    const parentsOf = (id: string) => edges.filter((e) => e.childLotId === id);
    const label = (actorId: string) =>
      viewerActorId
        ? this.displayNameFor(viewerActorId, actorId)
        : (this.w.actors.get(actorId)?.displayName ?? actorId);

    const nodes: LineageTraceNode[] = [...lotIds]
      .map((id) => this.w.lots.get(id))
      .filter((lot): lot is LotRecord => !!lot)
      .map((lot) => {
      const id = lot.lotId;
      const parents = parentsOf(id);
      const parentLots = parents
        .map((e) => this.w.lots.get(e.parentLotId))
        .filter(Boolean) as LotRecord[];
      const createEv = this.w.events.find((e) => e.eventId === lot.createdEventId);
      const owner = this.w.actors.get(lot.ownerActorId);
      const ownerLabel = label(lot.ownerActorId);
      const custodianLabel = label(lot.custodianActorId);

      const routeLabel = titleCase(lot.processingRoute);
      const stateLabel = coffeeStateLabel(lot.processingState);

      let kind: LineageTraceNode["kind"] = "other";
      let title = stateLabel;
      let summary = `${routeLabel}`;
      let yieldPct: number | undefined;
      let processDetail: LineageTraceNode["processDetail"];
      let aggregateDetail: LineageTraceNode["aggregateDetail"];

      if (parents.length === 0) {
        kind = "origin";
        const firstFarmer = Object.keys(lot.provenance)[0];
        title = firstFarmer ? label(firstFarmer) : "Origin";
        const place =
          lot.originLocationId?.replace(/_/g, " ") ||
          lot.locationId?.replace(/_/g, " ") ||
          owner?.metadata?.kebele ||
          owner?.metadata?.region ||
          "Parcel";
        const woreda = owner?.metadata?.woreda;
        summary = woreda
          ? `Harvest parcel · ${place}, ${woreda} · ${lot.cropYear ?? "mix"}`
          : `Harvest parcel · ${place} · ${lot.cropYear ?? "mix"}`;
      } else if (createEv?.eventType === "process") {
        kind = "process";
        title = stateLabel;
        const inputMass = parentLots.reduce((s, p) => s + p.canonicalMassKg, 0);
        if (inputMass > 0) {
          yieldPct = Math.round((lot.canonicalMassKg / inputMass) * 1000) / 10;
        }
        summary = `Processed here · yield ${yieldPct?.toFixed(1) ?? "—"}% · ${routeLabel}`;
        const pl = createEv.payload;
        const byProductKg = ((pl.byProducts as Array<{ massKg: number }>) ?? []).reduce(
          (s, b) => s + Number(b.massKg ?? 0),
          0,
        );
        const rejectKg = Number(pl.rejectKg ?? 0);
        const lossKg = Number(pl.lossKg ?? 0);
        processDetail = {
          inputKg: roundMass(inputMass),
          productKg: lot.canonicalMassKg,
          rejectKg,
          lossKg,
          lossCategory: pl.lossCategory ? String(pl.lossCategory) : undefined,
          byProductKg: roundMass(byProductKg),
          balanced: massesEqual(inputMass, lot.canonicalMassKg + rejectKg + lossKg + byProductKg),
          facilityLabel: pl.facilityActorId
            ? (this.w.actors.get(String(pl.facilityActorId))?.displayName ?? undefined)
            : undefined,
          moisturePct: pl.moisturePct != null ? Number(pl.moisturePct) : undefined,
        };
      } else if (createEv?.eventType === "disaggregate") {
        kind = "split";
        title = stateLabel;
        summary = `Split from a larger lot · ${routeLabel}`;
      } else if (createEv?.eventType === "aggregate" || parents.length > 1) {
        kind = "aggregate";
        title = `Aggregated ${stateLabel.toLowerCase()}`;
        summary = `Combined from ${parents.length} harvest lot${parents.length === 1 ? "" : "s"} · ${routeLabel}`;
        aggregateDetail = {
          combinedFrom: parents.length,
          provenance: Object.entries(lot.provenance)
            .sort((a, b) => b[1] - a[1])
            .map(([actorId, share]) => ({ actorId, label: label(actorId), pct: Math.round(share * 1000) / 10 })),
        };
      } else {
        title = stateLabel;
        summary = `${stateLabel} · ${routeLabel}`;
      }

      return {
        lotId: lot.lotId,
        displayCode: lot.displayCode,
        title,
        summary,
        kind,
        massKg: lot.canonicalMassKg,
        processingState: lot.processingState,
        processingRoute: lot.processingRoute,
        status: lot.status,
        cropYear: lot.cropYear,
        originStatus: lot.originStatus,
        yieldPct,
        parentLotIds: parents.map((p) => p.parentLotId),
        parentCount: parents.length,
        ownerLabel,
        custodianLabel,
        locationId: lot.locationId,
        originLocationId: lot.originLocationId,
        ownerActorId: lot.ownerActorId,
        custodianActorId: lot.custodianActorId,
        cropYearComposition: lot.cropYearComposition,
        provenance: lot.provenance,
        contributions: parents.map((p) => ({
          parentLotId: p.parentLotId,
          contributionKg: p.contributionKg,
          proportion: p.proportion,
        })),
        eventId: lot.createdEventId,
        eventType: createEv?.eventType,
        processDetail,
        aggregateDetail,
      };
    });

    return {
      origins: this.traceBackward(lotId),
      forward: this.forwardOneHop(lotId),
      forwardLots: this.forwardOneHop(lotId).map((id) => {
        const l = this.w.lots.get(id);
        return {
          lotId: id,
          displayCode: l?.displayCode ?? id.slice(0, 8),
          form: l?.processingState ?? "",
          status: l?.status ?? "",
        };
      }),
      farmCount: this.farmCountForLot(lotId),
      lot: this.w.lots.get(lotId),
      edges,
      nodes,
    };
  }

  getMovements(): MovementRecord[] {
    return [...this.w.movements.values()];
  }

  getUsers(): UserRecord[] {
    return [...this.w.users.values()];
  }

  getFacilities(): FacilityRecord[] {
    return [...this.w.facilities.values()];
  }

  getDiscrepancies(): DiscrepancyRecord[] {
    return [...this.w.discrepancies];
  }

  getLotSeq(): number {
    return this.w.lotSeq;
  }

  getLastHash(): string {
    return this.w.lastHash;
  }

  getIssues(): IssueRecord[] {
    return [...this.w.issues];
  }

  /** Issues where the actor is a party (oversight roles see all). */
  issuesFor(actorId: string): IssueRecord[] {
    if (this.isOversight(actorId)) return [...this.w.issues];
    const visible = new Set(this.visibleLots(actorId).map((l) => l.lotId));
    return this.w.issues.filter(
      (i) => i.partyActorIds.includes(actorId) || i.lotIds.some((id) => visible.has(id)),
    );
  }

  getObligations(): ObligationRecord[] {
    return [...this.w.obligations];
  }

  obligationsFor(actorId: string): ObligationRecord[] {
    if (this.isOversight(actorId)) return [...this.w.obligations];
    return this.w.obligations.filter(
      (o) => o.accountableActorId === actorId || o.history.some((h) => h.fromActorId === actorId),
    );
  }

  /** Module 11: action-worthy notifications for this actor; receipt prompts vanish once acted on. */
  getNotifications(actorId: string): NotificationRecord[] {
    return this.w.notifications.filter((n) => {
      if (n.recipientActorId !== actorId) return false;
      if (n.category === "required_receipt" && n.triggerRef) {
        const m = this.w.movements.get(n.triggerRef);
        return !!m && (m.state === "pending" || m.state === "receipt_overdue");
      }
      if (n.category === "discrepancy" && n.triggerRef) {
        const d = this.w.discrepancies.find((x) => x.movementId === n.triggerRef);
        return !d || d.status === "open";
      }
      return true;
    });
  }

  getEvidence(): EvidenceRecord[] {
    return [...this.w.evidence.values()];
  }

  evidenceFor(actorId: string): EvidenceRecord[] {
    if (this.isOversight(actorId) || this.w.actors.get(actorId)?.capacities.includes("Verifier")) {
      return [...this.w.evidence.values()];
    }
    const visible = new Set(this.visibleLots(actorId).map((l) => l.lotId));
    return [...this.w.evidence.values()].filter(
      (e) => e.uploaderActorId === actorId || (e.attachedType === "lot" && visible.has(e.attachedId)) || e.attachedId === actorId,
    );
  }

  getContracts(): ContractRecord[] {
    return [...this.w.contracts.values()];
  }

  getCredentials(): CredentialRecord[] {
    return [...this.w.credentials];
  }

  getSanctions(): World["sanctions"] {
    return [...this.w.sanctions];
  }

  getAssessments(lotId?: string): ComplianceAssessmentRecord[] {
    return this.w.assessments.filter((a) => !lotId || a.lotId === lotId);
  }

  getSubmissions(lotId?: string): SubmissionRecord[] {
    return this.w.submissions.filter((s) => !lotId || s.lotId === lotId);
  }

  getReports(lotId?: string): ReportRecord[] {
    return this.w.reports.filter((r) => !lotId || r.lotId === lotId);
  }

  getStocktakes(actorId?: string): StocktakeRecord[] {
    return this.w.stocktakes.filter((s) => !actorId || s.stockHolderActorId === actorId);
  }

  getQuarantines(): QuarantineRecord[] {
    return [...this.w.quarantines];
  }

  getByProducts(): ByProductRecord[] {
    return [...this.w.byProducts];
  }

  getFarms(): FarmRecord[] {
    return [...this.w.farms.values()];
  }

  getFarmUnits(): FarmUnitRecord[] {
    return [...this.w.farmUnits.values()];
  }

  getGeometries(): GeometryVersionRecord[] {
    return [...this.w.geometries];
  }

  getOverlays(): OverlayRecord[] {
    return [...this.w.overlays];
  }

  getBlockRules(): World["blockRules"] {
    return [...this.w.blockRules];
  }

  getModelRegistry(): ModelRegistryEntry[] {
    return [...this.w.modelRegistry];
  }

  getRegulatorAccess(): RegulatorAccessRecord[] {
    return [...this.w.regulatorAccess];
  }

  getExternalClaims(): ExternalClaimRecord[] {
    return [...this.w.externalClaims];
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

/** Build an empty World shell (for hydrate assembly). */
export function createEmptyWorld(): World {
  return emptyWorld();
}
