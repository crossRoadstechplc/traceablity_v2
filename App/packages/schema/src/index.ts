import { z } from "zod";

export const SourceChannelSchema = z.enum([
  "web",
  "mobile_online",
  "mobile_offline_sync",
  "api",
  "retrospective",
]);
export type SourceChannel = z.infer<typeof SourceChannelSchema>;

/** Escalation: Module 13 USSD vs Module 00 enum — use api + channel_detail until enum approved */
export const ChannelDetailSchema = z.enum(["ussd"]).optional();

export const AuthorityTagSchema = z.enum([
  "LEGAL_REQUIREMENT",
  "OFFICIAL_TECHNICAL_STANDARD",
  "INDUSTRY_BENCHMARK",
  "ANKUARU_CONTROL_RULE",
]);
export type AuthorityTag = z.infer<typeof AuthorityTagSchema>;

export const FactConfidenceSchema = z.enum([
  "DECLARED",
  "COUNTERPARTY_CONFIRMED",
  "AUTHORITY_VERIFIED",
]);

export const EvidenceLifecycleSchema = z.enum([
  "UPLOADED",
  "SYSTEM_VALIDATED",
  "VERIFIED",
  "EXPIRED",
  "SUPERSEDED",
  "REVOKED",
]);

export const ComplianceStatusSchema = z.enum([
  "READY",
  "INCOMPLETE",
  "EXCEPTION",
  "REQUIRES_EXTERNAL_VERIFICATION",
  "NOT_APPLICABLE",
]);

export const InterventionLevelSchema = z.enum(["BLOCK", "WARN", "FLAG"]);

export const IssueLifecycleSchema = z.enum([
  "NORMAL",
  "ANOMALY_WARNING",
  "INVESTIGATION",
  "CONFIRMED_EXCEPTION",
  "RESOLVED",
]);

export const CapacityCodeSchema = z.enum([
  "Farmer",
  "Collector",
  "Aggregator",
  "Exporter",
  "Importer",
  "Transporter",
  "Driver",
  "FacilityOperator",
  "WarehouseOperator",
  "Regulator",
  "Verifier",
  "PlatformAdmin",
]);
export type CapacityCode = z.infer<typeof CapacityCodeSchema>;

