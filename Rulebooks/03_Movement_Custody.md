# Module 3 of 11: Movement & Custody
Master build prompt + acceptance tests. Phase 3 — depends on Coffee Ledger (Module 2) and Identity & Access (Module 1).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Movement & Custody module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Use its event record and identity conventions without modification. Assume Modules 1 and 2 are available.

**Scope — build:**
- Movement entity: links exactly one Dispatch Event and one Receipt Event via a shared Movement ID. Movement does not create or alter a Lot or lineage edge — it only changes location/custody.
- Dispatch Event: sender's independent observation of what left (lot, quantity, time, location, dispatching actor/capacity).
- Receipt Event: receiver's independent observation of what physically arrived (lot, quantity, time, location, receiving actor/capacity). Physical receipt is the decisive fact for custody transfer.
- Movement state machine: In Transit (dispatched, not yet received), Received (receipt confirmed), Receipt Overdue (expected window elapsed with no receipt), Exception (unresolved custody conflict).
- Ownership Transfer as a distinct event type, independent of Movement — dispatch/receipt changes custody and location only, never ownership, unless a separate Ownership Transfer event is also recorded.
- Offline capture: Dispatch and Receipt must both be capturable offline with a locally generated event_id, syncing later per the scaffolding doc's offline fields.
- Quantity discrepancy handling: when dispatch and receipt quantities differ, compute the variance and compare to the applicable reference range (authority-tagged per scaffolding doc Section 5); do not resolve the discrepancy by overwriting either observation.
- Quarantine and default ownership: when two offline devices produce conflicting dispositions over the same quantity, preserve both, mark the conflict Quarantined, and assign default resolution ownership to the accountable actor on the receiving/downstream side, with a 72-hour window before escalation.
- Vehicle and Driver entities, linked to Movement, with driver/vehicle competence represented as a structured credential reference (not free text) where required — leave the actual requirement matrix data-driven and unconfigured for now, same pattern as Module 1's credential handling.
- Coffee Transport Pass ("Shinto") entity (REG-D05-04, Directive 05/2013 Art. 7): a required movement permit linked one-to-one with a Dispatch Event, recording weight, volume, grade, and lot before dispatch. Records vehicle seal status at origin, and at the receiving Authority dispatch station records seal-integrity verification and net cargo weight (weighbridge or origin record) before re-sealing for onward transit. This is now a concrete required form, not a configurable placeholder.
- Contract sub-entity (REG-D05-01, REG-D05-02, Directive 05/2013 Art. 2(12), 4-5): for Direct Linkage transactions specifically, a Contract record linked to the eventual Dispatch, capturing both parties' identity, coffee type/quantity/grade, price (must fall within the Authority's daily Maximum/Minimum formula plus up to 5% premium, REG-D05-06), execution period, payment terms, delivery/inspection site, transport cost allocation, and a registration reference to the Documents Authentication and Registration Agency. Both Supplier and Exporter must hold a valid, renewed Certificate of Competency (checked against Module 1) before a Contract can be registered. This model applies only to Direct Linkage; ECX and Transaction Center pathways do not use it.
- Payment-settlement obligation (REG-D05-03, Directive 05/2013 Art. 6): on Receipt confirmation for a Direct Linkage Contract, this module raises a payment obligation to Issues & Obligations (Module 9) with the applicable deadline (3 working days from dispatch-station delivery, or same-day if graded at an Authority branch). This module raises and tracks the obligation trigger and deadline only; it does not process payment itself.

**Scope — explicitly do not build in this module:**
- No processing/transformation logic (Module 4).
- No compliance evaluation of movement evidence (Module 8) — this module only records and exposes the raw movement facts.

**Non-negotiable invariants — write these as automated tests:**
1. Ownership, custody, and location are three independent fields on every Lot's current state. This module may write custody and location; it must never write ownership.
2. The system never invents a Receipt. If no receipt event exists, the Lot remains In Transit or becomes Receipt Overdue — it is never assumed received.
3. Dispatch and Receipt observations are both permanently preserved even when they disagree; neither is overwritten to force agreement.
4. Offline disposition authority over a given quantity is exclusive to one device at a time; if conflicting dispositions arrive anyway, both are preserved and the conflict is quarantined, never silently resolved by picking one.
5. A Return is a new Movement, never an edit that reverses a prior Movement's history.
6. Every reference range used for discrepancy flagging carries an authority tag; a benchmark is never enforced as if it were a legal threshold.
7. A Direct Linkage Contract's price must fall within the Authority's current Maximum/Minimum formula plus up to 5% premium (REG-D05-06); a Contract outside that band is rejected at registration.
8. Payment-settlement deadlines are raised as Obligations, never enforced as a payment-processing action within this module.

**Definition of Done:**
- Acceptance criteria below pass.
- Offline dispatch and receipt both fully functional without connectivity, syncing correctly afterward with actual event time preserved separately from sync time.
- Every Movement & Custody event uses the canonical event record.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Independent observations preserved on disagreement.** Given a sender dispatches 1,000 kg and a receiver records 985 kg received, when the movement is queried, then both the 1,000 kg dispatch and 985 kg receipt remain visible as separate observations, a variance of 15 kg is computed and compared against the applicable reference range, and custody transfers to the receiver because physical receipt occurred.

**T2 — Receipt is never invented.** Given a dispatch occurs and the expected receipt window elapses with no receipt event recorded, when the Movement is queried, then its state is Receipt Overdue, not Received, and no receipt record exists.

**T3 — Custody without ownership.** Given a Lot is dispatched and received by a warehouse acting purely as a custodian, when the Lot's ownership, custody, and location are queried separately, then custody and location reflect the warehouse, while ownership remains unchanged and is never inferred to have transferred.

**T4 — Offline conflict quarantine.** Given two offline devices each record a disposition against the same 500 kg quantity without prior allocation, when both sync, then neither disposition silently wins, both are preserved, the conflict is marked Quarantined, and it is assigned to the receiving-side actor with a visible 72-hour resolution deadline.

**T5 — Return is additive.** Given a Lot was received and the receiver later returns it to the sender, when the return is recorded, then it creates a new Movement (new Movement ID, new Dispatch/Receipt pair) and the original Movement's history is untouched.

**T6 — Offline dispatch and sync-time separation.** Given a dispatch is recorded offline at 09:00 local time but does not sync until 14:00, when the event is queried after sync, then the event_time_actual shows 09:00 and server_commit_time shows the sync time, and the event is flagged as offline-captured.

**T7 — Vehicle/driver credential is data-driven.** Given the driver-competence requirement matrix is unconfigured, when a dispatch is recorded with a driver who has no credential on file, then the dispatch is not blocked by an invented credential rule.

**T8 — Shinto fields required at dispatch.** Given a Dispatch Event is created for a Movement requiring a Transport Pass, when the Dispatch is submitted without weight, volume, grade, and lot recorded on the Shinto, then it is rejected as incomplete.

**T9 — Contract price band enforced.** Given the Authority's current Maximum price is 200 ETB/kg and Minimum is 170 ETB/kg, when a Direct Linkage Contract is registered at 215 ETB/kg (exceeding Maximum plus 5% premium), then registration is rejected.

**T10 — Payment obligation raised on receipt.** Given a Direct Linkage Contract's coffee is received at a dispatch station with quality graded on the spot, when Receipt is confirmed, then a same-day payment Obligation is raised to Module 9 naming the Exporter as accountable actor.
