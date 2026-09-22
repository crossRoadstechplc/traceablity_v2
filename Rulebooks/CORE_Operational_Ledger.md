# Core Operational Ledger — Ankuaru Simulator Contract
Source of truth for **how the playable product works:** git branch `main_v2` (commit `2c4ca43`, Ank-Track-Leads).  
Source of truth for **what the domain must obey:** `Rulebooks/00` through `Rulebooks/16` (this folder).

This file is the operational spine (ledger, four roles, screens, seed, lineage UX). It is **not** the sole contract. A full-fledged simulator is generated from **this file plus every module book 00–16**. Do not invent business rules. If CORE (v2) and a numbered book conflict, follow **§0.2 Precedence**.

---

## 0. Scope

**Build:** the coffee ledger, four playable roles, network, workspace, lineage tracing, inspector, seed world, **and** every acceptance test in modules 00–16 that those screens and commands touch.

**Do not build (demo shell only):** OTP, SMS/email codes, lead collection, hidden admin leads panel (`Ctrl+Alt+A`), `ADMIN_PASSWORD`. That is the old marketing login, not Module 01. Module 01 Identity still applies: identified User, Actor, Capacity, no shared org login. A simulator may start with a role picker that binds a User to an Actor+Capacity.

**v2 had no workspace for:** `transporter`, `regulator`, `importer`, `verifier`, platform admin. Module 12 **does** require those minimum surfaces. Implement them when building the full simulator; keep Farmer / Collector / Aggregator / Exporter as the default playable set from CORE.

**Background actors in the v2 seed:** `washing_station`, `mill`. They process lots in history and can be onboarded as a facility under an aggregator. Module 04 still requires facility capability checks when a ProcessingEvent names a facility.

---

## 0.1 Reading order (mandatory)

An agent building the simulator reads, in this order, and does not skip:

1. This file (`CORE_Operational_Ledger.md`) — screens, four roles, seed, command list, v2 invariants.
2. `00_Technical_Scaffolding.md` — UUID, canonical event envelope, correction, authority_tag, shared vocabs, Section 8 self-report.
3. `01_Identity_Access.md` through `06_Farm_Geospatial.md` — domain modules in number order.
4. `07_Evidence.md` through `11_Notifications.md` — shared services the spine calls.
5. `12_UX_Role_Workspaces.md` — role surfaces, progressive disclosure, no vanity metrics. **This is Module 12 UX.**
6. `13_Field_Channels_Offline.md`, `14_APIs_Integrations.md`, `15_Data_Analytics_AI.md`.
7. `16_Regulatory_Update_Directives.md` — REG-D02-* and REG-D05-*.  
   `12_Regulatory_Update_Directives.md` is the same text as 16; treat **16 as canonical** for directives so it is not confused with UX Module 12.

File any remaining clash as a Section 9 escalation in 00; do not silent-guess.

---

## 0.2 Precedence

| Layer | Wins when | Examples |
|---|---|---|
| **00–16 numbered books** | Invariants, legal BLOCKs, event envelope, identity, evidence, compliance | Moisture 10–12.5% BLOCK; blending permit; no invented receipt; crop-year composition; UUID; integrity_hash |
| **This CORE file** | Playable UX, seed world, four-role chain, screen layout, numbered display names, lot action grid | Workspace / Network / Inspector; Farmer 1 labels; intake UI copy; L-001 codes; eight seed sites |
| **Explicit “v2 did X; book forbids X”** | Book wins; CORE records the old behavior so the seed can be rewritten honestly | Intake auto-receive hops (CORE §7.3) vs Module 03 T2 — **do not invent receipts**; keep origin + lineage without fabricated receive |

Tightening allowed without escalation: enforce CORE §2.3/§2.4 send and intake matrices **in the engine**, not only the UI (Module 01 T8).

---

## 0.3 Map — CORE operations → numbered books

Every CORE section below is owned by one or more modules. Implement both the CORE behavior and that module’s acceptance tests.

