# Self-report (Rulebook 00 §8) — audit gap remediation

Scope: close every gap found in the rulebook audit against `Rulebooks/CORE_Operational_Ledger.md` and books 00–16.

## 1. Requirement coverage

| Area | Requirement | Status |
|---|---|---|
| 00 §2 envelope | Client `event_id` honoured and idempotent (`x-client-event-id`); duplicate returns `duplicate: true` | IMPLEMENTED + TESTED |
| 00 §2 envelope | `event_time_actual` separate from server time; `retrospective_flag` for offline/retrospective channels | IMPLEMENTED + TESTED |
| 00 §2 hash chain | Canonical-JSON SHA-256 chain over every envelope field; `verifyChain` reports mismatches, gaps, duplicates; legacy 1.0 events counted separately | IMPLEMENTED + TESTED |
| 00 §5 recovery | Replay-vs-projection recovery verification (`/v1/inspector/recovery`) | IMPLEMENTED + TESTED |
| 01 Identity | One user per person, generic/shared logins refused; revocation and capacity grants need step-up | IMPLEMENTED + TESTED |
| 01 Identity | Bind reuses the user already bound to the actor instead of minting one per login | IMPLEMENTED + TESTED |
| 01 / 13 T3 | Assisted entry: collector acts for a sponsored farmer, event records `enteredByActorId` | IMPLEMENTED + TESTED |
| 02 / CORE §7 | Process open to all four chain roles; product kg derived; loss category; facility select; measured moisture (no hard-coded value); no zero by-products | IMPLEMENTED + TESTED |
| 02 / CORE §7 | Transfer ownership uses the fallback matrix, records channel/contract | IMPLEMENTED + TESTED |
| 02 / CORE §7 | Domestic close requires a measured impurity; FOB buyer must be an importer | IMPLEMENTED + TESTED |
| 03 Movement | Dual observations; receiver enters own weight (no pre-filled sender figure); discrepancy disposition by parties incl. Unresolved | IMPLEMENTED + TESTED |
| 03 / REG-D05-04 | Shinto pass required for green dispatch; seal check at receipt | IMPLEMENTED + TESTED |
| 03 / REG-D02-04 | Transaction channel on exporter purchases; direct linkage needs a registered contract | IMPLEMENTED + TESTED |
| 03 | 72h overdue receipts swept lazily (≤ every 5 min) and notified | IMPLEMENTED + TESTED |
| 04 Processing | Facility capability BLOCK; yield FLAG against versioned reference with source | IMPLEMENTED + TESTED |
| 05 Inventory | Stocktake keeps both figures; tolerance max(50 kg, 2%); three-shortfall pattern FLAG | IMPLEMENTED + TESTED |
| 05 / REG-D05-06 | Contracts with all mandatory terms; CoC checked from issued credentials; price band | IMPLEMENTED + TESTED |
| 06 Farm | Versioned geometry, self-intersection flag, ≤4 ha point rule, overlays | IMPLEMENTED + TESTED |
| 07 Evidence | Upload ≠ verified; uploader cannot self-verify; revocation not retroactive; file SHA-256 computed client-side | IMPLEMENTED + TESTED |
| 08 Compliance | Per-requirement status + basis; framework versions by event time; INCOMPLETE/EXCEPTION cannot be submitted; external rejection keeps both determinations | IMPLEMENTED + TESTED |
| 09 Issues | Lifecycle, authority to resolve, rejected attempts logged, obligation handover/close | IMPLEMENTED + TESTED |
| 09 | Conflict quarantine 72h with escalation to sponsor | IMPLEMENTED + TESTED |
| 10 Reporting | Fingerprinted reports, supersession on regeneration, audit package | IMPLEMENTED + TESTED |
| 11 Notifications | Action-only triggers, per actor (not per user), vanish once acted on | IMPLEMENTED + TESTED |
| 12 UX | "{Role} Dashboard" kicker; BLOCK/WARN banners; fact tags Recorded / Derived / Assessment / Missing; service & oversight role views | IMPLEMENTED |
| 12 UX / CORE §8 | Preferred trace lot from server; More ▾ / Hide ▴; event id, mass balance (input/product/reject/loss+category/balance), "Combined from n" with provenance %; crop-year shown as % | IMPLEMENTED |
| CORE §2 / §12 | My Network profiles, deliveries, "In X's network", privacy labels — unchanged; facility onboarding now collects §12 facility fields | IMPLEMENTED |
| CORE §9 | Lineage and lot detail refuse lots outside the viewer's scope; strict event visibility | IMPLEMENTED + TESTED |
| 13 Field | Web offline queue (localStorage) replayed as `mobile_offline_sync` with capture time | IMPLEMENTED (web queue, see §7) |
| 13 USSD | Adapter now requires a bound session | IMPLEMENTED + TESTED |
| 14 APIs | One command path for UI and integrations; integration keys bound to user + actor; OpenAPI lists every route and header | IMPLEMENTED |
| 14 | Regulator reads logged to an access register | IMPLEMENTED + TESTED |
| 15 AI | `ai_model` writes rejected (header and engine); model registry completeness before enable | IMPLEMENTED + TESTED |
| 16 Regulatory | REG-D02-02/03/05/06, REG-D05-04/05/06 enforced; BLOCK only for legal/official authority with step-up | IMPLEMENTED + TESTED |
| 04 yield benchmark vs CORE recipe | Seed recipe parchment→green ≈ 90.9% sits above the 75–85% benchmark | ESCALATED (§8) |
| 03 Shinto scope | Applied to green (supply/export) forms only | ESCALATED (§8) |
| 13 USSD enum | `source_channel` has no `ussd` value | ESCALATED (§8, carried over) |