export const ActorTypeSchema = z.enum([
  "farmer",
  "collector",
  "akrabi",
  "washing_station",
  "mill",
  "exporter",
  "transporter",
  "driver",
  "importer",
  "regulator",
  "verifier",
  "warehouse_operator",
  "facility_operator",
  "platform_admin",
]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const CoffeeStateSchema = z.enum([
  "cherry",
  "wet_parchment",
  "dry_parchment",
  "dried_cherry",
  "green_natural",
  "green_washed",
  "semi_washed",
  "supply",
  "export",
  "by_product",
  "domestic_consumption",
]);
export type CoffeeState = z.infer<typeof CoffeeStateSchema>;

export const ProcessingRouteSchema = z.enum([
  "washed",
  "natural",
  "unknown_at_origin",
  "semi_washed",
]);
export type ProcessingRoute = z.infer<typeof ProcessingRouteSchema>;

export const FactCategorySchema = z.enum([
  "Recorded",
  "Derived",
  "Assessment",
  "Inference",
]);

export const EventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.string(),
  schema_version: z.string().default("1.0"),
  actor_id: z.string().uuid().optional(),
  acting_capacity: CapacityCodeSchema.optional(),
  user_id: z.string().uuid().optional(),
  device_id: z.string().optional(),
  session_id: z.string().optional(),
  affected_object_ids: z.array(z.string().uuid()).default([]),
  event_time_actual: z.string().datetime(),
  event_time_recorded: z.string().datetime(),
  server_commit_time: z.string().datetime().optional(),
  source_channel: SourceChannelSchema,
  location: z
    .object({
      facility_id: z.string().uuid().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
  retrospective_flag: z.boolean().default(false),
  payload: z.record(z.unknown()),
  integrity_hash: z.string(),
  corrects_event_id: z.string().uuid().optional(),
  channel_detail: ChannelDetailSchema,
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const LOSS_ELIGIBLE_STATES: CoffeeState[] = [
  "cherry",
  "wet_parchment",
  "dry_parchment",
  "dried_cherry",
];

export const MOISTURE_MIN = 10.0;
export const MOISTURE_MAX = 12.5;

export const CAPACITY_TO_ACTOR_TYPE: Partial<Record<CapacityCode, ActorType>> = {
  Farmer: "farmer",
  Collector: "collector",
  Aggregator: "akrabi",
  Exporter: "exporter",
  Importer: "importer",
  Transporter: "transporter",
  Driver: "driver",
  FacilityOperator: "facility_operator",
  WarehouseOperator: "warehouse_operator",
  Regulator: "regulator",
  Verifier: "verifier",
  PlatformAdmin: "platform_admin",
};

/** CORE §2.3 send matrix by actor type */
export const SEND_MATRIX: Record<string, string[]> = {
  farmer: ["collector"],
  collector: ["akrabi"],
  akrabi: ["exporter"],
  exporter: ["akrabi", "importer"],
  importer: ["exporter"],
};

/** CORE §2.4 intake matrix */
export const INTAKE_MATRIX: Record<string, string[]> = {
  collector: ["farmer"],
  akrabi: ["collector"],
  exporter: ["akrabi"],
  importer: ["exporter"],
};

/** CORE §2.1 onboard matrix */
export const ONBOARD_MATRIX: Record<string, string[]> = {
  importer: ["exporter"],
  exporter: ["akrabi"],
  akrabi: ["collector"],
  collector: ["farmer"],
  farmer: [],
};

/** CORE §7.6 transfer-ownership fallback when send targets are empty */
export const TRANSFER_FALLBACK_MATRIX: Record<string, string[]> = {
  farmer: ["collector"],
  collector: ["akrabi"],
  akrabi: ["exporter"],
  exporter: ["akrabi", "importer"],
  importer: ["exporter"],
};

/** CORE §7.9 process UI outputs (never cherry) */
export const PROCESS_OUTPUT_STATES: CoffeeState[] = [
  "wet_parchment",
  "dry_parchment",
  "dried_cherry",
  "green_natural",
  "green_washed",
];

/** Module 04 T4: capability a facility must declare for each output state */
export const PROCESS_CAPABILITY_FOR_OUTPUT: Partial<Record<CoffeeState, string>> = {
  wet_parchment: "washed_processing",
  dry_parchment: "washed_processing",
  dried_cherry: "natural_processing",
  green_washed: "dry_milling",
  green_natural: "dry_milling",
};

export const DEFAULT_FACILITY_CAPABILITIES: Record<"washing_station" | "mill", string[]> = {
  washing_station: ["wet_milling", "washed_processing", "dry_milling"],
  mill: ["dry_milling", "natural_processing"],
};

/** REG-D02-02 applies to supply/export coffee — the green forms in this ledger */
export const SUPPLY_EXPORT_STATES: CoffeeState[] = [
  "green_washed",
  "green_natural",
  "supply",
  "export",
];

/**
 * Module 04 reference ranges (FLAG only, never BLOCK). Versioned so a Derived
 * yield assessment can be reproduced exactly (Module 15 T2).
 */
export const YIELD_REFERENCE_VERSION = "yield-ref-1.0";
export const YIELD_REFERENCE_RANGES: Array<{
  from: CoffeeState[];
  to: CoffeeState[];
  minPct: number;
  maxPct: number;
  authorityTag: AuthorityTag;
  sourceRef: string;
}> = [
  {
    from: ["cherry"],
    to: ["wet_parchment", "dry_parchment"],
    minPct: 45,
    maxPct: 60,
    authorityTag: "INDUSTRY_BENCHMARK",
    sourceRef: "Washed cherry→parchment benchmark",
  },
  {
    from: ["cherry"],
    to: ["dried_cherry"],
    minPct: 35,
    maxPct: 50,
    authorityTag: "INDUSTRY_BENCHMARK",
    sourceRef: "Natural cherry→dried cherry benchmark",
  },
  {
    from: ["wet_parchment", "dry_parchment", "dried_cherry"],
    to: ["green_washed", "green_natural"],
    minPct: 75,
    maxPct: 85,
    authorityTag: "INDUSTRY_BENCHMARK",
    sourceRef: "Module 04 T5 hulling reference range",
  },
];

/** Module 03 T2: receipt window after which a pending movement is Receipt Overdue */
export const RECEIPT_WINDOW_HOURS = 72;
/** Module 03 T4 / Module 09 T6 */
export const QUARANTINE_WINDOW_HOURS = 72;

/** REG-D02-04: the three legal transaction channels */
export const TRANSACTION_CHANNELS = [
  "primary_transaction_center",
  "direct_linkage",
  "ecx",
] as const;
export type TransactionChannel = (typeof TRANSACTION_CHANNELS)[number];

/** REG-D02-06 sanctions ladder, in order */
export const SANCTION_LADDER = [
  "written_warning",
  "certificate_suspension",
  "revocation_and_licence_cancellation",
  "seizure_and_judicial_referral",
] as const;
export type SanctionStep = (typeof SANCTION_LADDER)[number];

/** REG-D02-01 federal Certificate of Competency baseline */
export const FEDERAL_COC_CRITERIA = [
  "infrastructure",
  "personnel",
  "labAccess",
  "taxLegal",
] as const;

/** Module 09 final dispositions — Unresolved is a legitimate terminal state */
export const ISSUE_DISPOSITIONS = [
  "Resolved",
  "Explained",
  "Accepted",
  "Unresolved",
  "Escalated",
] as const;
export type IssueDisposition = (typeof ISSUE_DISPOSITIONS)[number];

/** Module 11 T1: the only categories allowed to notify */
export const NOTIFICATION_TRIGGERS = [
  "required_receipt",
  "discrepancy",
  "conflict",
  "credential_expiry",
  "evidence_invalid",
  "approval",
  "escalation",
] as const;

/** Module 08 framework catalogue (versions immutable; new version = new record) */
export type FrameworkRequirement = {
  code: string;
  title: string;
  appliesToMarkets: string[];
  kind: "all_origins_geolocated" | "lot_evidence_verified" | "external_verification";
  evidenceDocumentType?: string;
  sourceRef: string;
};
export type FrameworkVersion = {
  frameworkCode: string;
  version: string;
  effectiveFrom: string;
  requirements: FrameworkRequirement[];
};
export const FRAMEWORK_VERSIONS: FrameworkVersion[] = [
  {
    frameworkCode: "EUDR",
    version: "1",
    effectiveFrom: "2024-01-01T00:00:00.000Z",
    requirements: [
      {
        code: "EUDR-GEO",
        title: "Every origin plot geolocated",
        appliesToMarkets: ["EU"],
        kind: "all_origins_geolocated",
        sourceRef: "Reg. (EU) 2023/1115 Art. 9(1)(d)",
      },
      {
        code: "EUDR-LEGAL",
        title: "Produced in accordance with relevant legislation of country of production",
        appliesToMarkets: ["EU"],
        kind: "external_verification",
        sourceRef: "Reg. (EU) 2023/1115 Art. 3(b)",
      },
    ],
  },
  {
    frameworkCode: "EUDR",
    version: "2",
    effectiveFrom: "2025-12-30T00:00:00.000Z",
    requirements: [
      {
        code: "EUDR-GEO",
        title: "Every origin plot geolocated",
        appliesToMarkets: ["EU"],
        kind: "all_origins_geolocated",
        sourceRef: "Reg. (EU) 2023/1115 Art. 9(1)(d)",
      },
      {
        code: "EUDR-DDS",
        title: "Due diligence statement verified",
        appliesToMarkets: ["EU"],
        kind: "lot_evidence_verified",
        evidenceDocumentType: "due_diligence_statement",
        sourceRef: "Reg. (EU) 2023/1115 Art. 4(2)",
      },
      {
        code: "EUDR-LEGAL",
        title: "Produced in accordance with relevant legislation of country of production",
        appliesToMarkets: ["EU"],
        kind: "external_verification",
        sourceRef: "Reg. (EU) 2023/1115 Art. 3(b)",
      },
    ],
  },
];

export type InvariantId =
  | "INV-02"
  | "INV-04"
  | "INV-05"
  | "INV-07"
  | "INV-08"
  | "INV-09"
  | "INV-10"
  | "INV-11"
  | "INV-12"
  | "AUTH-CAPACITY"
  | "AUTH-SHARED-LOGIN"
  | "STEP-UP-REQUIRED"
  | "REG-D02-02"
  | "REG-D02-03"
  | "REG-D02-04"
  | "REG-D02-05"
  | "REG-D02-06"
  | "REG-D05-04"
  | "REG-D05-06"
  | "FACILITY-CAP"
  | "LINEAGE-CYCLE"
  | "DOUBLE-SPEND"
  | "AI-WRITE-BAN"
  | "ISSUE-AUTHORITY"
  | "ISSUE-EVIDENCE"
  | "OBLIGATION-OWNER"
  | "DUPLICATE-EVENT"
  | "MODEL-REGISTRY";

export class EngineError extends Error {
  constructor(
    public readonly invariantId: InvariantId | string,
    message: string,
    public readonly intervention: "BLOCK" | "WARN" | "FLAG" = "BLOCK",
    public readonly authorityTag?: AuthorityTag,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export function roundMass(kg: number): number {
  return Math.round(kg * 1e6) / 1e6;
}

export function massesEqual(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(roundMass(a) - roundMass(b)) <= tol;
}

/**
 * Key-sorted JSON so an integrity hash recomputed from Postgres JSONB (which
 * reorders keys) matches the hash computed at commit time.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
