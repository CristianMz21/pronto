# Implementation Plan: ORM Drizzle 3FN — Portabilidad DB

**Branch**: `007-orm-drizzle-3fn` | **Date**: 2026-08-29 | **Spec**: `spec.md`

## Technical Context

**Stack congelado**: `Next.js 16.3.2`, `React 19`, `TypeScript 5`, `Tailwind + shadcn`, `Supabase` (Auth/Realtime/Storage) + `Drizzle ORM` + `pg` + `drizzle-zod` + `tsx` para seed.

**DB**: `Postgres 17` (`supabase/config.toml:40`), `DATABASE_URL` `54322` local, `5432` pooler prod. `pg` ya en `package.json:63`.

**Constitution Check** (`.specify/memory/constitution.md` v2.0.0): `Library-First` (Drizzle lib) ✅, `Spec-First` ✅, `Multi-DB Portable` ✅, `3FN` ✅, `Test-First` ✅.

## Architecture

**1. Drizzle Config** `drizzle.config.ts`:
```ts
import type { Config } from 'drizzle-kit'
export default {
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
} satisfies Config
```

**2. Schema** `drizzle/schema.ts`:
- `pgTable` + `pgEnum` (`employee_role`, `appointment_status`), `relations`, `index`, `unique`.
- Tablas 3FN: `businesses`, `business_settings`, `business_integrations`, `locations`, `employees`, `services`, `service_categories`, `clients`, `tags`, `client_tags`, `client_stats` (materialized view), `appointments`, `transactions`, `transaction_items`, `inventory_items`, `cash_registers`, `loyalty_*`, `memberships`, `promotions`, `waitlist`, `recurring_appointments`, `campaigns`.
- RLS: `sql` raw en `drizzle/migrations/*_rls.ts` para `my_business_ids()` y `tenant_access_*` (único SQL permitido, documentado como infra).

**3. DB Client** `lib/db.ts`:
```ts
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '@/drizzle/schema'
export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
```

**4. Migration Strategy**:
- Dev: `drop schema public cascade; create schema public; pnpm drizzle-kit push` (no `supabase db reset` con 65 SQL).
- Prod: `drizzle-kit migrate` genera `drizzle/migrations/*.sql` versionados, `schema_migrations` ya no es Supabase sino `drizzle` `__drizzle_migrations`.
- Seed: `drizzle/seed.ts` con `upsert` por `slug`/`phone` (idempotente, <5s).

**5. Portability**:
- `drizzle.config.ts` `dialect` switch: `pg` → `mysql` cambia `pgTable` a `mysqlTable` via `drizzle-orm` codegen; `pg` RLS se desactiva en MySQL (app guard `where(eq(businesses.ownerId, auth.uid()))`).
- `lib/db.ts` `Pool` → `createMySqlConnection` para MySQL, `better-sqlite3` para SQLite.

**6. Rewrite Data Access**:
- Fase 1: `app/(dashboard)/crm`, `app/api/book`, `app/(dashboard)/booking` → Drizzle.
- Fase 2: `app/api/pos`, `inventory`, `cash`, `settings`.
- Mantener `lib/supabase/server.ts` para `auth.getUser()` (Supabase Auth sigue), solo queries migran a Drizzle.

## Project Structure

```
drizzle/
  schema.ts
  migrations/
  seed.ts
lib/
  db.ts
  booking-availability.ts (ya centralizado)
```

## Decisions (ADR)

**Why Drizzle vs Prisma/TypeORM**: Drizzle es 0 codegen, `pg` nativo ya en `package.json:63`, soporta 4 dialectos con mismo API, no rompe RLS (Prisma con `pgbouncer` + RLS requiere `prisma.$queryRaw`).

**Why 3FN con vistas**: `total_visits` en `clients` viola 3FN y causa drift (trigger 008 solo `after insert`); `client_stats` materializada con `REFRESH CONCURRENTLY` es 3FN + P95 <50ms.

**Why Drop en dev**: 65 migraciones `supabase/migrations` con `search_path` hacks y `supabase_auth_admin` son deuda; `drizzle` single source es más óptimo para portabilidad.

## Risks

- RLS con Drizzle: mitigar replicando `my_business_ids()` como `sql` y tests `anon vs barber`.
- Auth sigue Supabase: `drizzle` no maneja `auth.users`, se mantiene `supabase.auth` para `signUp/signIn`.
