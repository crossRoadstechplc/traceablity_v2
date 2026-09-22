# Regulatory Update — Directives 02/2012 and 05/2013
Change-request record per Rulebook 6 Section 76. Scoped update, not a full re-audit.

## Problem
Rulebook 2's Pending Regulatory Verification register listed two ECTA directives as not yet extracted: Coffee Trade & Quality Monitoring Directive 02-2012/2019 and Coffee Vertical Integration Marketing Directive 05-2013/2021. Both have now been supplied and read in full.

## Source
- Ethiopian Coffee and Tea Authority, Directive No. 02/2012 (2019/2020 G.C.), Coffee Marketing and Quality Control.
- Ethiopian Coffee and Tea Authority, Directive No. 05/2013 (2021 G.C.), Direct Linkage Supply Coffee Sales Contract Administration and Price Determination.

## New regulatory rules (added to Rulebook 2's Regulatory Requirements Register)

| REG-ID | Rule | Legal actor | Source |
|---|---|---|---|
| REG-D02-01 | Certificate of Competency requires: adequate infrastructure/equipment (storage, drying beds, processing equipment, moisture meters), qualified cupping personnel, certified lab access, and tax/legal compliance. | Processor, Supplier, Roaster, Exporter | Directive 02/2012 Art. 3 |
| REG-D02-02 | Moisture content for supply/export coffee must be strictly 10.0%–12.5%. Authority tag: LEGAL_REQUIREMENT. | Processing facilities | Directive 02/2012 Art. 4(1) |
| REG-D02-03 | Mixing coffee types, origins, or crop years is prohibited without an authorized blending permit. | Processors | Directive 02/2012 Art. 4(3) |
| REG-D02-04 | Coffee transactions are legally confined to three channels: Primary Transaction Centers, Direct Linkage (vertical integration), and ECX/authorized auction. | All transacting actors | Directive 02/2012 Art. 5 |
| REG-D02-05 | Domestic-consumption coffee is capped at 15% max impurity. Diverting export-grade coffee to domestic market or local-grade coffee to export without authorization is prohibited. | Suppliers, Exporters | Directive 02/2012 Art. 7 |
| REG-D02-06 | Sanctions ladder: written warning → temporary Certificate suspension → permanent revocation + licence cancellation → seizure + judicial referral. | All regulated actors | Directive 02/2012 Art. 9 |
| REG-D05-01 | Direct Linkage: a defined transaction mechanism where a Certificate-holding Supplier sells directly to an Exporter (or foreign market) outside ECX, requiring both parties to hold valid, renewed Certificate of Competency and trade licence, with the contract registered at the Documents Authentication and Registration Agency. | Supplier, Exporter | Directive 05/2013 Art. 2(12), 4-5 |
| REG-D05-02 | A Direct Linkage sales contract must record: both parties' identity, coffee type/quantity/grade, price (Authority max/min formula plus up to 5% premium), execution period, payment terms, delivery/inspection site, transport cost allocation, registration reference, dispute recourse. | Supplier, Exporter | Directive 05/2013 Art. 4(2) |
| REG-D05-03 | Payment settlement: 3 working days after dispatch-station delivery, or same-day if graded at an Authority branch; escalating complaint windows (5 working days); up to 1-week force majeure extension; bank transfer required with 2-day confirmation. | Exporter (payer), Supplier | Directive 05/2013 Art. 6 |
| REG-D05-04 | Coffee Transport Pass ("Shinto"): a required movement permit recording weight, volume, grade, and lot before dispatch. Vehicle is sealed at origin; dispatch station verifies seal integrity and net weight via weighbridge before re-sealing for onward transit. | Transporter, Inspector | Directive 05/2013 Art. 7 |
| REG-D05-05 | Quality grading disputes resolve first by mutual agreement, then by Authority determination or Third-Party Arbitration at the Coffee Quality Inspection and Certification Center. | Supplier, Exporter | Directive 05/2013 Art. 8(2) |
| REG-D05-06 | Authority sets a daily Maximum/Minimum Export Coffee Supply Price; Direct Linkage contract price must fall within that formula plus up to 5% premium. | Exporter, Supplier | Directive 05/2013 Art. 9 |

## Terminology finding — resolved, no conflict
"Direct Linkage" is Ethiopian legal terminology for one specific transaction mechanism (supplier-to-exporter, bypassing ECX). It is a subtype of Rulebook 1's ordinary "vertical" transaction classification (different chain levels), not a competing taxonomy. Rulebook 1's vertical/horizontal vocabulary needs no correction. Action: "Direct Linkage" and "Alternative Coffee Marketing" are now recognized as named transaction-mechanism labels alongside ECX, storable as an attribute on a transaction, not a redefinition of the vertical/horizontal classification itself.

## Still open (Rulebook 2 remains partially deferred)
Regional-level variation in the competence-certificate matrix (only the federal baseline is now known). Akrabi/collector/aggregator legal status. Periodic reporting forms and cadence under the Amharic monitoring directive. These remain Pending Regulatory Verification exactly as before.

## Structural decision
Directives 05/2013's Contract, Price, and Payment-Settlement concepts have no clean home in the existing 11-module boundary. Decision: attached to Movement & Custody (Module 3) as a Contract sub-entity linked to Dispatch, with payment-settlement timing modeled as an Obligation raised to Issues & Obligations (Module 9) on Receipt. No new module created.

## Files affected by this update
`01_Identity_Access.md` (credential baseline, REG-D02-01), `03_Movement_Custody.md` (Shinto fields and Contract sub-entity, REG-D05-01 through 06), `04_Processing.md` (moisture threshold and blending prohibition, REG-D02-02, REG-D02-03). Patched below. `02_Coffee_Ledger.md`, the other seven module files, the Unified PRD docx, and the original Rulebook 2 docx are unaffected in substance and not regenerated as part of this scoped update.
