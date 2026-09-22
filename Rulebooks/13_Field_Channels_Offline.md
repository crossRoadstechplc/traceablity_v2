# Module 13: Field Channels — Offline Mobile, Assisted Entry & USSD
Master build prompt + acceptance tests. Cross-cutting — depends on Identity & Access (1) and Movement & Custody (3); implements the offline/low-connectivity/low-literacy interaction layer referenced but not built out by earlier modules.

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Field Channels layer of Ankuaru: the actual offline mobile app, assisted-entry pattern, and USSD interface used in the field. Follow this prompt exactly. Where anything is ambiguous, escalate per `00_Technical_Scaffolding.md` Section 9 instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`, especially Section 2's offline fields (`event_time_actual`, `event_time_recorded`, `server_commit_time`, `source_channel`, `retrospective_flag`). This module is the channel/interaction layer; the business logic for what an event means still lives in the owning domain module (Movement, Processing, etc.) — this module captures and queues events, it does not interpret them.

**Scope — build:**
- Offline-capable mobile app: dispatch, receipt, and processing entry fully usable with no connectivity, generating `event_id` client-side, queuing locally, and syncing when connectivity returns, using the canonical event record without modification.
- USSD interface: a basic-phone channel for the subset of transactions that can be represented as a short structured menu (e.g. confirm receipt, report a simple dispatch), for actors without smartphone access.
- Assisted entry: a pattern where one identified, authorized individual enters data on behalf of another actor (e.g. a literate collector entering on behalf of a farmer), with both the entering user and the actor-on-whose-behalf recorded distinctly on every such event — never collapsed into a single attribution.
- Local-language support and low-literacy interaction patterns: recognition/confirmation over free text entry where possible, simple numeric entry, icon/image-assisted flows for critical fields.
- Sync reconciliation UX: when a device syncs, conflicts (per Module 3's quarantine rule) and rejected/duplicate events are surfaced clearly to the field user, not silently dropped.

**Scope — explicitly do not build in this module:**
- No movement/processing business rules (Modules 3 and 4 own those) — this module only captures and transmits events in the correct format.
- No permission logic beyond what channel a given credential level is allowed to use (Module 1 owns capacity/authorization itself).

**Non-negotiable invariants — write these as automated tests:**
1. An offline-captured event's `event_time_actual` is set at the moment of capture, in the field, never backfilled to sync time.
2. Assisted entry always records two distinct identities: the individual who physically entered the data, and the actor on whose behalf it was entered. Neither is ever inferred from the other.
3. A sync conflict or rejection is surfaced to the field user, never silently discarded.
4. USSD-originated events carry the same canonical event record as app-originated events — no reduced or divergent schema for the "lite" channel.
5. Loss of connectivity mid-session never loses already-captured local data; the app must persist locally before attempting any network call.

**Definition of Done:**
- Acceptance criteria below pass.
- The offline app has been tested through an actual airplane-mode capture-then-sync cycle, not just simulated.
- Self-report per `00_Technical_Scaffolding.md` Section 8.

---

## ACCEPTANCE TESTS

**T1 — Full offline capture cycle.** Given a device has no connectivity, when a user records a Receipt event through the mobile app, then it is captured, locally persisted, and queued with a client-generated event_id and the actual capture-time timestamp.

**T2 — Sync preserves actual event time.** Given the queued event from T1 syncs six hours later, when it is committed server-side, then event_time_actual still reflects the original field-capture moment, not the sync moment, and server_commit_time is recorded separately.

**T3 — Assisted entry dual attribution.** Given a literate Collector enters a dispatch on behalf of an illiterate Farmer, when the event is recorded, then both the Collector's identity (as data enterer) and the Farmer's identity (as the acting actor) are separately recorded and independently queryable.

**T4 — USSD schema parity.** Given a Receipt is confirmed via USSD on a basic phone, when the resulting event is queried through the same API used for app-originated events, then it has the identical canonical event record structure, no missing or divergent fields.

**T5 — Conflict surfaced, not dropped.** Given two offline devices captured conflicting dispositions on the same quantity (per Module 3's quarantine rule) and both sync, when the second device finishes syncing, then that device's user sees an explicit conflict notice, not a silent success message.

**T6 — Local persistence before network attempt.** Given a user fills in a processing-entry form and the app crashes or loses power immediately after submission with no connectivity, when the device restarts, then the entered data is recovered from local storage rather than lost.
