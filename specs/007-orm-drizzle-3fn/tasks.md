# Tasks: ORM Drizzle 3FN — Portabilidad DB

**Feature**: `007-orm-drizzle-3fn` | **Branch**: `007-orm-drizzle-3fn` | **Spec**: `spec.md` | **Plan**: `plan.md`

## Phase 1: Setup

- [ ] **T001** Setup Drizzle: `pnpm add drizzle-orm drizzle-kit drizzle-zod pg` + `drizzle.config.ts` [P]
- [ ] **T002** Create `drizzle/schema.ts` with `pgTable` for `businesses`, `locations`, `employees` (introspect from `DATABASE_URL`) [P]
- [ ] **T003** Create `lib/db.ts` with `Pool` + `drizzle` instance [P]

## Phase 2: Foundational 3FN

- [ ] **T004** Normalize `transactions.items jsonb` → `transaction_items` table + FK + `drizzle/relations` [P]
- [ ] **T005** Normalize `clients.tags text[]` → `tags` + `client_tags` M:N [P]
- [ ] **T006** Extract `clients.total_visits/spent/last_visit_at` → `client_stats` materialized view + trigger [P]
- [ ] **T007** Split `businesses` monolito → `business_settings` + `business_integrations` [P]

## Phase 3: Migration Drop

- [ ] **T008** Archive `supabase/migrations/*` to `supabase/migrations_archive/` and create `drizzle/migrations` with `drizzle-kit generate`
- [ ] **T009** Create `drizzle/seed.ts` idempotente for `Escudería Centro` + `services` + `employees` [P]
- [ ] **T010** Test `drop schema public cascade; drizzle-kit push; tsx drizzle/seed.ts` <30s in dev

## Phase 4: Rewrite Data Access (US1)

- [ ] **T011** Rewrite `app/(dashboard)/crm/page.tsx` to Drizzle (`db.query.clients.findMany`)
- [ ] **T012** Rewrite `app/api/book/route.ts` to Drizzle
- [ ] **T013** Rewrite `app/(dashboard)/booking/page.tsx` to Drizzle
- [ ] **T014** Update `tests/unit/booking-availability.test.ts` mocks to Drizzle

## Phase 5: Polish

- [ ] **T015** Deprecate `lib/supabase/database.types.ts` (keep for compat, add comment)
- [ ] **T016** Update `package.json` scripts: `db:push`, `db:seed`, `db:studio`
- [ ] **T017** Verify `npm run build` + `npx vitest run --exclude="**/*strict*"` + `DATABASE_URL=mysql://` push dry-run
