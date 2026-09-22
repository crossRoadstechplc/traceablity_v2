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
  exporter: ["akrabi"],
};

/** CORE §2.4 intake matrix */
export const INTAKE_MATRIX: Record<string, string[]> = {
  collector: ["farmer"],
  akrabi: ["collector"],
  exporter: ["akrabi"],
};

/** CORE §2.1 onboard matrix */
export const ONBOARD_MATRIX: Record<string, string[]> = {
  exporter: ["akrabi"],
  akrabi: ["collector"],
  collector: ["farmer"],
  farmer: [],
};

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
  | "REG-D02-02"
  | "REG-D02-03"
  | "REG-D02-05"
  | "REG-D05-04"
  | "REG-D05-06"
  | "FACILITY-CAP"
  | "LINEAGE-CYCLE"
  | "DOUBLE-SPEND"
  | "AI-WRITE-BAN";

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