## 2. Files / components changed

- `packages/schema/src/index.ts` — channels, sanction ladder, CoC criteria, yield references, framework versions, facility capabilities, `canonicalJson`.
- `packages/engine/src/index.ts` — rewritten engine: identity, lot commands, modules 03–16, event-sourced module projections, hash chain, sweep.
- `packages/seed/src/index.ts` — platform admin and service actors, users per actor, contracts, credentials, Shinto, facility processing, evidence and assessments.
- `packages/db/src/{mappers,sync,hydrate}.ts` — facility capabilities, transaction channel, user revocation, projection rebuild on hydrate.
- `apps/web/src/server/ledger-api.ts` — rewritten route layer (headers, visibility, records routes, full command map, sweep, USSD session).
- `apps/web/src/lib/api.ts` — invariant id in errors, `command()` with idempotency key and offline queue.
- `apps/web/src/components/AppShell.tsx` — role-aware nav, notification count, offline/sync indicator.
- `apps/web/src/app/workspace/page.tsx`, `inspector/page.tsx`, `page.tsx`, new `records/page.tsx`.
- `apps/api/src/index.ts` — legacy Fastify server kept compiling against the new engine.

## 3. Schema / API / event changes

- No Prisma migration. Module state is rebuilt from events (`rebuildModuleProjections`), so new module records live in event payloads.
- `EVENT_SCHEMA_VERSION` 1.1 (hash covers the full envelope). 1.0 events remain readable and are reported as `legacyUnverifiable`.
- New request headers: `x-client-event-id`, `x-event-time-actual`, `x-source-channel`, `x-assisted-for-actor`, `x-client-kind`.
- New routes: `transfer-targets`, `process-facilities`, `transporters`, `importers`, `issues`, `obligations`, `evidence`, `contracts`, `credentials`, `compliance`, `reports`, `stocktakes`, `farms`, `inspector/chain`, `inspector/recovery`, `regulator/access-log`, `admin/overview`, `integrations/keys`, plus about 30 new commands under `/v1/commands/*`.
- `WORLD_KEY` bumped to `__ankuaruWorld_v10` so hot-reloaded servers drop stale engine instances.

## 4. Automated tests

- `@ankuaru/engine` — 42 passed.
- `@ankuaru/seed` — 9 passed.
- `@ankuaru/schema` — 7 passed (new).
- `@ankuaru/web` — 12 passed (new; API route layer with the database module mocked).
- `@ankuaru/field` — 1 passed.
- `@ankuaru/api` — no tests (legacy; runs with `--passWithNoTests`).
- Typecheck: `apps/web`, `apps/api`, and `tsconfig.check.json` (schema + engine + seed + db) all clean.

