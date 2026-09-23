# Ankuaru Simulator (`App/`)

Event-sourced coffee lot ledger for one exporter’s Ethiopian supply network.
Implements Rulebooks CORE + 00–16 (engine invariants, seed world, role workspaces).

## Stack

- **Monorepo:** npm workspaces + TypeScript
- **Engine:** `@ankuaru/engine` (append-only events, projections in memory)
- **App:** Next.js `@ankuaru/web` (UI + App Router API) → `http://localhost:3000`
- **DB:** Prisma → Supabase Postgres (or local Docker Postgres) for migrate/seed scripts

The ledger API lives in Next.js Route Handlers (`/api/*`, rewritten to `/v1/*` and `/health`).

## Quick start

### 1. Environment

```bash
cd App
cp .env.example .env
```

**Supabase:** paste `DATABASE_URL` (pooler `:6543?pgbouncer=true`) and `DIRECT_URL` (session `:5432`).

In Supabase SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS integrity;
```

**Local Docker fallback** (if Docker Desktop is running):

```bash
docker compose up -d
# .env.example defaults already match compose
```

### 2. Install & migrate

```bash
npm install
npm run db:generate
npm run db:migrate
# or: npm run db:push
```

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000 → **Seed world** → pick Farmer / Collector / Aggregator / Exporter.

API is same-origin (`/v1/...`). Do not set `NEXT_PUBLIC_API_URL` unless you point at an external API.

### 4. Tests

```bash
npm run test -w @ankuaru/engine
npm run seed -w @ankuaru/seed
```

## Layout

```
App/
  prisma/schema.prisma   multi-schema public + integrity
  packages/engine        domain commands + invariants
  packages/schema        Zod envelope + shared vocabs
  packages/seed          eight-site CORE §11 world
  apps/web               UI + App Router API (`src/server/ledger-api.ts`)
  apps/api               optional standalone Fastify (legacy)
  data/evidence          local file evidence store
```

## Deploy (Vercel — recommended)

One project for UI + API (Next App Router).

| Setting | Value |
|--------|--------|
| **Root Directory** | `App/apps/web` |
| **Framework** | Next.js |
| **Install Command** | `cd ../.. && npm install` |
| **Build Command** | `cd ../.. && npm run vercel-build` |
| **Node** | 20.x or 22.x |

Leave `NEXT_PUBLIC_API_URL` unset (same-origin `/v1`).

If Root Directory is instead `App`, Install = `npm install`, Build = `npm run vercel-build`.

**Note:** the ledger is in-memory per server instance. On Vercel serverless, cold starts reset the seed — the home page auto-seeds, or use **Reseed** in the nav. For a long-lived process, use `npm run start` on a Node host.

## Optional: standalone API (Render)

`apps/api` Fastify still works if you prefer a separate backend. Root Directory `App`, build `npm install && npm run build:api`, start `npm run start:api`, and set `NEXT_PUBLIC_API_URL` on the web to the Render URL.

## Notes

- Supabase Auth is **not** used — Module 01 User/Actor/Capacity via role picker.
- Intake does **not** invent receipts (Module 03 T2).
- USSD uses `source_channel=api` + `channel_detail=ussd` until Module 00 enum escalation is approved.
- Hosted Supabase is outside Ethiopia — residency is a known v1 tradeoff.
