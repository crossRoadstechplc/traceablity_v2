# Module 12: UX & Role Workspaces
Master build prompt + acceptance tests. Cross-cutting — depends on Identity & Access (1) for role/capacity, and reads from every domain module it presents. Added after comparison against an independently produced specification; closes a gap the original 11-module set left implicit.

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the UX & Role Workspaces layer of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, escalate per `00_Technical_Scaffolding.md` Section 9 instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. This module presents data owned by other modules; it does not own business facts itself, and it must call each module's approved domain commands rather than writing to another module's derived state directly.

**Scope — build:**
- Visual register: institutional, restrained, information-dense, commodity/logistics interface. Not generic card-heavy consumer SaaS, not decorative AI styling, no gamified or celebratory metrics anywhere (this repeats Module 11's rule because it is enforced here, at the rendering layer).
- Transactional screens organized around the immediate physical action the user is there to do (dispatch, receipt, processing entry, stocktake), with progressive disclosure of deeper detail (full lineage, compliance history, documents) rather than surfacing everything at once.
- Role-specific workspaces per authorized capacity from Module 1: Farmer, Collector/Aggregator, Exporter, Importer, Warehouse/Processor, Transporter/Driver, Mapping/Verification Provider, Regulator, Platform Administrator — each sees only the minimum surface and workflow needed for their immediate task, with authorized drill-down available, never by default.
- Lot detail view: lineage, movements, processing, evidence, maps, anomalies, and compliance status shown through progressive disclosure, with every disclosure step re-checking authorization before rendering, never trusting a prior page load's permission state.
- Notification and dashboard surfaces (data supplied by Module 11): dashboards for situational awareness, notifications reserved for action-required items. Dashboards never depend on notification read-state to determine what to show.

**Scope — explicitly do not build in this module:**
- No business logic determining what data means (owned by Modules 1–11) — this module renders and calls, it does not decide.
- No independent permission engine — permission decisions come from Module 1, this module only enforces "the server said no" by not rendering, never by inventing its own rule about who sees what.

**Non-negotiable invariants — write these as automated tests:**
1. UI-layer hiding is never treated as authorization. Every rendered field is independently checked server-side (Module 1) before the UI decides to show it.
2. A user never sees more than their authorized capacity permits, regardless of which screen or drill-down path they take to get there.
3. No celebratory, gamified, or vanity metric appears anywhere (leaderboards, streaks, badges).
4. Progressive disclosure never hides a BLOCK or WARN-level issue — those surface immediately, only FLAG-level detail is deferred behind drill-down.

**Definition of Done:**
- Acceptance criteria below pass.
- Every workspace has been reviewed against its role's minimum-surface definition and contains nothing beyond it by default.
- Self-report per `00_Technical_Scaffolding.md` Section 8.

---

## ACCEPTANCE TESTS

**T1 — Role-scoped default surface.** Given a Transporter/Driver logs in, when their workspace loads, then it shows only movement/custody/handover actions relevant to their role, with no compliance, pricing, or unrelated-actor data visible by default.

**T2 — Progressive disclosure never hides a BLOCK.** Given a lot has an active BLOCK-level issue, when any user with visibility into that lot opens its detail view at any disclosure depth, then the BLOCK is immediately visible, not tucked behind a drill-down click.

**T3 — Server-side re-check on drill-down.** Given a user's permissions change mid-session (e.g. a delegation is revoked), when they attempt a previously available drill-down, then the server rejects it even though the UI had not yet refreshed to hide the option.

**T4 — No vanity metrics.** Given any dashboard or workspace is audited, when reviewed for content, then no streak, badge, leaderboard, or celebratory metric appears anywhere in the interface.

**T5 — Multi-capacity workspace switch.** Given an Actor holds both Exporter and Processor capacities, when the user switches capacity context, then the workspace reloads to that capacity's minimum surface, and no data from the other capacity's workspace persists visibly across the switch without an explicit authorized reason.
