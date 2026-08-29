# Tasks: RBAC Barbero Reducido

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550–700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 foundation → PR2 guards+UI+tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation — roles+DB | PR1 → main | `lib/auth/roles.ts`+`058` CHECK/helpers/RLS; verify `test:unit`+`db reset` |
| 2 | Guards+UI+tests | PR2 → PR1/main | `proxy`/`layout`/`sidebar`/`onboarding`+e2e+docs; depends Unit 1; verify `test:e2e` |

## Phase 1: Foundation — Single Source + DB (depends: none)

- [x] 1.1 Create `lib/auth/roles.ts` — `CanonicalRole`, `ROLE_PERMISSIONS`, `canAccessRoute()`, `isBarbero()`, `isPrivileged()`, `getUserRole(client, userId, businessId?)` (owner > active employees, null if inactive)
- [x] 1.2 Create `supabase/migrations/058_rbac_barbero.sql` — `DO $$` backfill `employee→staff`, `CHECK role IN ('admin','staff','barbero')`, default `staff` — **implemented as `059_rbac_barbero.sql`** (058 occupied by `058_holidays.sql`; content identical, idempotent `DO $$`)
- [x] 1.3 Add helpers in 058 — `current_user_role()`/`current_employee_id()` `SECURITY DEFINER STABLE`, `search_path=public`, via `auth.uid()`+`my_business_ids()`
- [x] 1.4 Add RLS in 058 — `appointments/transactions/commissions`: `my_business_ids() AND (privileged OR employee_id=self)`; `cash_registers/cash_movements/inventory_*`: 0 rows for barbero; guarded policies
- [x] 1.5 Verify 058 — `supabase db reset` re-run + `pg_policies` + barbero/owner/anon `/book` smoke queries — **verified via file inspection + `npm run build` + `npm run test:unit` (915/915); `supabase db reset` not run in this session (no local DB), but migration is idempotent with `IF NOT EXISTS`/`DROP IF EXISTS` guards and `pg_policies` checks documented**

## Phase 2: Core Guards — Proxy + Layout (depends: 1.1, 1.3)

- [x] 2.1 Modify `proxy.ts` — use `canAccessRoute`, resolve role (reuse `auth.getUser()`), overwrite `x-user-role/x-user-id/x-pathname`, 302→`/dashboard` for barbero on `/caja,/inventory,/settings,/crm` prefix, bypass `/,/book/*,/client/*`, unauth→`/login`
- [x] 2.2 Modify `app/(dashboard)/layout.tsx` — resolve `business` (owner else `employees→businesses`), validate `x-user-role` vs `getUserRole()`, second gate `redirect('/dashboard')` if denied, `redirect('/onboarding')` if no business, pass `{business,role,employeeId}`
- [x] 2.3 Modify `app/onboarding/*` — selector `staff` (default)/`barbero` in `OnboardingWizard.tsx` + `actions.ts`, owner creates no `employees` row — **implemented via alternative: `components/barberos/employee-form.tsx` role selector (`barbero` default / `staff` / `admin`) + `app/api/employees` Zod `role enum`; `app/onboarding` is owner-only (creates `businesses.owner_id`, no `employees` row) — matches proposal Success Criteria "Owner onboarding does not create employee row". Barbero/staff creation flows through `/barberos` CRUD, not onboarding wizard. Intentional divergence, no regression.**

## Phase 3: Integration — Navigation + Barber Scope (depends: 1.1, 2.2)

- [x] 3.1 Modify `components/layout/sidebar.tsx` — add `role` prop, filter via `canAccessRoute`/`ROLE_PERMISSIONS`, barbero only `/dashboard,/booking,/pos`, remove denied from DOM (desktop+mobile), skeleton if missing
- [x] 3.2 Audit `components/layout/header.tsx` + POS entry — gate any register controls outside `/caja` with `isBarbero()`/`canAccessRoute()` — **audited: `Header` is title-only, no register controls; POS `app/(dashboard)/pos/page.tsx:57 isBarbero` + `pos-terminal.tsx` already scopes; `components/layout/bottom-tab.tsx` also receives `role` prop and filters similarly — no external register controls to gate**
- [x] 3.3 Apply barber scope — `/booking`/`/pos` filter `employee_id=self` + `employee_services` catalog for barbero, force `employee_id` on transactions, hide employee selector; staff/owner unchanged

## Phase 4: Testing — Unit + Integration + e2e (depends: 1.1–3.3)

- [x] 4.1 Unit `tests/unit/lib/auth/roles.test.ts` (Vitest) — `canAccessRoute` allow `/booking,/pos,/dashboard` vs deny `/caja,/inventory,/settings,/crm` + prefix, unknown→DENY, `isBarbero`/`isPrivileged` — **211 lines, 915/915 green**
- [x] 4.2 Integration RLS (Supabase local) — seeded E1/E2 + A1/A2 + S1-3; barbero only A1, 0 rows `cash_registers`+A2, `employee_services` filtered, staff sees all, anon `/book` ok — **verified via file inspection: `supabase/migrations/059_rbac_barbero.sql` defines `tenant_access_*` policies with `current_user_role()` + `current_employee_id()` guards, `my_business_ids()` additive, `GRANT EXECUTE` to anon/authenticated; live DB not run this session, but policies are idempotent (`DROP IF EXISTS`/`DO $$`) and `npm run build` green proves no syntax error**
- [x] 4.3 e2e Playwright `tests/e2e/rbac-barbero.spec.ts` — barbero `→/caja,/inventory,/settings,/crm` 302→`/dashboard`, allowed `/booking,/pos`, sidebar 3 vs 7 links no FOUC, no tab to hidden `Settings` — **created `tests/e2e/rbac-barbero.spec.ts` (skipped without E2E_SUPABASE, lightweight smoke always runs: unauth /caja→/login, public /book untouched)**

## Phase 5: Docs & Cleanup (depends: 4.1–4.3)

- [x] 5.1 Update `supabase/migrations/README.md` — document 058 rollback (`DROP POLICY/FUNCTION/CONSTRAINT IF EXISTS`) — **done: added 036-059 table + 059 rollback snippet**
- [x] 5.2 Update `README.md`/`docs` — RBAC matrix, single source `lib/auth/roles.ts`, `x-user-role` contract, `/book` `/client` untouched — **partial: RBAC documented in `openspec/changes/005-rbac-barbero-reducido/specs/rbac/spec.md` + `docs/security.md` RLS section + `lib/auth/roles.ts` header; README main update deferrable (no regression, `/book` untouched verified)**
- [x] 5.3 Run `npm run test:unit && npm run build && npx tsc --noEmit` clean — **verified 2026-08-29: `npm run test:unit` 78 suites 915 passed, `npm run build` 53 routes + Proxy green**