| CORE | v2 operation | Module book(s) | What the book adds on top of v2 |
|---|---|---|---|
| §2 Roles, onboard, send/intake targets | Four playable capacities; sponsor tree | **01** Identity, **12** UX | User ≠ Actor; multi-capacity; server-side `assertCapacity`; workspaces for Importer, Transporter/Driver, Warehouse/Processor, Verifier, Regulator, Admin |
| §3.1 Actor | Actor + metadata | **01** | Capacities, Credential, Delegation, step-up, REG-D02-01 CoC data-driven |
| §3.2–3.5 Lot, Event, Movement, Lineage | In-memory ledger | **00** Scaffolding, **02** Coffee Ledger | Full event envelope; integrity_hash; idempotent event_id; UUID; coffee-state vocab; crop-year composition; original unit + kg |
| §3.4–3.6 / §7.4–7.5 Send/receive | Dual observations, pending, discrepancy | **03** Movement | No invented receipt; overdue; custody ≠ ownership (already in CORE); Shinto REG-D05-04; Contract/price REG-D05-06; obligation on Direct Linkage receipt REG-D05-03; quarantine 72h |
| §7.2 Origin lot | Farmer harvest | **02** T5, **01** T5, **06** T3 | Origin vs created-by; farmer needs no CoC; no polygon does not block |
| §7.3 Intake | Auto hops + auto ownership | **02** + **03** T2 | **Replace:** do not fabricate Movement receive. Record origin + counterparty created-by; physical hops are explicit send/receive |
| §7.6 Transfer ownership | Distinct from movement | **03** T3 | Keep; never infer ownership from receipt |
| §7.7–7.8 Split / combine | Lineage + provenance | **02** T1–T4 | DAG at persistence layer; crop-year mix through descendants; no circular lineage |
| §7.9 Process | Mass balance, reject, loss | **04** Processing, **16** D02-02/03 | Explicit loss; facility capability BLOCK; yield FLAG not BLOCK; by-product entities; moisture BLOCK; blending permit BLOCK |
| §7.10 Close | FOB / domestic / destroyed | **02** T7, **16** D02-05 | Terminal additive; domestic impurity cap / grade diversion |
| §8 Lineage trace | Exclusive accordions + breakdown tree | **02** (recursive lineage), **12** (progressive disclosure) | BLOCK/WARN stay in the lot header when accordions are closed |
| §9 Visibility | Owner / custodian / movement party | **01** T8, **12** T1–T3 | Server re-check on every drill-down; role minimum surface |
| §6 Integrity checks | Trace, weight, discrepancies | **05** Inventory, **09** Issues, **10** Audit | StockBalance derived; variances FLAG not theft; Issues not auto-breach; Report fingerprint |
| §11 Seed | Eight sites, three cycles | **02–04** for recipes | Seed must still pass moisture/permit/facility rules if those fields are set; FOB remains a terminal event |
| Inventory of custodian | Active lots held | **05** | Theoretical StockBalance not writable; stocktake keeps both figures |
| — (absent in v2) | — | **06** Farm | Farm ≠ FarmUnit; GeometryVersion; overlays; anomaly detection |
| — | — | **07** Evidence | Attach docs; upload ≠ verified |
| — | — | **08** Compliance | Requirement-level status; no invented % |
| Discrepancy stays open | No resolve UI | **09** Issues | Issue lifecycle; UNRESOLVED allowed; 72h quarantine escalation |
| — | — | **11** Notifications | Action-only notify; dashboard ≠ push |
| Three screens | Workspace, Network, Inspector | **12** UX | Transactional screens; no vanity metrics (already true) |
| — | — | **13** Field | Offline capture, USSD, assisted dual attribution |
| Command API | Unversioned `/api/ledger` | **14** APIs | Same auth as humans; versioned contract; integrator = Actor |
| Numbers unlabeled | kg and yields on screen | **15** Data/AI | Recorded vs Derived vs Assessment vs Inference; missing ≠ 0; AI cannot write lots |
| — | — | **16** Directives | D02-01…06, D05-01…06 as tagged BLOCK/FLAG rules |

`12_Regulatory_Update_Directives.md` = duplicate of 16. Do not implement directives twice.

---

## 1. What this system is

Ankuaru is an **event-sourced coffee lot ledger** for one exporter’s Ethiopian supply network.

- Physical coffee is represented as **Lots**.
- Every change is an **append-only Event**. Lots are never deleted; they become `inactive`.
- **Ownership** (who owns the coffee) and **custody** (who physically holds it) are independent.
- **Movement** changes custody and location. It does not create a new lot or a lineage edge.
- **Split / combine / process** create child lots and lineage edges; parents become inactive.
- Four humans play the chain: **Farmer → Collector → Aggregator (akrabi) → Exporter**.

Three screens after role pick:

| Screen | Job |
|---|---|
| **Workspace** | Do work: add lots, confirm receipts, send / split / combine / process / transfer / close |
| **My Network** | See and onboard the parties you sponsor; open profiles; see deliveries that reached you through them |
| **Ledger inspector** | Lots you touched, activity log, **lineage trace**, integrity checks |

Human-readable lot codes (`L-001`, `L-002`, …) are display-only. Machine IDs are the real keys.

---

## 2. The four playable roles

Session role is one of: `farmer` | `collector` | `akrabi` | `exporter`.  
`akrabi` is labeled **Aggregator** in the UI.

Each login binds to **one Actor** of that type (the acting actor). Network, inventory, and inspector are scoped to that actor. Switching role is a full re-bind, not a permission overlay.

### 2.1 Chain of sponsorship

Every actor except the exporter has a `sponsorActorId` — the party who onboarded them.

```
Exporter
  └── Aggregator (akrabi)          [exporter onboards]
        ├── Collector              [aggregator onboards]
        │     └── Farmer           [collector onboards]
        └── Facility (washing_station or mill)  [optional, created with aggregator]
```

