# Tasks: Escudería Integración Completa

**Input**: `specs/003-escuderia-integration/spec.md`, `plan.md`

## Phase 1: Setup

- [x] T001 Crear feature `003-escuderia-integration` + spec (3 stories, 8 FR)
- [x] T002 Crear `044_locations.sql` (business_id, slug unique, RLS, seed Centro)

## Phase 2: Landing Dinámica (P1)

- [x] T003 `app/escuderia/page.tsx` SSR: `business` + `services` + `employees` + `hours` + `count appts/emps` via `createClient` (no hardcode)
- [x] T004 Hero `heroStats` dinámico (`7.863` → `count.toLocaleString`), `horario`/`diasAbiertos` desde `business_hours`, `bizPhone`/`bizAddress`/`bizName`/`currency` desde `businesses`
- [x] T005 Verificar `curl /escuderia` 200 con `ESCUDER` y `COP`, sin hardcode rebuild

## Phase 3: Admin Seguro (P1)

- [x] T006 `proxy.ts` add `/caja` a `protectedPaths`, comment single→multi, keep `x-user-id` overwrite (no spoof)
- [x] T007 `app/(dashboard)/layout.tsx` owner → employee fallback via `my_business_ids()` (barbero login futuro), redirect `/onboarding` si no business
- [x] T008 Verificar `curl /dashboard` 307 sin auth, `supabase gen types` 1099 lines incluye `locations`

## Phase 4: Multi-sede Prep (P2)

- [x] T009 `044` adds `employees/services/appointments/inventory_items.location_id` nullable FK + indexes, no break single
- [x] T010 `npm run build` 51 rutas, `npm run test:unit` 29 tests, `/escuderia` 200
