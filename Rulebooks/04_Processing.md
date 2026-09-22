# Module 4 of 11: Processing
Master build prompt + acceptance tests. Phase 3 — parallel with Movement & Custody, depends on Coffee Ledger (Module 2).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Processing module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Assume Modules 1 and 2 are available. This module produces the lineage edges that Module 2's Lot/LineageEdge entities store — Processing owns the transformation arithmetic, Coffee Ledger owns the resulting graph structure.

**Scope — build:**
- ProcessingEvent entity: links input Lot(s), a Facility UID, process type, operator (actor/capacity), time, output Lot(s), by-products/rejects, and genuine loss, as one atomic event.
- Facility capability check: a ProcessingEvent may only be recorded against a Facility whose declared capabilities include the process type, and whose required credential (where legally required) is currently valid. A process is BLOCKED only where the facility is clearly not legally/structurally authorized — not for unusual yield or timing.
- Mass-balance engine: enforce input quantity = usable outputs + by-products/rejects + genuine loss, within an explicitly configurable precision/tolerance. Loss is a required, explicitly entered categorized value — it must never be silently calculated as whatever makes the arithmetic close.
- Reference-range evaluation: expected yield, moisture change, reject/loss percentages are compared against contextual reference ranges (authority-tagged per scaffolding doc) after arithmetic closure is confirmed, producing a FLAG or WARN, never a BLOCK, unless a rule explicitly makes the threshold mandatory.
- By-product/reject tracking: outputs other than the primary usable product are separately identified entities with their own disposition tracking, never folded into "loss."
- Moisture content BLOCK (REG-D02-02, Directive 02/2012 Art. 4(1)): supply and export coffee must be strictly 10.0%-12.5% moisture. This is tagged LEGAL_REQUIREMENT and is the one moisture case in this module that may BLOCK rather than FLAG, since the directive makes it a mandatory threshold, not a benchmark.
- Blending permit check (REG-D02-03, Directive 02/2012 Art. 4(3)): a ProcessingEvent that would mix different coffee types, origins, or crop years is BLOCKED unless an authorized blending permit reference is attached to the event.

**Scope — explicitly do not build in this module:**
- No facility registry/credential issuance UI (Module 1 owns credentials; this module only checks them).
- No inventory/stock-balance logic (Module 5) — this module emits events that Module 5 consumes.

**Non-negotiable invariants — write these as automated tests:**
1. Mass balance must close exactly within configured tolerance on every ProcessingEvent. A ProcessingEvent that does not balance is rejected, not silently accepted with a bad loss value.
2. Loss is never an automatic plug/remainder calculated to force closure — it is a distinct entered value, validated against the balance equation, not derived from it.
3. Arithmetic validity (does it balance) and operational plausibility (is the yield/loss within expected range) are evaluated as two separate checks. A structurally valid but unusual result is flagged, never blocked.
4. Output lots inherit provenance from input lots strictly according to the transformation and quantity relationships recorded, with no manual override of computed contribution.
5. A ProcessingEvent is blocked only for clear facility non-authorization, a moisture reading outside 10.0%-12.5% (REG-D02-02), or an unauthorized type/origin/crop-year mix (REG-D02-03) — never for an unusual-but-arithmetically-valid yield.

**Definition of Done:**
- Acceptance criteria below pass.
- Every ProcessingEvent uses the canonical event record and is atomic (input consumption, output creation, and by-product/loss recording happen as one transaction).
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Mass balance closes.** Given 10,000 kg of input coffee is processed producing 8,200 kg usable output, 900 kg by-product, and 900 kg entered as genuine loss, when the ProcessingEvent is submitted, then it is accepted because 8,200 + 900 + 900 = 10,000.

**T2 — Mass balance rejects mismatch.** Given the same inputs but only 700 kg entered as loss (8,200 + 900 + 700 = 9,800, a 200 kg shortfall against the 10,000 kg input), when the ProcessingEvent is submitted, then it is rejected as unbalanced, not auto-corrected by inflating the loss figure.

**T3 — Loss is not a silent plug.** Given a user submits a ProcessingEvent without entering a loss value at all, when the system processes it, then it does not calculate and insert a loss value automatically — loss entry is required input, not derived output.

**T4 — Facility authorization blocks correctly.** Given a Facility has no declared Wet Milling capability, when a Wet Milling ProcessingEvent is attempted at that facility, then it is blocked with a clear reason, distinct from any yield-related flag.

**T5 — Unusual yield is flagged, not blocked.** Given a processing run yields 60% usable output against an expected reference range of 75-85%, when the ProcessingEvent is submitted with a balanced arithmetic result, then it is accepted and recorded, with a FLAG raised referencing the applicable reference range and its authority tag, and it is not blocked.

**T6 — By-products are not hidden in loss.** Given a processing run produces identifiable husk and defective-bean by-products, when the ProcessingEvent is recorded, then husk and defective beans appear as separately tracked by-product quantities, not merged into the loss figure.

**T7 — Output provenance inheritance.** Given a ProcessingEvent transforms two input lots (60% Lot A, 40% Lot B by contribution) into one output lot, when the output lot's provenance is queried, then it shows the 60/40 composition automatically computed from the transformation, with no field allowing manual override of that computed split.

**T8 — Moisture threshold blocks correctly.** Given a batch tests at 13.2% moisture, when the ProcessingEvent is submitted for supply/export coffee, then it is BLOCKED citing REG-D02-02, distinct from any reference-range FLAG.

**T9 — Blending requires a permit.** Given a processor attempts to mix a 2024-crop lot with a 2025-crop lot with no blending permit reference attached, when the ProcessingEvent is submitted, then it is BLOCKED citing REG-D02-03; when a valid permit reference is attached, then it is accepted.