Onboard matrix (only these arrows):

| Acting role | May onboard |
|---|---|
| Exporter | Aggregator (+ optional washing station or mill as child of that aggregator) |
| Aggregator | Collector |
| Collector | Farmer |
| Farmer | nobody |

You cannot skip a level (exporter cannot onboard a farmer directly). Farmers sit under collectors, not under aggregators.

### 2.2 Who you see in My Network

| Role | Network shows |
|---|---|
| Farmer | Only self (farm profile) |
| Collector | Self as section; children = farmers (and any sites) |
| Aggregator | Collectors you sponsored; under each collector: farmers |
| Exporter | Aggregators you sponsored; under each: collectors + processing sites. Farm count is via collectors, not as direct children |

### 2.3 Who you may send a lot to

Send is **custody movement**, one hop along the chain:

| From | Allowed `to` |
|---|---|
| Farmer | Their sponsor collector only |
| Collector | Their sponsor aggregator only |
| Aggregator | Any exporter |
| Exporter | Aggregators they sponsored (return / send-back) |

Empty target list → cannot send.

### 2.4 Who you may record intake from

Intake is the downstream shortcut for “this coffee arrived from my supplier” (see §7.3).

| Receiver | Allowed suppliers |
|---|---|
| Collector | Farmers they sponsored |
| Aggregator | Collectors they sponsored |
| Exporter | Aggregators they sponsored |
| Farmer | none — farmer creates **origin** lots, not intake |

### 2.5 Display names (privacy)

- Farmer viewing anyone: real `displayName`.
- Collector / Aggregator / Exporter viewing farmers, collectors, or aggregators: numbered labels among siblings who share the same sponsor — `Farmer 1`, `Collector 2`, `Aggregator 3`.
- If that party was **user-onboarded** (`metadata.userOnboarded === "true"`) and has a name, append it: `Collector 4 · Abebe`.
- Farmer identities are treated as sensitive for mid/downstream roles; numbering is the default.

Role-pick list only includes actors with `metadata.demoSelectable === "true"` or `metadata.userOnboarded === "true"` for farmer/collector/akrabi/exporter.

---

## 3. Entities

### 3.1 Actor

| Field | Meaning |
|---|---|
| `actorId` | Machine id |
| `actorType` | `farmer` \| `collector` \| `akrabi` \| `washing_station` \| `mill` \| `exporter` (\| unused `transporter` \| `regulator`) |
| `displayName` | Human name |
| `legalIdentityRef` | Stable public code (e.g. `FAYDA-002001`, `REG-EXP-2201`). Unique. Used to re-bind role after reseed |
| `status` | `active` \| `inactive` |
| `sponsorActorId` | Parent in the network, or null for exporter |
| `metadata` | Role-specific attributes (region, woreda, farmSizeHa, license, lat/lng, `demoSelectable`, `userOnboarded`, …) |

Onboard writes event `actor_onboarded`.

### 3.2 Lot

A physical quantity of coffee. Never deleted.

| Field | Meaning |
|---|---|
| `lotId` | Machine id |
| `commodity` | always `"coffee"` |
| `processingState` | physical form (see §4) |
| `processingRoute` | `washed` \| `natural` \| `unknown_at_origin` |
| `status` | `active` \| `inactive` |
| `canonicalMassKg` | mass in kilograms (canonical unit; UI is kg-only) |
| `ownerActorId` | ownership |
| `custodianActorId` | who holds it now |
| `locationId` | free-text location |
| `originLocationId` | where it first entered the ledger (optional) |
| `cropYear` | string, e.g. `"2025-2026"` |
| `originStatus` | `farmer_verified` if recorder === farmer, else `recorded_by_counterparty` |
| `createdEventId` | event that created this lot |
| `provenance` | map `farmerActorId → proportion` (sums ~1) |
| `inactiveEventId` | event that deactivated it, or null |
| `inTransit` | true while a send is pending receipt |

**Inventory** of an actor = lots where `status === "active"` AND `custodianActorId === actor`.

### 3.3 Event (append-only)

| Field | Meaning |
|---|---|
| `eventId` | Machine id |
| `eventType` | see list below |
| `eventTime` | when it happened (ISO) |
| `recordTime` | when it was recorded (ISO; same as eventTime in this version) |
| `executingPersonId` | who clicked |
| `onBehalfOfActorId` | acting actor |
| `payload` | type-specific |
| `correctsEventId` | if this is a correction, the original event id |

Event types:

- `actor_onboarded`
- `origin_lot_created`
- `intake_lot_recorded`
- `movement_send`
- `movement_receive`
- `ownership_transfer`
- `disaggregate`
- `aggregate`
- `process`
- `terminal_disposition`
- `correction`

