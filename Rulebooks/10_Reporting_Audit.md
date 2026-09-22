# Module 10 of 11: Reporting & Audit
Master build prompt + acceptance tests. Phase 5 — depends on Compliance (8), Evidence (7), and all ledger modules (2, 3, 4, 5).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Reporting & Audit module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Assume Modules 1 through 8 are available.

**Scope — build:**
- Report entity: a generated snapshot, immutable at the moment of generation, capturing lineage, farms, geospatial evidence, movements, processing, mass balance, actors/facilities, verification, documents, and framework-specific findings relevant to a Lot or shipment, with a unique Report ID and a cryptographic fingerprint proving later non-alteration.
- AuditPackage entity: a complete evidence pack assembled from a Report plus supporting source documents, explicitly distinguishing Established Evidence, Missing Evidence, Pending Verification, Exceptions, and Not Applicable — an incomplete package is allowed to be generated but must never obscure what's missing.
- Submission-linked freezing: when a Report is used in a formal Submission (Module 8 owns the Submission act itself), this module ensures the Report's payload at that moment is frozen and permanently retrievable exactly as submitted, independent of any later changes to underlying data.
- Supersession handling: if underlying data materially changes after a Report was issued, the original Report is preserved and flagged Superseded or Review Required; a new Report receives a new Report ID and version, it never overwrites the old one.
- Tamper-evidence: implement cryptographic linking (hash chaining or equivalent) across committed events sufficient to detect later alteration, deletion, or insertion, with independent integrity checkpoints stored separately from the primary operational database so that even a privileged administrator cannot invisibly rewrite history without detection.
- Regulator access logging: every regulator access to records (inspection, trace, evidence, stock) is itself logged — official identity, data accessed, time, stated authority/purpose, and action taken — as a first-class auditable record, and this access is never paywalled or blocked by commercial-confidentiality rules within the regulator's lawful scope.
- Recovery verification: after any restoration/recovery event, the system verifies committed-event presence, sequence/relationships, duplication, lot quantities, lineage, and audit records, and any unresolved uncertainty becomes an explicit Recovery Exception rather than being silently assumed fine.

**Scope — explicitly do not build in this module:**
- No compliance requirement logic (Module 8 — this module packages and freezes what Module 8 determined, it does not determine compliance itself).
- No UI beyond what's needed to generate, view, and export a Report/AuditPackage.

**Non-negotiable invariants — write these as automated tests:**
1. A generated Report's fingerprinted payload never changes after generation, regardless of what happens to underlying data afterward.
2. A Report that becomes Superseded is never deleted — both old and new remain queryable with their relationship explicit.
3. Tamper-evidence must make any post-hoc alteration of a committed event cryptographically detectable, including by an administrator with full database access.
4. Every regulator access is logged with identity, data, time, purpose, and action — with no exception for "routine" access.
5. Recovery never silently resolves uncertainty; unresolved states after restoration become explicit Recovery Exceptions.

**Definition of Done:**
- Acceptance criteria below pass.
- Fingerprint verification is independently checkable by a party holding only the Report and its stated fingerprint, without needing direct database access.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Frozen snapshot.** Given a Report is generated for a shipment on 1 May, when underlying lineage data changes on 1 June, then the 1 May Report's content and fingerprint are byte-for-byte identical to what they were at generation, verifiable by recomputing the fingerprint.

**T2 — Supersession preserves both.** Given a Report becomes Superseded after a material upstream correction, when the Report history is queried, then both the original (marked Superseded) and the new version (with a new Report ID) are independently retrievable, with an explicit link between them.

**T3 — Tamper-evidence detects admin alteration.** Given a database administrator directly modifies a committed event's payload at the storage layer, when the tamper-evidence check runs, then the alteration is detected via a hash-chain mismatch, even though the administrator had full database access.

**T4 — Incomplete package is honest, not hidden.** Given an AuditPackage is generated for a shipment with two missing evidence items, when it is generated, then it clearly lists those two items under Missing Evidence rather than omitting them or silently marking the package complete.

**T5 — Regulator access is logged and unblocked.** Given a Regulator with lawful inspection authority requests trace data on a shipment, when the request is served, then it is not paywalled or blocked by commercial-confidentiality restrictions within their lawful scope, and the access itself is recorded with official identity, data accessed, time, and stated purpose.

**T6 — Recovery exception, not silent assumption.** Given a system restoration leaves ambiguous sequencing for a small number of events, when the recovery verification runs, then those events are flagged as an explicit Recovery Exception requiring review, rather than being auto-resolved in either direction.
