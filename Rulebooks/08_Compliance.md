# Module 8 of 11: Compliance
Master build prompt + acceptance tests. Phase 4 — depends on Evidence (7), Farm & Geospatial (6), Coffee Ledger (2), Processing (4).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Compliance module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing. This is the most rule-dense module — do not simplify any of the following to make implementation easier.

**Read first:** `00_Technical_Scaffolding.md`. Assume Modules 1, 2, 4, 6, and 7 are available.

**Scope — build:**
- Framework entity: a governed object per supported framework (EUDR, C.A.F.E. Practices, Rainforest Alliance, future frameworks), with name, owner, current and historical versions, publication/effective/expiry dates, and applicable scope. Framework versions are immutable — a new version is a new record, never an edit to an old one.
- Requirement entity: atomic, testable requirements decomposed per framework version, each with source citation, applicability conditions, required evidence, canonical mapping to Ankuaru objects, validation logic, authority, and status logic.
- ComplianceAssessment entity: evaluates one Lot/shipment against one Framework version, producing requirement-level status only — READY, INCOMPLETE, EXCEPTION, REQUIRES_EXTERNAL_VERIFICATION, or NOT_APPLICABLE per requirement. Never compute or display an invented overall percentage compliance score. If a framework defines its own official scoring method, implement that exact method; otherwise show requirement-level states only.
- Applicability engine: before testing any requirement, determine whether it applies (framework, version, market, product, actor role, dates). NOT_APPLICABLE is a reasoned, machine-readable status with a recorded basis — never a substitute for missing evidence, and never guessed when applicability itself is uncertain (uncertain applicability becomes REQUIRES_EXTERNAL_VERIFICATION or a Pending Rule Interpretation state instead).
- Mixed-lot compliance: for an aggregated lot with mixed origin evidence states, compute and display the composition — do not average a majority-eligible composition into a whole-lot pass where the framework requires every origin to satisfy the condition.
- Cross-scheme volume-claim tracking (resolved rule — implement exactly): where one physical lot is claimed under two or more certification schemes with independent claim-volume rules, track each scheme's claimed volume separately. A single physical quantity may not exceed 100% claimed in aggregate across schemes without an explicit, evidenced multi-certification allowance recorded from both scheme owners. Default posture is reject/flag the second claim if it would exceed 100% aggregate.
- Post-rejection status handling (resolved rule — implement exactly): when an external scheme's platform rejects a submission that Ankuaru had marked READY, move that submission's status to EXCEPTION, not back to INCOMPLETE, and create an attributable discrepancy record capturing both Ankuaru's internal determination and the external system's rejection reason.
- Offline-sync framework-version precedence (resolved rule — implement exactly): evaluate every event under the framework version in force at the event's actual event time, not its sync time or evaluation time. A late-syncing event captured under version N is evaluated under version N even if version N+1 is already live when it syncs.
- Submission entity: a formal external submission is a distinct authorized act producing an immutable snapshot (payload, evidence cutoff, framework/version, submitter, recipient, time, acknowledgement). Later data changes never alter a historical submission; a material change produces a new version or a Superseded/Review Required flag on the old one.

**Scope — explicitly do not build in this module:**
- No evidence storage mechanics (Module 7 — this module only reads Evidence status and writes ComplianceAssessment results).
- No report generation/formatting (Module 10 — this module produces the underlying assessment data that Reporting packages).

**Non-negotiable invariants — write these as automated tests:**
1. No invented overall compliance percentage anywhere in the module's output.
2. NOT_APPLICABLE always carries a machine-readable, auditable basis.
3. Mixed-origin lots never get averaged into a whole-lot pass where the framework requires per-origin satisfaction.
4. Cross-scheme claimed volume never exceeds 100% of physical quantity without an explicit recorded multi-certification allowance.
5. A framework-rejected READY submission becomes EXCEPTION, never silently reverts to INCOMPLETE.
6. Every event is evaluated under the framework version live at its actual event time, never its sync/evaluation time.
7. Historical submissions are immutable; a later data change never edits a past submission's frozen payload.

**Definition of Done:**
- Acceptance criteria below pass.
- Every requirement's status is fully evidence-traceable back to source EvidenceItems and events.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — No invented score.** Given a Lot has 7 of 10 EUDR requirements satisfied, when the assessment is displayed, then it shows requirement-level status for all 10, and there is no "70% compliant" figure generated anywhere in the response.

**T2 — Reasoned N/A.** Given a requirement that only applies to EU-market shipments is evaluated for a domestic-only lot, when the assessment runs, then that requirement shows NOT_APPLICABLE with a recorded, queryable basis (market mismatch), not simply omitted from the result.

**T3 — Mixed-lot composition, no averaging.** Given an aggregated lot is 70% geolocation-complete and 30% missing geolocation evidence, and the framework requires 100% of origins to have geolocation, when the assessment runs, then the lot shows INCOMPLETE with the 70/30 composition visible, not READY based on majority.

**T4 — Cross-scheme claim cap.** Given a 1,000 kg lot has already claimed 600 kg under Rainforest Alliance, when an attempt is made to claim 500 kg of the same lot under a second scheme without a recorded multi-certification allowance, then the system flags or rejects the claim because 600 + 500 exceeds the 1,000 kg physical quantity.

**T5 — Post-rejection moves to Exception.** Given a submission was marked READY and submitted, and the external scheme's system rejects it, when the rejection is recorded, then the submission's status becomes EXCEPTION (not INCOMPLETE), with a discrepancy record showing both Ankuaru's original determination and the external rejection reason.

**T6 — Version precedence by event time.** Given an offline event was captured on 10 March under Framework Version 3, and Framework Version 4 became live on 1 April, and the event syncs on 15 April, when the event is assessed, then it is evaluated under Version 3, not Version 4.

**T7 — Immutable submission snapshot.** Given a submission was made on 1 May with a specific evidence snapshot, when underlying evidence changes on 1 June, then the 1 May submission's frozen payload is unchanged, and the change instead triggers a Superseded or Review Required flag alongside the original, not an edit to it.
