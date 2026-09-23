# Module self-reports (Rulebook 00 §8) — Phase 0–6 scaffold delivery

## Phase 0 — Scaffold
1. **Coverage:** Canonical event envelope schema (Prisma + Zod), UUID ids, integrity schema, empty→full engine, monorepo — IMPLEMENTED + TESTED (engine 21 tests).
2. **Files:** `App/` monorepo, `prisma/schema.prisma`, `prisma/migrations/20250922100000_init/`, packages engine/schema/seed/db/field, apps api/web.
3. **Schema:** `events` + identity stubs + all module tables; `integrity.checkpoints`.
4. **Tests:** `@ankuaru/engine` 21 passed; `@ankuaru/field` 1 passed; seed boots weightBalance.ok=true.
5. **Security/privacy/offline:** No OTP; role bind; evidence on local disk; USSD via api+channel_detail escalation.
6. **Migration:** SQL generated; apply with `pnpm db:migrate` when DATABASE_URL (Supabase or Docker) authenticates.
7. **Limitations:** Live Supabase credentials not yet in `.env` (placeholder local URLs); Docker daemon not running on this machine; migrate not applied to remote yet.
8. **Escalations:** USSD enum missing from Module 00 `source_channel` — temp `channel_detail: ussd`.
9. **Acceptance:** Health `/health`, seed `/v1/seed`, weight-balance ok on seed.

## Modules 01–15 (engine + API surface)
- 01 Identity: User/Actor/Capacity, assertCapacity, farmer CoC exemption — tested.
- 02 Ledger: DAG lineage, cropYearComposition, units, terminal additive — tested.
- 03 Movement: dual observations, no invented receipt, custody≠ownership, Shinto/contract/price band hooks — tested.
- 04 Processing: mass balance, loss entered, moisture BLOCK, blending permit, yield FLAG — tested.
- 05 Inventory: derived stockBalance, stocktake keeps both figures — tested.
- 06 Farm: Farm≠FarmUnit, polygon pending does not block — tested.
- 07 Evidence: upload≠verified, SYSTEM_VALIDATED distinct — tested.
- 08 Compliance: no invented %, mixed composition, scheme cap, submission EXCEPTION — tested.
- 09 Issues: ANOMALY not breach, UNRESOLVED, BLOCK governance, quarantine 72h — tested.
- 10 Reporting: fingerprint stable — tested; checkpoints schema ready.
- 11 Notifications: action-only — tested.
- 12 UX: Workspace/Network/Inspector + exclusive lineage accordions — implemented in web.
  - **Contract:** `.cursor/rules/ankuaru-core-ux.mdc` — Network profiles (§12 metadata + deliveries), lineage seed cards, onboard metadata must not be stripped.
- 13 Field: dual attribution helper + USSD adapter endpoint — implemented.
- 14 APIs: `/v1` same auth path + openapi stub — implemented.
- 15 AI: write ban at engine — tested.

## How to apply Prisma migrate (Supabase)
1. Put real `DATABASE_URL` + `DIRECT_URL` in `App/.env`.
2. SQL editor: `CREATE EXTENSION pgcrypto; CREATE SCHEMA integrity;`
3. `pnpm db:migrate` or `pnpm db:push`.
