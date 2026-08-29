# Feature Specification: ORM Drizzle 3FN — Portabilidad DB

**Feature Branch**: `007-orm-drizzle-3fn`
**Created**: 2026-08-29
**Status**: Draft
**Input**: Migrar de SQL crudo (65 migraciones `supabase/migrations/*.sql`) a ORM Drizzle con esquema 3FN óptimo, sin depender de Supabase, con libertad para pasar a Postgres/MySQL/SQLite. En dev se permite `DROP SCHEMA public CASCADE` + reseed. Fuente: `package.json` sin ORM, `001_initial_schema.sql` desnormalizado, `.specify/memory/constitution.md` v2.0.0.

## Overview

Pronto/Escudería hoy es `Next.js 16 + @supabase/supabase-js` con 65 SQL crudos, 15 RLS y triggers `pg_advisory_xact_lock` (032). Cada `app/api/*` y `app/(dashboard)/*` hace `supabase.from('...')` sin tipado central y `database.types.ts` se genera con `supabase gen types`. Esto ata a Supabase Postgres y rompe portabilidad.

Esta feature introduce **Drizzle ORM** — el más portable (Postgres ≥14, MySQL 5.7/8, SQLite, SingleStore con mismo API, sin codegen pesado) — con `drizzle.config.ts` + `drizzle/schema.ts` como única fuente de verdad, `drizzle-kit` para `push/drop`, y esquema **3FN óptimo** (desnormalización solo para `receipt_number` y `price` snapshot histórico). `Supabase Auth/Realtime/Storage` se mantienen como servicios desacoplados, no como DB vendor lock.

**Principios**: `Library-First` (Drizzle como lib), `Spec-First`, `Multi-DB Portable`, `3FN + vistas materializadas` para performance.

## User Scenarios & Testing

### User Story 1 — Dev: Drop DB y reseed en <30s (P1)
Como dev quiero `drop schema public cascade; drizzle-kit push; drizzle:seed` y tener DB 3FN lista con `Escudería Centro` y `clients` de prueba en <30s, sin tocar `supabase/migrations` legacy.

**Acceptance**:
1. `psql -c "drop schema public cascade; create schema public;"` + `pnpm drizzle-kit push` aplica `drizzle/schema.ts` completo (businesses, clients, appointments, transaction_items, etc.) sin error.
2. `tsx drizzle/seed.ts` inserta `businesses` + `locations` + `services` + `employees` + `clients` idempotente (upsert por `slug`/`phone`).
3. `supabase gen types` ya no es necesario; `drizzle-orm` infiere `InferSelectModel`.

### User Story 2 — App: Queries tipadas sin SQL crudo (P1)
Como dev quiero reemplazar `supabase.from('appointments').select(...)` por `db.query.appointments.findMany({ where: eq(...), with: { client, service } })` tipado y testeable.

**Acceptance**:
1. `app/(dashboard)/crm/page.tsx` y `app/api/book/route.ts` usan `db` Drizzle sin `supabase.from`, con `where` y `orderBy` tipados.
2. `lib/supabase/database.types.ts` se depreca (queda para compat, pero `drizzle/schema.ts` es source).
3. Tests `tests/unit/booking-availability` siguen verdes con mock `db`.

### User Story 3 — Portabilidad: Cambiar a MySQL/SQLite sin reescribir app (P2)
Como owner quiero poder pasar de Supabase Postgres a `postgres:16` self-hosted o `MySQL 8` sin reescribir `app/api/*`.

**Acceptance**:
1. `drizzle.config.ts` `driver: 'pg' | 'mysql2' | 'better-sqlite3'` con `dbCredentials.url = process.env.DATABASE_URL`.
2. `drizzle/schema.ts` usa `pgTable`/`mysqlTable` via `drizzle-orm` dialect switch o `drizzle-kit` multi-project.
3. RLS Supabase se desacopla: `my_business_ids()` se reemplaza por `where(eq(businesses.ownerId, authUserId))` en app + `rowLevelSecurity` via `drizzle` `pgPolicy` si Postgres, o `app` guard si MySQL.

## Requirements

### Functional Requirements — ORM

- **FR-ORM-001**: System MUST usar `drizzle-orm` + `drizzle-kit` + `pg` (ya en `package.json:63`) + `drizzle-zod`, sin `prisma`/`typeorm`.
- **FR-ORM-002**: System MUST tener `drizzle.config.ts` con `schema: './drizzle/schema.ts'`, `out: './drizzle/migrations'`, `driver: 'pg'`, `dbCredentials: { connectionString: process.env.DATABASE_URL }`.
- **FR-ORM-003**: System MUST reemplazar `supabase gen types` por `drizzle/schema.ts` con `pgTable`, `relations`, `indexes`, `unique` y `InferSelectModel`.
- **FR-ORM-004**: System MUST proveer `lib/db.ts` `export const db = drizzle(pool)` con `Pool` de `pg` y helper `getDb()` que respete `auth.uid()` via `SET LOCAL`.

### Functional Requirements — 3FN

- **FR-3FN-001**: System MUST normalizar `transactions.items jsonb` → `transaction_items(id, transaction_id FK, service_id FK, name_snapshot, price_snapshot, qty)` con `PRIMARY KEY (transaction_id, service_id)`.
- **FR-3FN-002**: System MUST normalizar `clients.tags text[]` → `tags(id, name) + client_tags(client_id, tag_id)` con `unique(client_id, tag_id)`.
- **FR-3FN-003**: System MUST extraer `clients.total_visits/spent/last_visit_at` a `client_stats` vista materializada (no columnas mutables en `clients`), refrescada por trigger `008` o `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
- **FR-3FN-004**: System MUST normalizar `businesses` monolito → `business_settings(business_id PK, timezone, currency, brand_color)` y `business_integrations(business_id, provider, token)` para eliminar transitivas.
- **FR-3FN-005**: System MUST mantener `appointments.price` como snapshot histórico (excepción 3FN documentada) y `transactions.receipt_number` secuencia.

### Functional Requirements — Drop DB

- **FR-DROP-001**: System MUST permitir `drop schema public cascade` en dev sin perder `supabase/auth` usuarios (auth schema separado).
- **FR-DROP-002**: System MUST tener `drizzle/seed.ts` idempotente que recrea `Escudería` con `locations` + `services` + `employees` en <5s.

## Success Criteria

- **SC-001**: `pnpm drizzle-kit push` aplica 3FN sin error y `psql \d transaction_items` existe.
- **SC-002**: `app/(dashboard)/crm/page.tsx` sin `supabase.from`, 100% Drizzle, `npm run build` verde.
- **SC-003**: Cambiar `DATABASE_URL` a `mysql://...` y `drizzle.config.ts` driver a `mysql2` permite `push` sin reescribir queries (solo `schema.ts` dialect).
- **SC-004**: `npx vitest run --exclude="**/*strict*"` 32 suites 155 tests verde con mocks Drizzle.
- **SC-005**: `drop schema public cascade; pnpm drizzle-kit push; pnpm drizzle:seed` <30s y app arranca sin `supabase/migrations` legacy.

## Dependencies

- `supabase/migrations/001..058` archivadas a `supabase/migrations_archive/` tras `drizzle` push.
- `lib/auth/roles.ts` (005) para `my_business_ids` replacement.
- `lib/booking-availability.ts` ya centralizado.