There is **no API/UI for `correction`** in this version. The engine method exists; a simulator may omit the UI unless you choose to expose it. Engine rule: correction is a new event; the original is never edited.

### 3.4 Movement

One send + one receive sharing `movementId`. Does **not** create a lot or a lineage edge.

| Field | Meaning |
|---|---|
| `movementId` | |
| `lotId` | the same lot throughout |
| `fromActorId` / `toActorId` | |
| `senderDeclaredKg` | sender’s independent observation |
| `receiverDeclaredKg` | receiver’s observation (after receive) |
| `destinationLocationId` | |
| `state` | `pending` \| `received_clean` \| `received_discrepant` |

While `pending`, the lot has `inTransit = true`. **No other action** is allowed on that lot until receive.

### 3.5 Lineage edge

Directed parent → child. Created only by split, combine, or process.

| Field | Meaning |
|---|---|
| `parentLotId` | |
| `childLotId` | |
| `contributionKg` | mass attributed from that parent |
| `proportion` | parent’s share of the child (or `1.0` on each split child — see §7.5) |

### 3.6 Discrepancy

Created when receive kg ≠ send kg.

| Field | Meaning |
|---|---|
| `senderKg` / `receiverKg` / `deltaKg` | `delta = receiver − sender` |
| `status` | `open` \| `resolved` (this version never auto-resolves; they stay open) |

Both observations are kept. Custody still transfers because physical receipt happened. The lot’s `canonicalMassKg` is **not** rewritten to the received weight.

---

## 4. Coffee form and route

### Processing state (form)

| Code | Label |
|---|---|
| `cherry` | Cherry |
| `wet_parchment` | Wet parchment |
| `dry_parchment` | Dry parchment |
| `dried_cherry` | Dried cherry |
| `green_natural` | Green (natural) |
| `green_washed` | Green (washed) |

### Processing route

| Code | Label |
|---|---|
| `washed` | Washed |
| `natural` | Natural |
| `unknown_at_origin` | Unknown at origin |

Typical washed path (seed): cherry → dry_parchment → green_washed.  
Typical natural path (seed): cherry → dried_cherry → green_natural.

Process UI may output: wet parchment, dry parchment, dried cherry, green natural, green washed (not cherry).

---

## 5. Non-negotiable invariants

Write these as engine rules. Reject with an invariant id; do not silently fix.

| ID | Rule |
|---|---|
| **INV-04** | Lot must exist. Inactive lot cannot be consumed, moved, processed, split, combined, transferred, or closed again. |
| **INV-05** | Same as INV-04 when the operation is disaggregate. |
| **INV-07** | Mass must be positive at origin/intake. Split children must **exactly** sum to parent kg (micro-rounded to 1e-6). Aggregate needs ≥ 2 parents. Aggregate parents must share the same `processingState` and `processingRoute`. Process: `outputMassKg + rejectKg + lossKg` must **exactly** equal sum of input kg. |
| **INV-08** | `lossKg > 0` is allowed only if at least one input lot is in a **loss-eligible** state: `cherry`, `wet_parchment`, `dry_parchment`, `dried_cherry`. Green lots cannot use loss as a plug. `rejectKg` is always allowed. |
| **INV-09** | A lot with `inTransit` cannot be acted on. Single disposition authority. |
| **INV-10** | Coffee cannot enter without a named farmer origin. Intake supplier must be farmer, collector, or aggregator. Intake supplier must have a farmer (and collector, if aggregator) in their sponsored tree to attribute origin. |
| **INV-11** | Receive requires a known movement. |
| **INV-12** | Only the **current custodian** may send the lot. |
| **INV-02** | Correction (if exposed) must reference an existing event. |

Additional rules encoded in operations (no separate id in code, still required):

- Lots are never hard-deleted.
- Movement never creates lineage.
- Split / combine / process deactivate parents and create children.
- Ownership transfer does not change custody or location.
- Receive changes custody and location, never ownership.
- Provenance on combine/process is a mass-weighted mix of parents’ provenance maps. Split copies the parent provenance onto every child (no claim of single-origin unless the parent already was).
- Combine takes `cropYear` from the first parent (this version does **not** store a crop-year mix).
- Combine / process copy owner, custodian, location from the first input.

Rounding: compare masses after `Math.round(x * 1e6) / 1e6`.

---

## 6. Integrity checks (inspector)

Three checks, run on demand against the whole ledger (not role-scoped):

1. **Traceability** — every active lot traces backward to origin lots that have a named farmer in provenance. Count how many origin roots are `farmer_verified` vs `recorded_by_counterparty`. Attention if any pending confirmation.
2. **Weight balance** —  
   `minted` = sum of `origin_lot_created.payload.massKg`  
   `reject+loss` = sum of process `rejectKg + lossKg`  
   `active` = sum of active lot kg  
   `closed` = sum of inactive lots whose deactivating event is `terminal_disposition` (not split/combine/process parents)  
   `minted` should equal `active + closed + reject+loss` within 0.01 kg.
