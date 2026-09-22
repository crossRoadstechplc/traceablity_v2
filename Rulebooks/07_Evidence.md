# Module 7 of 11: Evidence
Master build prompt + acceptance tests. Phase 2 — depends on Identity & Access (Module 1); used by Compliance (Module 8) and Farm & Geospatial (Module 6).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Evidence module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Assume Module 1 is available. This module is a shared service other modules attach evidence through — it does not know about lots, farms, or compliance frameworks specifically, only about evidence objects linked to arbitrary object/event/requirement references.

**Scope — build:**
- EvidenceItem entity: attaches to a specific object, event, or requirement reference (a generic UID + type pointer, not a hardcoded foreign key to any one module), carrying source/issuer, date, validity period, uploader, document/evidence type, the specific fact it supports, verification status, and supersession/revocation status.
- Status vocabulary (from scaffolding doc, evidence-lifecycle family): UPLOADED, SYSTEM_VALIDATED, VERIFIED, EXPIRED, SUPERSEDED, REVOKED. Upload alone only ever produces UPLOADED status. An automated format/checksum/issuer-pattern check may advance it to SYSTEM_VALIDATED — this is a machine check, not human or authority verification, and must never be displayed or treated as equivalent to VERIFIED. Only a VerificationEvent performed by an authorized human under stated authority can produce VERIFIED. This evidence-lifecycle family is separate from Module 1's fact-confidence family (Declared/Counterparty Confirmed/Authority Verified) — the two must never be conflated or derived from one another.
- VerificationEvent entity: records who verified an EvidenceItem, when, under what authority, moving status from UPLOADED or SYSTEM_VALIDATED to VERIFIED (or directly flagging as invalid).
- Revocation handling: a RevocationEvent records an effective date and reason. Per the platform rule set, revocation is effective from its stated effective date, not retroactively — events/assessments dated before that effective date remain unaffected on their own terms; only those dated on or after the effective date move to Review Required status (this is a resolved rule, implement it exactly, do not treat it as still open).
- Evidence classes remain distinguishable: self-assessment, independent laboratory assessment, and official/authority assessment are different EvidenceItem subtypes or tagged categories, never merged into one generic "verified" bucket.
- Validity-at-time-of-event evaluation: when any other module checks whether evidence was valid for a given event, the check uses the evidence's validity period as of that event's actual time, not the evidence's status at query time.

**Scope — explicitly do not build in this module:**
- No compliance-framework-specific requirement logic (Module 8) — this module only stores and serves evidence objects and their status; Module 8 decides what evidence satisfies what requirement.
- No geometry-specific handling (Module 6 owns GeometryVersion; it may use this module's EvidenceItem for geometry-supporting documents, but geometry itself is not an EvidenceItem).

**Non-negotiable invariants — write these as automated tests:**
1. Upload never equals verification. An uploaded file with no VerificationEvent stays at UPLOADED status indefinitely, no matter how long it sits.
2. Later expiry never erases historical validity — an event that occurred while evidence was valid is not retroactively invalidated when the evidence later expires.
3. Revocation is forward-effective only, from its stated effective date, per the resolved rule above.
4. A later verification/test/assessment creates a new EvidenceItem; it never overwrites an earlier one.
5. Evidence class (self-assessed / lab / official) is preserved and visible, never collapsed into a single generic confidence indicator.

**Definition of Done:**
- Acceptance criteria below pass.
- The object/event/requirement attachment mechanism is generic enough that any future module can attach evidence without a schema change to this module.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Upload does not equal verification.** Given a user uploads a certificate document, when it is saved with no subsequent VerificationEvent, then its status remains UPLOADED indefinitely, and no downstream check treats it as VERIFIED.

**T2 — Historical validity survives later expiry.** Given evidence was valid from 1 January to 31 December 2025, when an event dated 15 June 2025 is evaluated after the evidence's 2025 expiry has passed, then the evidence is still treated as having been valid for that June event.

**T3 — Revocation is forward-effective only.** Given evidence is revoked on 1 August with an effective date of 1 August, when an event dated 15 July is evaluated, then it is unaffected by the revocation; when an event dated 15 August is evaluated, then it is moved to Review Required.

**T4 — New assessment does not overwrite.** Given a Lot has a quality assessment from Lab A dated March, when a second quality assessment from Lab B is recorded in June, then both assessments remain independently queryable, and neither is deleted or overwritten by the other.

**T5 — Evidence class stays distinguishable.** Given one EvidenceItem is a self-declared farmer statement and another is an official regulatory certificate, when both are queried, then their evidence class is visible and distinct, and no UI or API response presents them under one undifferentiated "Verified" label.

**T6 — Generic attachment mechanism.** Given a hypothetical future module needs to attach evidence to a new object type not yet defined, when it calls the Evidence module's attachment interface with that new object type's UID, then it succeeds without requiring a schema migration to the Evidence module itself.

**T7 — System validation is not human verification.** Given an uploaded certificate passes an automated checksum and issuer-pattern check, when its status is queried, then it shows SYSTEM_VALIDATED, not VERIFIED, and no UI surface labels it "Verified" until an authorized VerificationEvent actually occurs.

**T8 — Evidence lifecycle is independent of fact confidence.** Given a farm's origin fact is Authority Verified (Module 1's fact-confidence family) while its supporting boundary survey document is still only UPLOADED (this module's evidence-lifecycle family), when both are queried, then neither status is inferred from or overwrites the other.
