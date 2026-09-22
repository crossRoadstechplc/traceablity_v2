# Module 11 of 11: Notifications
Master build prompt + acceptance tests. Phase 5 — thin layer over Issues & Obligations (9) and all upstream modules. Final module in the build sequence.

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Notifications module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Assume Module 9 (Issues & Obligations) and Module 1 (Identity & Access) are available. This is the final module in the build sequence — it consumes events and Issues/Obligations raised by every other module rather than owning new business facts of its own.

**Scope — build:**
- Notification entity: an action-oriented alert, generated only from a defined trigger list (required receipt, serious discrepancy, failed/conflicting transaction, approaching credential/evidence deadline, invalidated evidence, action requiring approval, escalated quarantine/obligation from Module 9). Routine successful completions do not generate notifications.
- DeliveryPreference entity: per-User channel and frequency preferences (in-app, SMS, email where applicable), scoped by notification category.
- Dashboard data feed: a separate, non-notification read path that surfaces situational-awareness data (overdue receipts, unresolved discrepancies, expiring credentials, incomplete evidence, pending approvals, failed sync/conflicts) for the requesting user's role, distinct from the push-notification path.
- Escalation trigger consumption: this module listens for escalation events raised by Module 9 (e.g. the 72-hour quarantine escalation) and turns them into actual delivered notifications to the correct accountable actor.

**Scope — explicitly do not build in this module:**
- No business logic determining what counts as an anomaly, discrepancy, or obligation (Modules 2 through 9 own that; this module only reacts to what they raise).
- No new permission/authority logic (Module 1 already determines who can see what; this module respects those boundaries when routing notifications and dashboard data).

**Non-negotiable invariants — write these as automated tests:**
1. A notification is only generated for triggers on the defined action-oriented list; success/routine-completion events never generate a push notification.
2. Dashboard data and notifications are two distinct paths — dashboard is pull/situational, notifications are push/action-required. Neither substitutes for the other.
3. A notification is never sent to a user outside that user's authorized visibility scope for the underlying object (e.g. an importer is never notified about an unrelated exporter's internal discrepancy).
4. No gamified or celebratory metrics anywhere in the dashboard or notification surface.

**Definition of Done:**
- Acceptance criteria below pass.
- Every notification traces back to the specific Issue, Obligation, or event that triggered it.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Only action-worthy triggers notify.** Given a routine, successful receipt with no discrepancy is recorded, when the event completes, then no notification is generated; it appears only in dashboard/history.

**T2 — Approaching deadline notifies correctly.** Given a Credential is due to expire in 7 days, when the configured lead-time threshold is reached, then a notification is generated to the accountable actor, referencing the specific Credential.

**T3 — Dashboard and notification are separate paths.** Given a user has three overdue receipts, when they open the dashboard, then all three are visible as situational data regardless of whether notifications were sent or read, confirming the dashboard does not depend on notification state.

**T4 — Visibility scope respected.** Given an Importer has purchased one lot from an Exporter, when a discrepancy occurs on a different, unrelated shipment between that Exporter and another buyer, then the Importer receives no notification about it.

**T5 — Escalation reaches the right actor.** Given a quarantined conflict from Module 9 escalates after 72 hours, when the escalation event fires, then a notification is delivered to the actor now accountable post-escalation, not the original pre-escalation actor if they differ.

**T6 — No vanity metrics.** Given the dashboard is reviewed for content, when notification/dashboard surfaces are audited, then no celebratory, gamified, or vanity metric (e.g. "streak," badge, leaderboard) appears anywhere.