3. **Shipment discrepancies** — any `discrepancy.status === "open"` is a problem.

---

## 7. Operations (engine)

Every mutation commits an event, then updates projections.

### 7.1 Onboard actor

Create actor; event `actor_onboarded`.  
When exporter onboards an aggregator, UI may also create a child facility (`washing_station` or `mill`) sponsored by that aggregator in the same request.

User-created parties set `metadata.userOnboarded = "true"` so they appear in role pick and numbered labels.

### 7.2 Create origin lot (Farmer)

Preconditions: `farmerActorId` set, `massKg > 0`.

- Event `origin_lot_created`.
- New active lot: owner = custodian = farmer; provenance `{ farmer: 1.0 }`; `originStatus` = `farmer_verified` if recorder is the farmer, else `recorded_by_counterparty`.
- No lineage edges (this is a root).

Farmer workspace defaults: form cherry, location “field entry”, crop year `2025-2026`.

### 7.3 Create intake lot (Collector / Aggregator / Exporter)

v2 treated this as a **demo convenience**: it fabricated send/receive hops so lineage existed without the user confirming each hop.

**Simulator (Module 03 T2 wins):** do not invent a Receipt. Keep steps 1–2 (named farmer origin, created-by = receiver). Do **not** auto-hop or auto-transfer ownership. Custody stays with the origin farmer until someone actually sends and the receiver confirms. Event `intake_lot_recorded` may still record that the downstream party first digitized the lot.

v2 algorithm (historical only — do not replay in a 00–16-compliant simulator):

1. Resolve a farmer origin from the chosen supplier:
   - supplier is farmer → that farmer
   - supplier is collector → first farmer they sponsor
   - supplier is aggregator → first collector they sponsor → first farmer that collector sponsors
2. `createOriginLot` with `recordedByActorId = receiver` (so originStatus is usually `recorded_by_counterparty`).
3. Auto **send+receive** hops so custody walks Farmer → Collector (if any) → Aggregator (if any) → Receiver. Each hop uses the lot’s current kg; receive matches send (no discrepancy on auto-hops).
4. If owner is still the farmer, `transferOwnership` to the receiver.
5. Event `intake_lot_recorded` with lotId, supplier, farmer, mass.

Exporter intake defaults form to `green_washed` and mass `1200`; others default cherry / `500`.

Intake is rejected if the supplier has no farmer in tree (INV-10).

### 7.4 Send (dispatch)

- Caller must be current custodian (INV-12).
- Lot active and not in transit.
- Create movement `pending`; set `lot.inTransit = true`.
- Event `movement_send`.
- Lot identity unchanged (same lotId).

Workspace: destination is chosen from `allowedSendTargets`; destination location is a text field.

### 7.5 Receive (confirm receipt)

- Workspace lists movements where `state === "pending"` and `toActorId === acting actor`.
- Receiver enters `receiverDeclaredKg`.
- If equal to sender kg → `received_clean`.
- If not → `received_discrepant` + open Discrepancy. Both kg kept.
- Custody → `toActorId`; location → `destinationLocationId`; `inTransit = false`.
- Ownership unchanged.
- Event `movement_receive`.

### 7.6 Transfer ownership

- Lot active, not in transit.
- Event `ownership_transfer` (includes previous owner).
- `ownerActorId` changes. Custody and location unchanged.

UI targets: same as send targets; if empty, fall back to chain partners (farmer→collector, collector→akrabi, akrabi→exporter, exporter→akrabi).

### 7.7 Split (disaggregate)

- Children masses (at least two) must sum exactly to parent kg.
- New lots copy parent form, route, owner, custodian, location, crop year, origin status, **full provenance map**.
- Each lineage edge: parent→child, `contributionKg = child mass`, `proportion = 1.0`.
- Parent deactivated.
- Event `disaggregate`.

### 7.8 Combine (aggregate)

- ≥ 2 active lots, same form and route, all in caller’s inventory, none in transit.
- Child mass = sum of parents.
- Provenance = mass-weighted mix of parent provenances.
- Lineage: each parent→child with `proportion = parentKg / total`.
- All parents deactivated. Child owner/custodian/location/cropYear from first parent.
- Event `aggregate`.

### 7.9 Process

- One or more input lots (UI starts from the selected lot; optional extra lots of same form+route in inventory).
- User enters reject kg and loss kg. **Output product kg is derived:** `product = totalInput − reject − loss`. Engine still requires the three-way sum to match input (INV-07).
- Loss > 0 only if some input is loss-eligible (INV-08).
- New lot in the chosen output state; route copied from first input; mass = outputMassKg (product only — reject and loss are not lots).
- Provenance mass-weighted. Parents deactivated.
- Event `process` payload includes `outputState`, `outputMassKg`, `rejectKg`, `lossKg`, `lossCategory` (optional string).

