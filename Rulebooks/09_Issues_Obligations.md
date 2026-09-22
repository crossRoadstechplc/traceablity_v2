# Module 9 of 11: Issues & Obligations
Master build prompt + acceptance tests. Phase 4 — depends on all upstream modules that can raise an issue (2, 3, 4, 5, 6, 7, 8).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Issues & Obligations module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. This module is a cross-cutting service: other modules raise Issues and Obligations against it, it does not independently generate business logic about lots, movements, or compliance itself.

**Scope — build:**
- Issue entity: represents an anomaly or exception, with lifecycle state NORMAL, ANOMALY_WARNING, INVESTIGATION, CONFIRMED_EXCEPTION, RESOLVED. Final disposition on resolution is one of Resolved, Explained, Accepted/Within Judgment, Unresolved, or Escalated. UNRESOLVED is a legitimate permanent final state — the system must never force a user to pick a false-certainty disposition.
- Obligation entity: represents a required action, always with exactly one accountable actor for the next action at any given time. Obligations may hand off between actors as dependencies complete; every handover is itself a recorded, attributable event.
- Intervention-level enforcement: every rule anywhere in the platform that can trigger an Issue must declare its intervention level (BLOCK, WARN, FLAG per scaffolding doc) and its authority_tag. This module enforces that a BLOCK-level rule cannot be registered without both an authority_tag and (for new BLOCK rules specifically) a recorded source/scope/owner/approval trail, since adding a new hard BLOCK is a governance-significant change.
- Resolution authority check: a user may only resolve an Issue or Obligation within their granted authority scope (from Module 1); the module rejects resolution attempts outside that scope rather than silently allowing them.
- Quarantine handling from Movement & Custody (Module 3): this module is the home for the quarantined-conflict Obligation created by Module 3, including the 72-hour default resolution window and escalation path.

**Scope — explicitly do not build in this module:**
- No module-specific business rules (e.g. what counts as a mass-balance anomaly lives in Module 4; this module only stores and routes the resulting Issue).
- No notification delivery (Module 11 — this module raises Issues/Obligations; Module 11 decides how/when to notify about them).

**Non-negotiable invariants — write these as automated tests:**
1. An anomaly is never automatically a confirmed breach — CONFIRMED_EXCEPTION requires an applicable rule plus adequate evidence or an authorized determination, not just an out-of-range flag.
2. UNRESOLVED is accepted as a valid, permanent terminal state; the system never coerces a user into selecting Resolved/Explained to close a record.
3. Every Obligation has exactly one accountable actor at any point in time — never zero, never more than one simultaneously.
4. A user cannot resolve an Issue/Obligation outside their granted authority scope.
5. A new BLOCK-level rule cannot be registered without a recorded source, scope, owner, and approval reference.

**Definition of Done:**
- Acceptance criteria below pass.
- Every Issue/Obligation state transition uses the canonical event record and is attributable.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Anomaly is not automatically breach.** Given a mass-balance FLAG is raised for unusual loss percentage, when the Issue is created, then its initial state is ANOMALY_WARNING, not CONFIRMED_EXCEPTION, and it only reaches CONFIRMED_EXCEPTION through an explicit authorized determination referencing a specific rule and evidence.

**T2 — Unresolved is a legitimate final state.** Given an investigation into a discrepancy cannot reach a conclusion, when the user attempts to close it, then Unresolved is available and acceptable as a final disposition, and the system does not require a different, more definite outcome to close the record.

**T3 — Single accountable actor.** Given an Obligation is created for a receiving actor, when it is handed off to a different actor after a dependency completes, then at every point in time exactly one actor is shown as accountable, and the handover itself is a recorded event with both actors identified.

**T4 — Authority-scoped resolution.** Given a user without regulatory-issue resolution authority attempts to resolve a regulator-raised Issue, when the resolution is submitted, then it is rejected, and the rejection is itself logged.

**T5 — New BLOCK rule governance check.** Given a developer or agent attempts to register a new BLOCK-level rule with no source, owner, or approval reference attached, when the registration is submitted, then it is rejected until those fields are populated.

**T6 — Quarantine escalation.** Given a quarantined offline conflict from Module 3 is not resolved within 72 hours, when the window elapses, then the Obligation automatically escalates (state change plus notification trigger raised for Module 11 to act on) rather than remaining silently open indefinitely.
