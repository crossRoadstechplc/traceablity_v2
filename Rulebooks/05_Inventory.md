# Module 5 of 11: Inventory
Master build prompt + acceptance tests. Phase 3 — depends on Coffee Ledger (Module 2) and Processing (Module 4).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Inventory module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Assume Modules 1, 2, and 4 are available.

**Scope — build:**
- Theoretical StockBalance: a derived, read-only projection computed from committed Coffee Ledger and Processing events (and Movement custody where applicable) for a given facility/actor/coffee-state combination. Never directly editable through any API or UI path.
- Stocktake entity: an independent physical-count observation, separate from and never overwriting the theoretical StockBalance. Records facility, coffee state/lot scope, theoretical quantity at time of count, physical quantity counted, variance, date, observer, and explanation/evidence where variance is material.
- Reconciliation: variance between theoretical and physical stock is resolved only through new, attributable events (e.g. a Correction or Adjustment event referencing the Stocktake) — never by directly rewriting the StockBalance projection.
- Recompute capability: the system must be able to rebuild a StockBalance for any facility/lot/actor from a defined ledger checkpoint, proving the projection is genuinely derived rather than independently stored truth.
- Annual stock count support: scheduling and recording of the periodic stock count required for supply and export processing/warehousing industries under Ethiopian regulation (exact schedule/forms remain Pending Regulatory Verification — build the scheduling as configurable, not hardcoded to an assumed cadence).

**Scope — explicitly do not build in this module:**
- No compliance status evaluation (Module 8).
- No processing arithmetic (Module 4 already emits the events this module derives from).

**Non-negotiable invariants — write these as automated tests:**
1. The theoretical StockBalance is never directly writable. Every write path other than event-sourcing from the ledger must be rejected.
2. A Stocktake is always preserved as its own record; it never overwrites or replaces the theoretical balance.
3. The system can reproduce an identical StockBalance for a past point in time by replaying events up to that checkpoint.
4. Repeated or material stock variances are surfaced as anomaly signals (FLAG/WARN) but never auto-classified as a confirmed breach.

**Definition of Done:**
- Acceptance criteria below pass.
- StockBalance recomputation is verifiably deterministic (same events in, same balance out, every time).
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — StockBalance is not directly writable.** Given any API client attempts to POST/PATCH a StockBalance record directly, when the request is received, then it is rejected regardless of caller permissions — the only way to change a balance is through new ledger events.

**T2 — Stocktake preserves both figures.** Given the theoretical balance for a facility is 5,000 kg and a physical count records 4,850 kg, when the Stocktake is submitted, then both the 5,000 kg theoretical figure at time of count and the 4,850 kg physical figure remain permanently visible, with a 150 kg variance computed and flagged.

**T3 — Reconciliation is additive.** Given a material stock variance from T2, when it is reconciled, then the reconciliation appears as a new attributable Adjustment event referencing the original Stocktake, and the original theoretical projection's underlying events remain unmodified.

**T4 — Recomputation is deterministic.** Given a facility's full event history, when the StockBalance is computed twice independently from that same event set, then both computations produce an identical result.

**T5 — Variance does not become breach.** Given three consecutive stocktakes at one facility all show variances outside the reference range, when the pattern is surfaced, then it is presented as a flagged anomaly pattern for investigation, and the system does not itself label it a confirmed breach or theft.

**T6 — Facility/coffee-state scoping.** Given a facility holds both Washed and Natural coffee states in separate lots, when the StockBalance is queried, then it returns balances scoped correctly by coffee state, not a single merged total that hides state composition.
