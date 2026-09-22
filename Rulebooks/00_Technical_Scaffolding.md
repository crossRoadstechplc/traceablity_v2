# Ankuaru Technical Scaffolding
Version 1.0 | Underlies all module build prompts | Traces to Rulebook 4 (Engineering)

This is the one shared contract every module prompt below assumes. It exists so Cursor does not invent identity, event, or API conventions independently per module, which is the most common source of silent cross-module inconsistency. Do not deviate from this schema without an explicit change request.

## 1. Identity conventions

- Every persistent object (Actor, Farm, Farm Unit, Lot, Facility, Driver, Vehicle, Movement, Event, Group/Program, Report) gets an immutable machine UID: UUIDv4 or equivalent globally-unique, non-sequential identifier. Never auto-increment integers for anything user-facing or cross-referenced.
- Human-readable references (journey references, display codes) are a separate field, never the primary key, and are allowed to evolve without touching the UID.
- Foreign keys and API resource references use machine UIDs only. External identifiers (Fayda reference, licence number, certificate number) are attributes, never primary keys.

## 2. Canonical event record (applies to every event family)

Every committed event, regardless of domain, carries at minimum:

```
event_id            UUID, client-generated before connectivity where offline
event_type          enum, versioned per schema_version
schema_version       string, e.g. "1.0"
actor_id             UUID reference to Identity & Access
acting_capacity      enum, the authorized role the actor used for this event
user_id              UUID of the individual authenticated user (may differ from actor_id for org actors)
device_id / session_id   string, where relevant to offline/audit
affected_object_ids  array of UUIDs, every object this event touches
event_time_actual    timestamp, when the physical/business fact occurred
event_time_recorded  timestamp, when the user/device recorded it locally
server_commit_time   timestamp, when the server durably committed it
source_channel       enum: web, mobile-online, mobile-offline-sync, api, retrospective
location             geo-point or facility_id, where applicable
retrospective_flag   boolean, true if entered after the fact per Rulebook 1 Section 14
payload              event-type-specific fields
integrity_hash        cryptographic link to prior event in the tamper-evident chain
```

Rules that apply to this record without exception: it is append-only, never UPDATE or DELETE on a committed row; `event_time_actual` is never replaced by `server_commit_time`; the same `event_id` submitted twice never creates a second event (idempotent on event_id).

## 3. Correction pattern

A correction is never an edit. It is a new event of type `Correction`, referencing the `event_id` it corrects, carrying the corrected value, reason, correcting user, and supporting evidence where required. The UI may display the corrected value as current state; the database must retain both.

## 4. Domain module boundary (reference — full detail in the Unified PRD Section 4)

| Module | Primary entities |
|---|---|
| Identity & Access | Actor, User, Role, Credential, Delegation |
| Coffee Ledger | Lot, LineageEdge, CropYear |
| Movement & Custody | Movement, DispatchEvent, ReceiptEvent |
| Processing | ProcessingEvent, Facility (processing capability) |
| Inventory | StockBalance (derived), Stocktake |
| Farm & Geospatial | Farm, FarmUnit, GeometryVersion |
| Evidence | EvidenceItem, VerificationEvent |
| Compliance | Framework, Requirement, ComplianceAssessment, Submission |
| Issues & Obligations | Issue, Obligation |
| Reporting & Audit | Report, AuditPackage |
| Notifications | Notification, DeliveryPreference |

A module owns writes to its own entities. Cross-module reads are allowed; cross-module writes to another module's entity are not — route through that module's event API instead.

## 5. Reference-range / authority tag (shared type used across modules)

```
authority_tag  enum: LEGAL_REQUIREMENT | OFFICIAL_TECHNICAL_STANDARD | INDUSTRY_BENCHMARK | ANKUARU_CONTROL_RULE
```
Every threshold, block rule, or reference range in any module must carry this tag. A rule with no tag is not eligible to BLOCK a transaction.

## 6. Status vocabularies (shared, do not invent module-local equivalents)

Fact-confidence and evidence-lifecycle are two separate canonical families. Do not conflate them, and do not derive one from the other — a fact can be Authority Verified while its supporting evidence is merely Uploaded, and vice versa.

- Fact confidence (how sure we are a claimed fact is true): `DECLARED | COUNTERPARTY_CONFIRMED | AUTHORITY_VERIFIED`
- Evidence lifecycle (the state of a supporting document/record itself): `UPLOADED | SYSTEM_VALIDATED | VERIFIED | EXPIRED | SUPERSEDED | REVOKED`. SYSTEM_VALIDATED means an automated check (format, checksum, issuer-pattern, cross-field consistency) passed; it is not human/authority verification and must never be displayed or treated as equivalent to VERIFIED.
- Compliance status: `READY | INCOMPLETE | EXCEPTION | REQUIRES_EXTERNAL_VERIFICATION | NOT_APPLICABLE`
- Intervention level: `BLOCK | WARN | FLAG`
- Issue lifecycle: `NORMAL | ANOMALY_WARNING | INVESTIGATION | CONFIRMED_EXCEPTION | RESOLVED`

## 7. What this document does not define

Database technology, hosting, and deployment are engineering's choice (Rulebook 4 Section 1). This document only fixes what must be identical across modules so they interoperate correctly. Ethiopian data-residency requirement (Rulebook 2 Section 34) applies regardless of technology chosen: personal data storage must be within Ethiopia.

## 8. Required completion self-report (every module, no exceptions)

When a module prompt says "self-report," it means the agent returns exactly this, not free text:

1. **Requirement coverage table** — every requirement/invariant this module was assigned, each marked IMPLEMENTED + TESTED, DEFERRED WITH REASON, or ESCALATED. No silent omissions.
2. **Files/components changed.**
3. **Schema/API/event changes**, referenced against Section 2 of this document.
4. **Automated tests added, and their results.**
5. **Security, privacy, offline/sync, and compliance impacts**, if any.
6. **Migration / backward-compatibility impact**, if any.
7. **Known limitations.**
8. **Escalation records raised** (Section 9 below), if any.
9. **Confirmation the module's acceptance tests pass**, listed by test ID.

A module is not complete until this report is returned in full and every item in it is either checked off or explicitly escalated.

## 9. Required escalation record (when a rule is ambiguous, contradictory, missing, or technically impossible)

Stop only the affected path, not the whole module, and record:

1. **Source reference(s) in conflict or gap.**
2. **The exact ambiguity or problem**, stated precisely.
3. **Why implementation cannot safely choose** on its own.
4. **Options considered, without selecting one.**
5. **Affected requirements, tests, data, or migrations.**
6. **Safe temporary state, if any — otherwise the affected path stops** rather than proceeding on a guess.

This is not optional scaffolding. An agent that silently picks an interpretation instead of filing this record has violated Rulebook 4 Section 66 regardless of how reasonable its guess turns out to be.
