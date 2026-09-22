-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "integrity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('web', 'mobile_online', 'mobile_offline_sync', 'api', 'retrospective');

-- CreateEnum
CREATE TYPE "AuthorityTag" AS ENUM ('LEGAL_REQUIREMENT', 'OFFICIAL_TECHNICAL_STANDARD', 'INDUSTRY_BENCHMARK', 'ANKUARU_CONTROL_RULE');

-- CreateEnum
CREATE TYPE "FactConfidence" AS ENUM ('DECLARED', 'COUNTERPARTY_CONFIRMED', 'AUTHORITY_VERIFIED');

-- CreateEnum
CREATE TYPE "EvidenceLifecycle" AS ENUM ('UPLOADED', 'SYSTEM_VALIDATED', 'VERIFIED', 'EXPIRED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('READY', 'INCOMPLETE', 'EXCEPTION', 'REQUIRES_EXTERNAL_VERIFICATION', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "InterventionLevel" AS ENUM ('BLOCK', 'WARN', 'FLAG');

-- CreateEnum
CREATE TYPE "IssueLifecycle" AS ENUM ('NORMAL', 'ANOMALY_WARNING', 'INVESTIGATION', 'CONFIRMED_EXCEPTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('farmer', 'collector', 'akrabi', 'washing_station', 'mill', 'exporter', 'transporter', 'driver', 'importer', 'regulator', 'verifier', 'warehouse_operator', 'facility_operator', 'platform_admin');

-- CreateEnum
CREATE TYPE "CapacityCode" AS ENUM ('Farmer', 'Collector', 'Aggregator', 'Exporter', 'Importer', 'Transporter', 'Driver', 'FacilityOperator', 'WarehouseOperator', 'Regulator', 'Verifier', 'PlatformAdmin');

-- CreateEnum
CREATE TYPE "ActorStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('active', 'inactive', 'fully_consumed', 'exported', 'destroyed', 'other_terminal');

-- CreateEnum
CREATE TYPE "CoffeeState" AS ENUM ('cherry', 'wet_parchment', 'dry_parchment', 'dried_cherry', 'green_natural', 'green_washed', 'semi_washed', 'supply', 'export', 'by_product', 'domestic_consumption');

-- CreateEnum
CREATE TYPE "ProcessingRoute" AS ENUM ('washed', 'natural', 'unknown_at_origin', 'semi_washed');

-- CreateEnum
CREATE TYPE "MovementState" AS ENUM ('pending', 'in_transit', 'received_clean', 'received_discrepant', 'receipt_overdue', 'exception', 'quarantined');

-- CreateEnum
CREATE TYPE "TerminalReason" AS ENUM ('fob_export', 'domestic_disposition', 'destroyed');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('Active', 'Expired', 'Revoked', 'Incomplete');

-- CreateEnum
CREATE TYPE "EvidenceClass" AS ENUM ('self_assessment', 'laboratory', 'official_authority');

-- CreateEnum
CREATE TYPE "FactCategory" AS ENUM ('Recorded', 'Derived', 'Assessment', 'Inference');

-- CreateEnum
CREATE TYPE "TransactionChannel" AS ENUM ('primary_transaction_center', 'direct_linkage', 'ecx', 'other');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL DEFAULT '1.0',
    "actor_id" UUID,
    "acting_capacity" TEXT,
    "user_id" UUID,
    "device_id" TEXT,
    "session_id" TEXT,
    "affected_object_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "event_time_actual" TIMESTAMP(3) NOT NULL,
    "event_time_recorded" TIMESTAMP(3) NOT NULL,
    "server_commit_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_channel" "SourceChannel" NOT NULL DEFAULT 'web',
    "location_facility_id" UUID,
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "retrospective_flag" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "integrity_hash" TEXT NOT NULL,
    "corrects_event_id" UUID,
    "sequence" BIGSERIAL NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actors" (
    "id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "display_name" TEXT NOT NULL,
    "legal_identity_ref" TEXT NOT NULL,
    "status" "ActorStatus" NOT NULL DEFAULT 'active',
    "sponsor_actor_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actor_capacities" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "capacity" "CapacityCode" NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "actor_capacities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actor_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actor_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "issuer" TEXT,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "status" "CredentialStatus" NOT NULL DEFAULT 'Active',
    "evidence_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegations" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "grantor_user_id" UUID NOT NULL,
    "grantee_user_id" UUID NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_requirements" (
    "id" UUID NOT NULL,
    "capacity" "CapacityCode" NOT NULL,
    "region_code" TEXT,
    "criteria" JSONB NOT NULL,
    "authority_tag" "AuthorityTag" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "credential_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "display_code" TEXT NOT NULL,
    "commodity" TEXT NOT NULL DEFAULT 'coffee',
    "processing_state" "CoffeeState" NOT NULL,
    "processing_route" "ProcessingRoute" NOT NULL,
    "status" "LotStatus" NOT NULL DEFAULT 'active',
    "canonical_mass_kg" DECIMAL(18,6) NOT NULL,
    "original_unit" TEXT,
    "original_quantity" DECIMAL(18,6),
    "conversion_basis" TEXT,
    "owner_actor_id" UUID NOT NULL,
    "custodian_actor_id" UUID NOT NULL,
    "location_id" TEXT,
    "origin_location_id" TEXT,
    "crop_year" TEXT,
    "crop_year_composition" JSONB NOT NULL DEFAULT '{}',
    "origin_status" TEXT,
    "origin_farm_unit_id" UUID,
    "created_by_actor_id" UUID,
    "created_event_id" UUID NOT NULL,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "inactive_event_id" UUID,
    "in_transit" BOOLEAN NOT NULL DEFAULT false,
    "available_kg" DECIMAL(18,6) NOT NULL,
    "moisture_pct" DECIMAL(5,2),
    "transaction_channel" "TransactionChannel",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineage_edges" (
    "id" UUID NOT NULL,
    "parent_lot_id" UUID NOT NULL,
    "child_lot_id" UUID NOT NULL,
    "contribution_kg" DECIMAL(18,6) NOT NULL,
    "proportion" DECIMAL(18,9) NOT NULL,
    "event_id" UUID NOT NULL,

    CONSTRAINT "lineage_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movements" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "from_actor_id" UUID NOT NULL,
    "to_actor_id" UUID NOT NULL,
    "sender_declared_kg" DECIMAL(18,6) NOT NULL,
    "receiver_declared_kg" DECIMAL(18,6),
    "destination_location_id" TEXT,
    "state" "MovementState" NOT NULL DEFAULT 'pending',
    "dispatch_event_id" UUID,
    "receipt_event_id" UUID,
    "expected_receipt_by" TIMESTAMP(3),
    "vehicle_id" UUID,
    "driver_id" UUID,
    "contract_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discrepancies" (
    "id" UUID NOT NULL,
    "movement_id" UUID NOT NULL,
    "sender_kg" DECIMAL(18,6) NOT NULL,
    "receiver_kg" DECIMAL(18,6) NOT NULL,
    "delta_kg" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate_number" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "display_name" TEXT NOT NULL,
    "credential_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shinto_passes" (
    "id" UUID NOT NULL,
    "movement_id" UUID NOT NULL,
    "weight_kg" DECIMAL(18,6) NOT NULL,
    "volume" DECIMAL(18,6),
    "grade" TEXT NOT NULL,
    "lot_display_code" TEXT NOT NULL,
    "seal_status_origin" TEXT NOT NULL,
    "seal_verified_at" TIMESTAMP(3),
    "net_cargo_kg" DECIMAL(18,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shinto_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "supplier_actor_id" UUID NOT NULL,
    "exporter_actor_id" UUID NOT NULL,
    "coffee_type" TEXT NOT NULL,
    "quantity_kg" DECIMAL(18,6) NOT NULL,
    "grade" TEXT NOT NULL,
    "price_etb_per_kg" DECIMAL(18,4) NOT NULL,
    "execution_period" TEXT NOT NULL,
    "payment_terms" TEXT NOT NULL,
    "delivery_site" TEXT NOT NULL,
    "transport_cost_alloc" TEXT NOT NULL,
    "registration_ref" TEXT NOT NULL,
    "channel" "TransactionChannel" NOT NULL DEFAULT 'direct_linkage',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_bands" (
    "id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "max_etb" DECIMAL(18,4) NOT NULL,
    "min_etb" DECIMAL(18,4) NOT NULL,
    "premium_pct" DECIMAL(5,2) NOT NULL DEFAULT 5,

    CONSTRAINT "price_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "by_products" (
    "id" UUID NOT NULL,
    "source_event_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "mass_kg" DECIMAL(18,6) NOT NULL,
    "disposition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "by_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktakes" (
    "id" UUID NOT NULL,
    "facility_actor_id" UUID NOT NULL,
    "coffee_state" "CoffeeState" NOT NULL,
    "theoretical_kg" DECIMAL(18,6) NOT NULL,
    "physical_kg" DECIMAL(18,6) NOT NULL,
    "variance_kg" DECIMAL(18,6) NOT NULL,
    "observer_user_id" UUID NOT NULL,
    "explanation" TEXT,
    "counted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stocktakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" UUID NOT NULL,
    "owner_actor_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "point_lat" DOUBLE PRECISION,
    "point_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_units" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "polygon_pending" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geometry_versions" (
    "id" UUID NOT NULL,
    "farm_unit_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "geojson" JSONB,
    "capture_source" TEXT,
    "capture_method" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'pending',
    "anomaly_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "used_in_compliance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geometry_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geometry_overlays" (
    "id" UUID NOT NULL,
    "geometry_version_id" UUID NOT NULL,
    "overlay_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geometry_overlays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" UUID NOT NULL,
    "attached_type" TEXT NOT NULL,
    "attached_id" UUID NOT NULL,
    "evidence_class" "EvidenceClass" NOT NULL,
    "document_type" TEXT NOT NULL,
    "fact_supported" TEXT NOT NULL,
    "source_issuer" TEXT,
    "uploader_user_id" UUID NOT NULL,
    "storage_path" TEXT,
    "status" "EvidenceLifecycle" NOT NULL DEFAULT 'UPLOADED',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_events" (
    "id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "verifier_user_id" UUID NOT NULL,
    "authority" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revocation_events" (
    "id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revocation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frameworks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_versions" (
    "id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "framework_version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "citation" TEXT NOT NULL,
    "applicability" JSONB NOT NULL DEFAULT '{}',
    "validationLogic" JSONB NOT NULL DEFAULT '{}',
    "authority" TEXT,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_assessments" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "framework_version_id" UUID NOT NULL,
    "results" JSONB NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_time_basis" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "assessment_id" UUID,
    "framework_version_id" UUID NOT NULL,
    "payload_snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "submitter_user_id" UUID NOT NULL,
    "recipient" TEXT,
    "acknowledgement" TEXT,
    "rejection_reason" TEXT,
    "frozen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_volume_claims" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "scheme" TEXT NOT NULL,
    "claimed_kg" DECIMAL(18,6) NOT NULL,
    "allowance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheme_volume_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "lifecycle" "IssueLifecycle" NOT NULL DEFAULT 'ANOMALY_WARNING',
    "intervention" "InterventionLevel" NOT NULL,
    "authority_tag" "AuthorityTag",
    "source_ref" TEXT,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "disposition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "accountable_actor_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escalated_at" TIMESTAMP(3),

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligation_handovers" (
    "id" UUID NOT NULL,
    "obligation_id" UUID NOT NULL,
    "from_actor_id" UUID NOT NULL,
    "to_actor_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligation_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_rule_registry" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "authority_tag" "AuthorityTag" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "approval_ref" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_rule_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "lot_id" UUID,
    "payload" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "supersedes_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_packages" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "established" JSONB NOT NULL DEFAULT '[]',
    "missing" JSONB NOT NULL DEFAULT '[]',
    "pending" JSONB NOT NULL DEFAULT '[]',
    "exceptions" JSONB NOT NULL DEFAULT '[]',
    "not_applicable" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulator_access_logs" (
    "id" UUID NOT NULL,
    "regulator_user_id" UUID NOT NULL,
    "data_accessed" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulator_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_exceptions" (
    "id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "trigger_ref" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delivery_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_registry" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "training_data" TEXT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '[]',
    "version" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "deployment_scope" TEXT NOT NULL,
    "monitoring_plan" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_sequences" (
    "id" TEXT NOT NULL DEFAULT 'lot',
    "next_val" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "display_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity"."checkpoints" (
    "id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "event_id" UUID NOT NULL,
    "chain_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_event_id_key" ON "events"("event_id");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_actor_id_idx" ON "events"("actor_id");

-- CreateIndex
CREATE INDEX "events_server_commit_time_idx" ON "events"("server_commit_time");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "actors_legal_identity_ref_key" ON "actors"("legal_identity_ref");

-- CreateIndex
CREATE INDEX "actors_sponsor_actor_id_idx" ON "actors"("sponsor_actor_id");

-- CreateIndex
CREATE INDEX "actors_actor_type_idx" ON "actors"("actor_type");

-- CreateIndex
CREATE UNIQUE INDEX "actor_capacities_actor_id_capacity_key" ON "actor_capacities"("actor_id", "capacity");

-- CreateIndex
CREATE UNIQUE INDEX "actor_memberships_user_id_actor_id_key" ON "actor_memberships"("user_id", "actor_id");

-- CreateIndex
CREATE INDEX "credentials_actor_id_kind_idx" ON "credentials"("actor_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "lots_display_code_key" ON "lots"("display_code");

-- CreateIndex
CREATE INDEX "lots_custodian_actor_id_status_idx" ON "lots"("custodian_actor_id", "status");

-- CreateIndex
CREATE INDEX "lots_owner_actor_id_idx" ON "lots"("owner_actor_id");

-- CreateIndex
CREATE INDEX "lineage_edges_child_lot_id_idx" ON "lineage_edges"("child_lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineage_edges_parent_lot_id_child_lot_id_key" ON "lineage_edges"("parent_lot_id", "child_lot_id");

-- CreateIndex
CREATE INDEX "movements_to_actor_id_state_idx" ON "movements"("to_actor_id", "state");

-- CreateIndex
CREATE INDEX "movements_lot_id_idx" ON "movements"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "discrepancies_movement_id_key" ON "discrepancies"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "shinto_passes_movement_id_key" ON "shinto_passes"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_bands_as_of_date_key" ON "price_bands"("as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_actor_id_key" ON "facilities"("actor_id");

-- CreateIndex
CREATE INDEX "farms_owner_actor_id_idx" ON "farms"("owner_actor_id");

-- CreateIndex
CREATE INDEX "farm_units_farm_id_idx" ON "farm_units"("farm_id");

-- CreateIndex
CREATE UNIQUE INDEX "geometry_versions_farm_unit_id_version_key" ON "geometry_versions"("farm_unit_id", "version");

-- CreateIndex
CREATE INDEX "evidence_items_attached_type_attached_id_idx" ON "evidence_items"("attached_type", "attached_id");

-- CreateIndex
CREATE UNIQUE INDEX "framework_versions_framework_id_version_key" ON "framework_versions"("framework_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_framework_version_id_code_key" ON "requirements"("framework_version_id", "code");

-- CreateIndex
CREATE INDEX "compliance_assessments_lot_id_idx" ON "compliance_assessments"("lot_id");

-- CreateIndex
CREATE INDEX "scheme_volume_claims_lot_id_idx" ON "scheme_volume_claims"("lot_id");

-- CreateIndex
CREATE INDEX "issues_subject_type_subject_id_idx" ON "issues"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "obligations_accountable_actor_id_status_idx" ON "obligations"("accountable_actor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "block_rule_registry_code_key" ON "block_rule_registry"("code");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_preferences_user_id_category_channel_key" ON "delivery_preferences"("user_id", "category", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "model_registry_name_key" ON "model_registry"("name");

-- CreateIndex
CREATE INDEX "checkpoints_event_id_idx" ON "integrity"."checkpoints"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_sequence_key" ON "integrity"."checkpoints"("sequence");

-- AddForeignKey
ALTER TABLE "actors" ADD CONSTRAINT "actors_sponsor_actor_id_fkey" FOREIGN KEY ("sponsor_actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actor_capacities" ADD CONSTRAINT "actor_capacities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actor_memberships" ADD CONSTRAINT "actor_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actor_memberships" ADD CONSTRAINT "actor_memberships_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_grantor_user_id_fkey" FOREIGN KEY ("grantor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_grantee_user_id_fkey" FOREIGN KEY ("grantee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_owner_actor_id_fkey" FOREIGN KEY ("owner_actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_custodian_actor_id_fkey" FOREIGN KEY ("custodian_actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_edges" ADD CONSTRAINT "lineage_edges_parent_lot_id_fkey" FOREIGN KEY ("parent_lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_edges" ADD CONSTRAINT "lineage_edges_child_lot_id_fkey" FOREIGN KEY ("child_lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shinto_passes" ADD CONSTRAINT "shinto_passes_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_owner_actor_id_fkey" FOREIGN KEY ("owner_actor_id") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_units" ADD CONSTRAINT "farm_units_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geometry_versions" ADD CONSTRAINT "geometry_versions_farm_unit_id_fkey" FOREIGN KEY ("farm_unit_id") REFERENCES "farm_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geometry_overlays" ADD CONSTRAINT "geometry_overlays_geometry_version_id_fkey" FOREIGN KEY ("geometry_version_id") REFERENCES "geometry_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revocation_events" ADD CONSTRAINT "revocation_events_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_versions" ADD CONSTRAINT "framework_versions_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_framework_version_id_fkey" FOREIGN KEY ("framework_version_id") REFERENCES "framework_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_assessments" ADD CONSTRAINT "compliance_assessments_framework_version_id_fkey" FOREIGN KEY ("framework_version_id") REFERENCES "framework_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligation_handovers" ADD CONSTRAINT "obligation_handovers_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

