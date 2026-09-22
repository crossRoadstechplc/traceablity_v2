# Module 14: APIs & Integrations
Master build prompt + acceptance tests. Cross-cutting — depends on all domain modules it exposes; formalizes external-facing contracts implied but not specified elsewhere.

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the APIs & Integrations layer of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, escalate per `00_Technical_Scaffolding.md` Section 9 instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. This module does not own business logic; it exposes the domain modules' approved commands to external systems under the same rules that govern human channels.

**Scope — build:**
- External API surface: every domain command available to human users through the UX layer (Module 12) is available to authorized external integrations through the same underlying command, the same permission checks, the same validation, and the same audit trail. No separate, looser "integration path" that bypasses what a human user would have to go through.
- External data ingestion: where an external system feeds data into Ankuaru (e.g. an ERP, a certification body's platform, a government system), incoming data is treated as a claim with its own provenance and confidence level, never silently overwriting canonical facts already recorded. Conflicts between external data and existing Ankuaru facts are surfaced, not auto-resolved in favor of whichever arrived first or last.
- Formal external submission channel: the mechanism Module 8 (Compliance) uses to submit a package to an external framework's system, including capturing that system's acknowledgement/reference and any subsequent rejection (per Module 8's resolved post-rejection rule).
- API versioning: contracts are versioned explicitly; a breaking change requires a new version, old versions continue serving until formally deprecated per the release process (Rulebook 6), never silently retired.
- Rate limiting, authentication, and API key/credential management for external integrators, tied to the same Identity & Access model as human users (Module 1) — an integration is an Actor/Capacity like any other, not a special bypass.

**Scope — explicitly do not build in this module:**
- No new business rules — every rule enforced here already exists in the owning domain module; this module is a faithful, unshortened exposure of it.
- No compliance framework-specific logic (Module 8 owns what gets submitted and when; this module owns how the submission mechanics work).

**Non-negotiable invariants — write these as automated tests:**
1. An external API call is subject to the identical authorization, validation, and audit rules as the equivalent human-channel action. There is no "trusted integration" shortcut.
2. Externally sourced data never silently overwrites an existing canonical fact. A conflict is recorded and surfaced, never auto-resolved by arrival order.
3. A deprecated API version continues to function until the formal deprecation process (Rulebook 6) completes — no silent breaking changes.
4. Every external submission and its outcome (acknowledgement, rejection, timeout) is itself an auditable event, per Module 10's reporting rules.

**Definition of Done:**
- Acceptance criteria below pass.
- API documentation (contract, versioning policy, auth model) is generated and current with the implementation.
- Self-report per `00_Technical_Scaffolding.md` Section 8.

---

## ACCEPTANCE TESTS

**T1 — No integration shortcut.** Given an external integration attempts a dispatch action outside its authorized capacity via the API, when the request is received, then it is rejected by the same authorization check a human user would face through the UI.

**T2 — External data conflict surfaced.** Given an ERP integration reports a different quantity for a lot than Ankuaru's own ledger shows, when the data is ingested, then the discrepancy is recorded and flagged rather than the ERP's figure silently overwriting the ledger.

**T3 — Versioning discipline.** Given API v1 is in active use by an integrator and v2 introduces a breaking change, when v2 is released, then v1 continues to function correctly until it completes the formal deprecation process, not until v2 ships.

**T4 — Submission outcome auditability.** Given a formal submission to an external compliance framework is made and later rejected, when the submission's history is queried, then the original submission, the acknowledgement, and the rejection are all independently visible as a connected, timestamped sequence.

**T5 — Integration identity is a real Actor.** Given a new external integration is provisioned, when its credentials are inspected, then it maps to an Actor/Capacity in Module 1 like any other participant, not a special unaudited system account.
