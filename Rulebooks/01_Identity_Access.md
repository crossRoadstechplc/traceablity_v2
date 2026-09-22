# Module 1 of 11: Identity & Access
Master build prompt + acceptance tests. Phase 1 — build first, everything else depends on it.

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Identity & Access module of Ankuaru, a coffee traceability platform. Follow this prompt exactly. Where anything is ambiguous or this prompt seems to conflict with itself, STOP and list the ambiguity instead of guessing. Do not invent business rules not stated here.

**Read first:** `00_Technical_Scaffolding.md` in this same delivery. Use its identity conventions and canonical event record without modification.

**Scope — build:**
- Actor entity: represents a legal or natural person, holding one or more authorized Capacities (Farmer, Collector, Aggregator, Exporter, Importer, Transporter, Driver, Facility Operator, Regulator, Verifier/Mapper/Lab).
- One Actor may hold multiple Capacities without duplicate identity records. Every write action anywhere in the platform must record both the Actor and the specific Capacity used for that action.
- User entity: an individual authenticated human tied to one or more Actors, with role/permission assignment via an auditable delegation hierarchy (least privilege).
- Credential entity: represents a competence certificate or trade licence where legally required, with issuer, scope, validity period, and status (Active/Expired/Revoked). Do not hardcode which capacities require which credentials — this is data, not code, because the exact matrix is still Pending Regulatory Verification (see Known Limitations below).
- Authentication: standard login plus step-up (re-authentication or second-person approval) for a defined set of high-consequence actions (see list below).
- Delegation: a Primary Authorized Representative per Actor, who may delegate scoped permissions to other Users, all changes attributable and revocable.

**Scope — explicitly do not build in this module:**
- No coffee, lot, farm, or event-type-specific logic. This module only answers "who is this, what may they act as, and are they authorized."
- No UI beyond what is needed to test this module in isolation (login, actor/capacity switch, credential upload).

**Non-negotiable invariants — write these as automated tests, not just code comments:**
1. Every Actor and User has an immutable UID that never changes for any reason (capacity change, credential change, status change).
2. No shared generic organizational login. Every action traces to one identified User.
3. Revoking a User's access must never alter or delete that User's historical actions/events.
4. Expiry or revocation of a Credential affects current authority only — historical transactions performed while the credential was valid remain valid in the historical record.
5. Farmers are never required to hold a competence certificate merely because other producer categories require one.
6. A single legal entity holding multiple capacities must not be forced into multiple accounts.

**Step-up authentication required for at least:** changing the Primary Authorized Representative, granting/revoking Credentials, and any permission-elevation action.

**Known limitation to encode, not solve:** the regional variation in the competence-certificate matrix is still Pending Regulatory Verification per Rulebook 2. The federal baseline, however, is now confirmed (REG-D02-01, Directive 02/2012 Art. 3): a Certificate of Competency requires adequate infrastructure/equipment (storage, drying beds, processing equipment, moisture meters), qualified cupping/liquoring personnel, certified lab access, and tax/legal compliance, for any actor engaging in processing, supply, roasting, or exporting. Build the Credential model as data-driven, seed it with this federal baseline as default criteria, and leave regional overlays as configurable and initially empty so they can be loaded later without a schema change. Do not block any action on a regional credential requirement you invented to fill that remaining gap.

**Definition of Done for this module (all required, not optional):**
- Acceptance criteria below pass.
- Authorization is enforced server-side, not merely hidden in the UI.
- Every Identity & Access event uses the canonical event record from the scaffolding doc.
- Automated tests exist for every numbered invariant above.
- No personal data beyond what's needed for the defined purpose is collected (data minimization).

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Multi-capacity identity.** Given an Actor registered as Exporter, when that Actor's user adds Processor and Warehouse Operator capacities, then the Actor UID does not change, one login grants access to all three capacity-specific workspaces, and each new event created afterward records which capacity was used.

**T2 — No shared login.** Given an organization with five employees, when the organization attempts to create one shared login for all five, then the system rejects it and requires five individually identified Users under the one Actor.

**T3 — Credential expiry does not rewrite history.** Given an Actor whose Processing Credential was valid on 1 March and expired on 1 April, when a Processing event dated 15 March is viewed after 1 April, then it still displays as performed under a valid credential, and any new Processing event attempted after 1 April by that Actor is blocked or flagged per the applicable authority tag.

**T4 — Revocation preserves history.** Given a User whose access is revoked on a given date, when historical events created by that User before revocation are queried, then they remain fully intact, attributed, and unaltered.

**T5 — Farmer exemption.** Given a Farmer Actor with no competence certificate on file, when the Farmer performs an origin-creation action, then the system does not block the action for lack of a credential that farmers are not required to hold.

**T6 — Step-up authentication.** Given an authenticated User attempting to change the Primary Authorized Representative, when the action is submitted, then the system requires re-authentication or second-person approval before the change is committed, and the change itself is recorded as an attributable event.

**T7 — Data-driven credential matrix.** Given the regional credential-requirement overlay is empty/unconfigured (representing the still-pending regional-variation gap), when any capacity-based action is attempted, then no action is blocked by an invented regional credential rule, and this is verifiable by inspecting configuration rather than code.

**T9 — Federal baseline enforced.** Given an Actor applies for a Processing Certificate of Competency without documented lab access, when the application is evaluated, then it is flagged incomplete against REG-D02-01's federal baseline criteria (infrastructure, personnel, lab, financial/legal), independent of any regional overlay.

**T8 — Server-side authorization.** Given a client request that bypasses the UI and calls the API directly attempting an action outside the caller's authorized capacity, when the request is received, then the server rejects it regardless of what the UI would have allowed.