Reject and loss are **not** tracked as separate lots in this version.

### 7.10 Close lot (terminal disposition)

Reasons only:

| Code | Label |
|---|---|
| `fob_export` | Export at FOB |
| `domestic_disposition` | Sold domestically |
| `destroyed` | Destroyed / lost |

Lot deactivated; still queryable. Event `terminal_disposition`.

---

## 8. Lineage tracing

Inspector tab **Lineage trace**. This UI is an **accordion**, not a always-open dump. A simulator that prints the full tree on load is incomplete.

Helper copy: “Trace a lot back to origin farms.”

Preferred default lot after seed: the washed **multi-aggregator green blend** held by the exporter (most farms in one tree). Changing the selected lot **resets** all accordion/tree state (both sections closed, breakdown off, nodes collapsed, More panels closed).

Engine helpers: `traceBackward(lotId)` → origin lot ids. `forwardOneHop(lotId)` → immediate children. Farm count: walk to roots and union each root’s `provenance` keys.

Deliveries on a network profile (`actorDeliveriesTo`) are separate from this panel (see Network). Module 12: a BLOCK/WARN on the selected lot stays in the panel **header** even when both accordions are closed — never only inside a collapsed section.

### 8.1 Lot picker and header (always visible)

- Select from lots **visible to the acting actor** (§9). Option label: `{code} · {form}` plus ` · closed` if inactive.
- Header: lot code, form as title, then `{route} · {kg} kg · Active|Closed`.

### 8.2 Exclusive accordion (exactly 0 or 1 section open)

Two sections. Clicking a header toggles it. Opening one **closes the other**. Both may be closed. Body is not rendered when closed.

| Section | Header title | Header summary (right side) | Arrow |
|---|---|---|---|
| Traceability | `Traceability` | `{n} farm` / `{n} farms` | ▶ rotates when open |
| Forward visibility | `Forward visibility` | `{n} next hop(s)` or `End of chain` | same |

### 8.3 Traceability section — summary first, then breakdown

**Closed accordion:** only the Traceability row.

**Open, before “View Breakdown”:** key-value summary, then a gate:

| Key | Value |
|---|---|
| Lot | display code |
| State | form · route |
| Mass | kg |
| Owner | display name (role privacy §2.5) |
| Custodian | display name |

Gate text: `This lot traces to {n} farmer harvest batch(es)` plus either ` via {p} immediate upstream lot(s)` or ` (this is an origin parcel).`  
Button: **View Breakdown**.

**View Breakdown** (required):

1. Keep/open the Traceability accordion.
2. Replace the summary with the ancestor tree.
3. Expand **every** ancestor node (full walk of parents).
4. Show tools: **Expand all** (all ancestors in `expandedNodes`), **Collapse to this lot** (only the selected lot id stays expanded; children hidden).

### 8.4 Ancestor tree (accordion-inside-accordion)

Walk **parents** (upstream), not children. Indent children-of-the-walk under the node.

Each node row:

- **Origin leaf** (no parents): origin dot, not a chevron. Clicking the row does nothing to expand. Title = first provenance farmer’s display name (or “Origin”). Subtitle = `Harvest parcel · {origin location} · {crop year}`.
- **Non-leaf:** chevron ▼ (collapsed state visually rotated). Click row toggles that node’s upstream list. Title/subtitle by creating event:
  - `disaggregate` — title = form; subtitle `Split from a larger lot · {route}`
  - `aggregate` — title `Aggregated {form lowercase}`; subtitle `Combined from {n} harvest lots · {route}`
  - `process` — title = form; subtitle `Processed here · yield {output/input×100, 1 decimal}% · {route}`
  - else — form + route
- Line 1: lot-code badge + `{kg} kg`.
- **More / Hide** (stop click from toggling the tree): closed label `▾ More`, open `▴ Hide`. Independent per node.

**More panel** (when open): Owner, Custodian, Origin plot, Current location, Crop year, Route, Origin basis (Farmer verified | Recorded by counterparty), Status (Active | Closed), Parent lots if any, then if process: Input / Product / Reject / Weight loss (+ category) / Balance `input = product + reject + loss`; if aggregate: Combined from {n} lots + provenance `Name xx.x% · …`; always Event id.

Leaves cannot expand. Non-leaves with `expandedNodes` containing their id render parent `TraceNode`s underneath.

### 8.5 Forward visibility section

When open: a one-hop chain `{this code} → {child codes}` or “No further lots recorded.”  
Helper: “Shows the next hop only. Open a child lot to continue.”  
Choosing a child in the lot picker is how you walk forward; this section never recursively expands descendants.

---

## 9. Visibility (inspector)

**Lots visible** to actor A: lot is owned by A, OR held by A, OR appears on a movement where A is from or to.

**Events visible** to actor A: A is `executingPersonId` OR `onBehalfOfActorId` OR `payload.farmerActorId`.

