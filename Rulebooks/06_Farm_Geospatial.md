# Module 6 of 11: Farm & Geospatial
Master build prompt + acceptance tests. Phase 2 — parallel with Coffee Ledger, depends on Identity & Access (Module 1).

---

## MASTER BUILD PROMPT (paste into Cursor/Hercules)

You are implementing the Farm & Geospatial module of Ankuaru. Follow this prompt exactly. Where anything is ambiguous, STOP and list the ambiguity instead of guessing.

**Read first:** `00_Technical_Scaffolding.md`. Assume Module 1 is available.

**Scope — build:**
- Farm entity: an agricultural holding, immutable UID, linked to a Farmer/Owner Actor (from Module 1), persisting independently of ownership changes.
- FarmUnit/Plot entity: a geographically defined production area within a Farm, its own immutable UID, distinct from Farm.
- GeometryVersion entity: every farm unit's mapped geometry is versioned, never overwritten. Each version records capture source, date, method, verification status, and remains linked to whichever Lots/crop periods were produced under it.
- Registration without polygon: a Farm/FarmUnit may be registered with location captured and polygon marked pending, and this must not block basic participation (origin creation, transactions). No hardcoded Ethiopian statutory polygon requirement — that requirement, if any, belongs entirely to the Compliance module (Module 8) for framework-specific evaluation (e.g. EUDR), not to this module's core registration logic.
- Geometry anomaly detection: flag self-intersection, inappropriate overlap with other registered geometries, duplicate geometry, implausible area, impossible location, and dramatic unexplained boundary change between versions.
- Change control on verified geometry: once a geometry version has been used for compliance or formally verified, changing it requires stronger authorization and evidence; the prior version remains preserved and linked to lots produced under it, and material changes trigger a reassessment flag for affected lots (reassessment logic itself lives in Modules 8 and downstream, this module only raises the flag/event).

**Scope — explicitly do not build in this module:**
- No EUDR-specific deforestation dataset evaluation (Module 8).
- No lot/lineage logic (Module 2) — this module only supplies the origin geometry that Module 2's Origin/Create event references.

**Non-negotiable invariants — write these as automated tests:**
1. Person (Farmer), Farm, and FarmUnit/Plot are three distinct persistent objects with three distinct UIDs, never collapsed into one record.
2. Geometry is versioned, never overwritten. A GeometryVersion, once created, is immutable; corrections create a new version.
3. Lack of a completed polygon never blocks basic origin-creation or transaction participation.
4. External map/dataset overlays (deforestation layers, land-use data) are stored as separate assessment objects linked to a GeometryVersion — they never modify the underlying farmer-submitted geometry itself.
5. Earlier lots remain linked to the geometry version applicable to their actual production period, even after later geometry versions are created.

**Definition of Done:**
- Acceptance criteria below pass.
- Geometry anomaly detection runs on every new/updated geometry submission.
- Automated tests exist for every numbered invariant above.

**Before you consider this module complete, self-report** in the exact structured format defined in `00_Technical_Scaffolding.md` Section 8 (requirement coverage table, files changed, schema/API/event changes, tests and results, security/privacy/offline/compliance impact, migration impact, known limitations, escalation records, acceptance-test confirmation). File any ambiguity as an escalation record per Section 9, not as a passing remark.

---

## ACCEPTANCE TESTS

**T1 — Distinct identity levels.** Given a Farmer owns two Farms, each with three FarmUnits, when the data is queried, then there are 1 Farmer record, 2 Farm records, and 6 FarmUnit records, each with its own immutable UID and no collapsing of any two levels.

**T2 — Geometry is versioned, not overwritten.** Given a FarmUnit's geometry is corrected after initial capture, when the correction is saved, then a new GeometryVersion is created, the original version remains queryable, and lots produced before the correction remain linked to the original version.

**T3 — No polygon does not block participation.** Given a Farm is registered with only a point location and no polygon, when the Farmer attempts to create an origin record for a new harvest, then the action succeeds, with polygon status shown as Pending rather than blocking.

**T4 — External overlay does not modify farmer geometry.** Given a deforestation-risk dataset is applied over a FarmUnit's geometry, when the assessment is stored, then it exists as a separate linked assessment object, and the FarmUnit's own submitted geometry is byte-for-byte unchanged.

**T5 — Anomaly detection catches self-intersection.** Given a submitted polygon geometry that self-intersects, when it is submitted, then the system flags it as a structural anomaly before or immediately after acceptance, rather than silently storing an invalid shape.

**T6 — Verified geometry requires stronger authority to change.** Given a GeometryVersion has been used in a completed compliance assessment, when a standard user attempts to edit it directly, then the edit is rejected or routed to an elevated-authority correction workflow, and the original version remains preserved regardless of outcome.
