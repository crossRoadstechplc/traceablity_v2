# Module 15: Data, Analytics & AI Governance
Master build prompt + acceptance tests. Cross-cutting — reads from all domain modules; governs how derived intelligence is produced and constrained, per Rulebook 5.

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Data, Analytics & AI Governance layer of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, escalate per `00_Technical_Scaffolding.md` Section 9 instead of guessing. This module governs how the platform is allowed to reason about its own data — it does not itself own any business fact.

**Read first:** `00_Technical_Scaffolding.md`. Assume all domain modules are available as read sources.

**Scope — build:**
- Fact classification: every data point surfaced anywhere is tagged as one of Recorded Fact (directly observed and committed), Derived Fact (computed deterministically from Recorded Facts), Assessment (a judgment against a reference range or rule, carrying an authority tag), or Inference (a model-produced estimate). These four categories are never visually or structurally merged into one undifferentiated "data" presentation.
- Reproducibility: every Derived Fact and Assessment is reproducible from its source facts plus the exact formula/rule/model version used, and that lineage is queryable, not just the final number.
- Missing-value handling: a field with no data is represented as explicitly missing, never coerced to zero, and Not Applicable, Pending Verification, and Estimated are distinct, visible states, never collapsed into a blank.
- Model/AI governance registry: any model or AI component used for analytics or decision support is registered with purpose, owner, training data description, features used, version, known performance characteristics, known limitations, approved deployment scope, monitoring plan, and a retirement/decommission path.
- Hard prohibition enforcement: this module is where the platform-wide prohibition on AI action is technically enforced, not just documented — no model or AI component may create or alter a rule, certify compliance, establish a legal/regulatory breach, silently reconcile conflicting evidence, or write to any canonical record. AI output in this system is advisory/derived only, always tagged as Inference, and always downstream of, never a substitute for, an authorized human or rule-based determination.
- No hidden scoring: the platform does not compute or expose an overall trust score, fraud score, compliance score, or actor reputation score unless an authoritative framework explicitly defines and requires exactly that score. A model may produce an internal risk signal for prioritization, but it is never presented to users as an authoritative rating.

**Scope — explicitly do not build in this module:**
- No compliance-framework-specific scoring logic (Module 8 owns official framework-defined scores, where a framework defines one).
- No new business rules of any kind — this module constrains how existing facts are computed, displayed, and reasoned about; it invents nothing.

**Non-negotiable invariants — write these as automated tests:**
1. Recorded Fact, Derived Fact, Assessment, and Inference are always distinguishable in both data structure and presentation — never merged.
2. Every Derived Fact and Assessment carries enough version/formula metadata to be exactly reproduced later.
3. Missing is never displayed or computed as zero.
4. No AI/model component can write to a canonical record, create a rule, or establish a breach determination, verified by testing that the write path itself rejects such an attempt regardless of what the model outputs.
5. No overall trust/fraud/compliance/reputation score exists anywhere in the system unless a specific authoritative framework requires it, in which case only that framework's defined score is used, exactly as defined.

**Definition of Done:**
- Acceptance criteria below pass.
- Every deployed model has a complete governance registry entry before it is enabled in production.
- Self-report per `00_Technical_Scaffolding.md` Section 8.

---

## ACCEPTANCE TESTS

**T1 — Four categories stay distinguishable.** Given a lot's detail view shows a recorded weight, a computed yield percentage, a moisture-range assessment, and a model-predicted risk flag, when the view is queried, then all four are tagged with their correct category and none is presented as if it were another.

**T2 — Derived fact reproducibility.** Given a Derived Fact was computed six months ago using formula version 2.1, when it is recomputed today from the same source facts and formula version 2.1, then the result is identical.

**T3 — Missing is not zero.** Given a lot has no moisture reading recorded, when its data is queried, then the moisture field returns an explicit "missing" state, not 0%, and downstream calculations that depend on it are themselves flagged incomplete rather than silently computing with a zero.

**T4 — AI cannot write canonical records.** Given a model component attempts to directly write a status change to a canonical record (e.g. mark a compliance requirement Satisfied) bypassing the authorized human/rule-based path, when the write is attempted, then it is rejected at the data layer regardless of the model's confidence or output.

**T5 — No hidden overall score.** Given the platform's full UI and API surface is audited, when searched for any overall trust, fraud, compliance percentage, or actor reputation score not explicitly defined by a named framework, then none is found.

**T6 — Model governance registry completeness.** Given a new risk-prediction model is proposed for production deployment, when its registry entry is reviewed, then it has purpose, owner, training data description, version, known limitations, and a monitoring plan recorded, and the model cannot be enabled in production without all of these present.
