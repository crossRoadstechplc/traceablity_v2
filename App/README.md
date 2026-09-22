# Ankuaru Simulator (`App/`)

Event-sourced coffee lot ledger for one exporter’s Ethiopian supply network.
Implements Rulebooks CORE + 00–16 (engine invariants, seed world, role workspaces).

## Stack

- **Monorepo:** pnpm + TypeScript
- **Engine:** `@ankuaru/engine` (append-only events, projections in memory)
- **API:** Fastify `@ankuaru/api` → `http://localhost:3001`
- **Web:** Next.js `@ankuaru/web` → `http://localhost:3000`
- **DB:** Prisma → Supabase Postgres (or local Docker Postgres)

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
pnpm install
pnpm db:generate
pnpm db:migrate
# or: pnpm db:push
```

### 3. Run

```bash
pnpm --filter @ankuaru/api dev
pnpm --filter @ankuaru/web dev
```

Open http://localhost:3000 → **Seed world** → pick Farmer / Collector / Aggregator / Exporter.

### 4. Tests

```bash
pnpm --filter @ankuaru/engine test
pnpm --filter @ankuaru/seed seed
```

## Layout

```
App/
  prisma/schema.prisma   multi-schema public + integrity
  packages/engine        domain commands + invariants
  packages/schema        Zod envelope + shared vocabs
  packages/seed          eight-site CORE §11 world
  apps/api               versioned /v1 commands
  apps/web               Workspace / Network / Inspector
  data/evidence          local file evidence store
```

## Deploy (Vercel)

Next.js lives in `apps/web`, not the monorepo root. Use **one** of these:

### Recommended — Root Directory = `App/apps/web`

In Vercel → Project → Settings → General:

| Setting | Value |
|--------|--------|
| **Root Directory** | `App/apps/web` |
| **Framework** | Next.js |
| **Install Command** | `cd ../.. && pnpm install` |
| **Build Command** | `cd ../.. && pnpm exec prisma generate && pnpm --filter @ankuaru/web build` |

Env vars: `NEXT_PUBLIC_API_URL` pointing at your hosted API (or leave local only for now).

### Alternative — Root Directory = `App`

`App/package.json` lists `next` so Vercel can detect it. Build uses `vercel.json`:

- Install: `pnpm install`
- Build: `pnpm exec prisma generate && pnpm --filter @ankuaru/web build`

**Note:** the Fastify API (`apps/api`) is not a Vercel serverless app as-is — deploy web to Vercel and API separately (Railway/Fly/Render), or keep API local.

## Notes

- Supabase Auth is **not** used — Module 01 User/Actor/Capacity via role picker.
- Intake does **not** invent receipts (Module 03 T2).
- USSD uses `source_channel=api` + `channel_detail=ussd` until Module 00 enum escalation is approved.
- Hosted Supabase is outside Ethiopia — residency is a known v1 tradeoff.