## 5. Security, privacy, offline, compliance impacts

- Every write needs an active user bound to the actor; revoked users, inactive actors and suspended actors are refused.
- Regulator reads are written to the ledger as access records.
- USSD no longer accepts anonymous calls.
- Offline commands keep their capture time and replay idempotently; rejected replays stay visible to the user.

## 6. Migration / backward compatibility

- **Existing databases need a reseed** (`npm run db:seed`). Older worlds lack the platform admin, per-actor users, service actors, credentials and contracts, and their washing stations lack `dry_milling`, so green processing there is correctly blocked.
- Legacy 1.0 events are not rehashed; they are reported, not treated as tampering.

## 7. Known limitations

- Offline support is a browser queue, not a native mobile app with local storage of reference data.
- Integration keys are stored as simulator sessions (the display name marks them), not as a separate credential table with rotation.
- The legacy `apps/api` Fastify server compiles but exposes only its original routes; the Next.js route layer is the supported API.
- `tsconfig.check.json` exists because package project references fail with TS6306; it is a typecheck aid only.

## 8. Escalation records

**E1 — Yield benchmark vs CORE recipe**
1. Sources: Module 04 yield reference (75–85% parchment→green); CORE §11 seed recipe.
2. Problem: the CORE recipe yields about 90.9%, above the benchmark.
3. Why not chosen: changing either the benchmark or the recipe alters a rulebook-defined figure.
4. Options: widen the reference range; change the seed recipe; keep both and accept the FLAGs.
5. Affected: seed yield FLAG issues and the Issues view.
6. Safe temporary state: both kept; the FLAG is raised truthfully and never blocks.

**E2 — Shinto scope**
1. Sources: REG-D05-04; CORE §7 lot forms.
2. Problem: the directive names supply/export coffee, and the ledger has no separate "supply" dispatch form below green.
3. Why not chosen: extending to parchment would add a legal document requirement the directive does not clearly impose.
4. Options: green only; all post-processing forms; configurable per region.
5. Affected: send/receive commands and seed dispatches.
6. Safe temporary state: required for green (and `supply`/`export` states) only.

**E3 — USSD channel enum** (carried over)
1. Sources: Module 13 USSD; Module 00 `source_channel` enum.
2. Problem: no `ussd` value in the enum.
3. Why not chosen: the enum is a cross-module contract.
4. Options: add `ussd`; keep `channel_detail`.
5. Affected: USSD events.
6. Safe temporary state: `source_channel = mobile_online`, `channel_detail = ussd`.

## 9. Acceptance tests passing

Engine: T1 multi-capacity UID; T5 farmer exemption; T8 server-side capacity; bound-user attribution; shared logins refused; actor_onboarded with facility §12 metadata; INV-07 mass balance; process for all roles; FACILITY-CAP; yield FLAG with source; missing moisture FLAG; REG-D02-02 moisture BLOCK; REG-D05-04 Shinto and seal; transfer targets; close-lot rules; T2 no invented receipt; T1 dual observations and dispositions; T1 no circular lineage; T4 crop-year composition; REG-D05-06 price band and CoC; AI write ban; idempotent event id; offline retrospective; assisted entry; tamper detection; evidence rules; stocktake; geometry; report supersession; quarantine escalation; overdue sweep; routine success silent; cross-scheme cap; compliance submission rules; issue authority; obligation handover; sanction ladder; external claim conflict; model registry; BLOCK governance; §9 visibility; projection rebuild.

Seed: CORE §11 shape; weight balance and traceability; actor_onboarded and users; discrepancy hop; facility processing; Shinto on greens; hash chain; projection rebuild parity; EUDR mixed picture.

API: chain and service roles; user reuse on bind; preferred lot and lineage detail; §9 refusal; idempotency; offline retrospective; assisted entry; AI ban; USSD session; regulator access log; report versions; every records surface.
