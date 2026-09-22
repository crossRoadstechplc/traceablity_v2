# Module 2 of 11: Coffee Ledger
Master build prompt + acceptance tests. Phase 2 — depends on Identity & Access (Module 1) and Farm & Geospatial (Module 6) for origin references.

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Coffee Ledger module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Use its event record and identity conventions without modification. Assume Module 1 (Identity & Access) is available for actor/capacity references.

**Scope — build:**
- Lot entity: represents a physical quantity of coffee with an immutable UID, current coffee state (red cherry, dried cherry, parchment, washed, semi-washed, natural, supply, export, by-product, domestic-consumption — do not collapse these into one generic "coffee" value), crop year, and current lifecycle state (Active, Fully Consumed, Exported, Destroyed, Other Terminal Disposition).
- LineageEdge entity: directed acyclic parent-child relationship between Lots. Supports three creation primitives only: Split (one parent, multiple children), Aggregate (multiple parents, one child), Process (one or more parents, one or more output children — Processing module owns the transformation logic, this module owns the resulting lineage edges).
- Movement does NOT create a new lot or a new lineage edge. Movement is owned entirely by Module 3.
- Origin/Create event: establishes the first digital record of a Lot, distinguishing Origin (farmer/farm/farm unit), Created By (the actor who made the first record, which may be a downstream actor), Basis, and Farmer Confirmation Status.
- Quantity tracking: canonical unit is kilograms; original entered unit and conversion basis are stored alongside, never discarded.

**Scope — explicitly do not build in this module:**
- No dispatch/receipt/transport logic (Module 3).
- No mass-balance/yield/loss logic beyond storing the lineage edges Processing produces (Module 4 owns the arithmetic).
- No compliance evaluation.

**Non-negotiable invariants — write these as automated tests:**
1. Lineage is a strict DAG. Any attempt to create a cycle is rejected at the persistence layer, not just the application layer.
2. A physical quantity cannot be consumed or disposed beyond its available uncommitted quantity — no lot can be "spent" twice across split/aggregate/process operations.
3. Aggregation preserves all contributing parent lots permanently and their exact contribution quantities; it never destroys origin granularity.
4. A split of a mixed lot inherits the parent's proportional provenance by default. Physical segregation by origin must be evidenced, not assumed, before a split can claim single-origin provenance.
5. Crop year composition persists through descendants; aggregation across crop years is never relabeled to the newest year.
6. Lots are never hard-deleted. Terminal states are explicit and attributable events, not row deletions.
7. Coffee state is a first-class attribute on every Lot at every point in its lifecycle, never inferred from context.

**Definition of Done:**
- Acceptance criteria below pass.
- Recursive lineage queries (trace a Lot back to origin farms, or forward to all descendants) are supported and performant at expected data volumes.
- Every Coffee Ledger event uses the canonical event record.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — No circular lineage.** Given Lot A is a parent of Lot B, when an attempt is made to record Lot B as a parent of Lot A, then the system rejects the operation at the data layer.

**T2 — Aggregation preserves origin granularity.** Given ten farmer lots aggregated into Lot X with recorded contribution quantities, when Lot X is later split into X1 and X2 with no evidence of physical segregation by origin, then X1 and X2 both inherit the same proportional provenance composition as X, and a user cannot manually reassign preferred farmers to either child.

**T3 — Double-spend prevention.** Given Lot A has 1,000 kg available and 600 kg has already been allocated to a split, when a second operation attempts to allocate 500 kg from Lot A, then the system rejects it (only 400 kg remains available).

**T4 — Crop year composition.** Given Lot A (2024 crop) and Lot B (2025 crop) are aggregated into Lot C, when Lot C's crop-year composition is queried, then it shows the proportional mix of both years, and Lot C is never displayed as simply "2025 crop."

**T5 — Origin distinguishes subject from source.** Given a Collector creates the first digital record for coffee actually grown by an unregistered Farmer, when the record is queried, then it shows Origin = Farmer/Farm, Created By = Collector, and Farmer Confirmation Status = Declared/Unverified, without conflating the Collector as the origin.

**T6 — Coffee state is never generic.** Given a Lot moves from Red Cherry to Washed Coffee through a processing event, when the Lot's state history is queried, then both states are recorded distinctly and neither is ever represented as a generic "coffee" value.

**T7 — Terminal state is additive, not deletion.** Given a Lot reaches Fully Consumed state, when the Lot is queried afterward, then the record still exists, is queryable, and shows an explicit, attributable Terminal Disposition event rather than having been removed from the system.

**T8 — Unit preservation.** Given a farmer enters a quantity in frassula, when the Lot is queried, then both the original frassula value and the canonical kilogram conversion are visible, with the conversion basis/version identified.