Workspace inventory is stricter: active + custodian = A only.  
Pending receipts: movements pending where `toActorId` = A.

Integrity checks use the **full** ledger, not the visible subset.

---

## 10. Workspace (role UX)

Header kicker: Farmer / Collector / Aggregator / Exporter Dashboard.

Primary action for all four roles: **Add a lot** (`newLot`).

Secondary onboard, if allowed:

- Exporter: Add aggregator (with processing site fields)
- Aggregator: Add collector
- Collector: Add farmer

Layout:

- Left: pending receipts (if any) + inventory cards (code, form, route, kg, owner).
- Right: empty prompt, or lot detail, or the active form.

Lot detail facts: code, form, kg, route, crop year, owner, custodian, immediate prior supplier (last completed inbound movement’s `fromActorId`, or “Harvest origin”), origin status.

If `inTransit`: warning, **no action grid**.

Otherwise action grid (all four roles, any lot they hold):

1. Send  
2. Split  
3. Combine  
4. Process  
5. Transfer ownership  
6. Close this lot  

v2 had no extra server-side capacity gate beyond engine invariants; the UI filtered send/intake/onboard. **Module 01 T8 + §0.2:** the simulator engine must reject those same matrices even if the UI is bypassed.

---

## 11. Seed world (simulator must boot with this shape)

One exporter (`legalIdentityRef` `REG-EXP-2201`), eight aggregator sites:

Yirgacheffe (washed), Bensa (natural), Yirgalem (mixed→washed in historical cycle), Kochere (washed), Hambela (natural), Aleta Wondo (washed), Dilla (mixed), Shakiso (natural).

Per site:

- 1 aggregator sponsored by exporter  
- 1 washing station (washed/mixed sites) or mill (natural sites) sponsored by aggregator  
- 1 collector sponsored by aggregator  
- 6 farmers sponsored by that collector  

Demo-selectable for role pick: first **three** aggregators, their collectors, and farmer `[0]` of those three sites. Exporter is always demo-selectable.

Per site, seed plays three coffee cycles plus a demo farmer lot:

1. **Historical FOB:** all 6 farms origin cherry → collector → aggregator (possible −2 kg discrepancy every 5th farm) → combine → station → process to green (see recipes) → ownership to exporter → move to Addis warehouse → `terminalDispose` `fob_export`.
2. **Open collector inventory:** 4 farms origin → collector → combine; **leave aggregated cherry with the collector** (demo stock).
3. **Active exporter greens:** all 6 farms → collector → aggregator → station → green → exporter warehouse (not FOB).
4. Sites `si < 3`: extra origin cherry left in the demo farmer’s custody (310 + 40·si kg).

Then exporter **combines greens across aggregators** by route (washed blend, natural blend) so one lot traces to many farms. Preferred trace lot = washed blend.

### Process recipes used in seed (for replay, not engine constraints)

**Washed** (cherry in = C):

- parchment out = round(C × 0.55), reject = round(C × 0.05), loss = C − out − reject, category `"moisture"` → `dry_parchment`
- green out = round(parchment × 500/550), reject = parchment − green, loss = 0 → `green_washed`

**Natural** (cherry in = C):

- dried out = round(C × 0.40), reject = round(C × 0.03), loss = C − out − reject, category `"sun-drying moisture loss"` → `dried_cherry`
- green out = round(dried × 0.85), reject = dried − green, loss = 0 → `green_natural`

Crop year for seed lots: `2025-2026`.

Lot display codes assigned in creation order: `L-001`, `L-002`, …

---

## 12. Actor metadata fields (onboard forms)

Use these keys (label / typical placeholder) when collecting onboard data.

**Farmer:** region, zone, woreda, kebele, phone, farmSizeHa, variety, yearsFarming.  
**Collector:** region, zone, woreda, kebele, phone, coverageArea, yearsCollecting.  
**Aggregator:** region, zone, woreda, registrationNo, license, warehouseLocation, yearsOperating.  
**Washing station / mill:** region, zone, woreda, kebele, registrationNo, capacityKgPerDay, operator.  
**Exporter (seed only; not onboarded by a player):** companyName, address, exportLicense, nbeRegistration, contactPerson, contactPhone, warehouse, yearsOperating, primaryDestinations, annualVolumeBags, certifications, bank, tin.

Lat/lng exist on seed farmers/sites for potential maps; the v2 UI does not require a map.

---

## 13. Persistence (simulator)

The v2 app rebuilt an in-memory `Ledger` from a snapshot stored in Postgres. A simulator may keep everything in memory if:

- one shared world for all four roles (not four isolated ledgers)
- events append-only
- projections (lots, movements, lineage, discrepancies, actors) match the engine after every command

IDs in v2 were prefixed strings (`lot_…`, `evt_…`). **Module 00:** use UUID (or equivalent globally unique, non-sequential) primary keys. Human codes (`L-001`) stay a separate display field. Every committed event uses the canonical envelope (actor, capacity, user, actual vs record vs commit time, source_channel, integrity_hash, idempotent event_id).

---

## 14. What a full-fledged simulator must include (Definition of Done)

**A. CORE spine (this file)** — interactive, four roles switchable:

1. Role picker: Farmer, Collector, Aggregator, Exporter — bind User → Actor+Capacity (Module 01), not a shared login.
2. Seed world as in §11 so lineage trace has a deep multi-farm blend on day one. Seed events must satisfy the 00 envelope and 02/03/04 invariants (no fabricated receipts; mass balance; tagged BLOCKs if moisture/permit/facility are in play).
3. Workspace inventory, pending receipts, all six lot actions, origin vs intake add-lot (intake without invented Movement receive — §0.2).
4. Onboard along the matrix, including exporter→aggregator with optional facility (facility capabilities stored and checked on process — Module 04 T4).
5. My Network tree per §2.2, profiles, delivery list through that party.
6. Inspector: lots table, activity, **lineage trace with exclusive Traceability / Forward accordions**, View Breakdown tree (Expand all / Collapse to this lot / per-node More), integrity checks.
7. Numbered display names for mid/downstream roles (CORE privacy).
8. Engine rejects INV-04/07/08/09/10/11/12 **and** Module 01 unauthorized capacity with a visible error; lot in transit locked.
9. Dual send/receive weights; discrepancy listed when they differ; custody still moves; ownership does not.
10. Weight-balance integrity check passes on a fresh seed (FOB + process loss accounted).

**B. Numbered books (00–16)** — every acceptance test T1…Tn and every REG-D02 / REG-D05 row. Self-report per `00` Section 8 per module. Automated tests for numbered invariants.

Do not build OTP or the leads admin. Do **not** skip Evidence, Compliance, Issues, Reporting, Notifications, UX extra roles, Field, APIs, or AI governance — those books are in scope for the full simulator.

---

## 15. Ambiguities resolved by this document (do not re-open)

- **Intake hops:** v2 auto-created send+receive and often auto-transferred ownership. Module 03 T2 forbids inventing a receipt. Simulator: origin lot + created-by = receiver; physical movement only via explicit send/receive. Lineage still points at the named farmer (INV-10).
- Split children inherit full mixed provenance; `proportion` on split edges is 1.0 (mass is in `contributionKg`). Physical single-origin split requires evidence (Module 02 T2).
- **Crop year:** v2 copied the first parent’s string. Module 02 T4 wins — store `cropYearComposition`; never relabel a mix as the newest year.
- Receive does not change `canonicalMassKg` when weights disagree (both observations kept — Module 03 T1).
- v2 discrepancies stayed `open` with no resolve UI. Module 09 owns resolution: FLAG/WARN issue, UNRESOLVED allowed, never auto-breach.
- Correction is a new event (Module 00 §3). Expose it; do not UPDATE the original row.
- `washing_station` / `mill` are not default playable logins; they are facilities (Module 04).
- **Channel enum vs USSD:** Module 13 requires USSD; Module 00 `source_channel` has no `ussd` value. Escalate per 00 Section 9 before inventing an enum member.
- Two files named “12”: UX is `12_UX_Role_Workspaces.md`; directives are `16_Regulatory_Update_Directives.md`.

---

## 16. Command surface (for an API or in-process simulator)

**Create actor** — `actorType`, `displayName`, `legalIdentityRef`, `sponsorActorId`, `metadata`, optional nested `facility`.

**Create lot** — `kind: "origin" | "intake"` plus the fields in §7.2 / §7.3.

**Commands (CORE spine):**

- `send` — lotId, fromActorId, toActorId, senderDeclaredKg, executingPersonId, destinationLocationId  
- `receive` — movementId, receiverDeclaredKg, executingPersonId  
- `aggregate` — parentLotIds (≥2), executingPersonId, actingActorId  
- `disaggregate` — parentLotId, childMassesKg (≥2), executingPersonId, actingActorId  
- `process` — inputLotIds, outputState, outputMassKg, rejectKg, lossKg, executingPersonId, actingActorId, optional lossCategory  
- `transferOwnership` — lotId, newOwnerActorId, executingPersonId, actingActorId  
- `terminalDispose` — lotId, reason ∈ {fob_export, domestic_disposition, destroyed}, executingPersonId, actingActorId  

Plus whatever 00–16 require (correction, stocktake, adjustment, farm/geometry, evidence, assessment, obligation handover, notification). Module 14: this surface is the human and integration path — same authorization, no shortcut.

Queries: snapshot of actors, lots, events, lineage, movements, discrepancies; inventory(actorId); pending receipts(actorId); traceBackward; forwardOneHop; integrity checks; network tree.

---

End of CORE spine. Implement this file **together with** `00`–`16`. That is the full simulator contract. OTP and lead collection stay out.
