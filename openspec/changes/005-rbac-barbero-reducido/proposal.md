# Proposal: RBAC Barbero Reducido

## Intent

Separar roles `owner` / `admin` / `staff` / `barbero` y reducir `barbero` a su operativa mínima: solo ve su agenda, sus servicios asignados y POS limitado a esos servicios. Eliminar acceso a Caja, Inventory y Settings. Hoy `employees.role` es texto libre y `my_business_ids()` no distingue rol; barbero ve todo el dashboard.

## Scope

### In Scope
- `lib/auth/roles.ts` — `getUserRole()`, `isBarbero()`, `role→permissions`
- `proxy.ts` — guard: `/caja|/inventory|/settings` bloqueados para `barbero` (302→`/dashboard`)
- `app/(dashboard)/layout.tsx` — resolve `business+role`, `x-user-role`, redirect
- `components/layout/sidebar.tsx` — nav filtrado (barbero: dashboard/booking/POS; oculta resto)
- Migración `058_rbac_barbero.sql` — constraint role + `current_user_role()` + RLS (barbero solo `employee_id=self`)
- `app/onboarding/*` — selector rol + backfill `employee`→`staff`

### Out of Scope
- `/book/[slug]` y `/client` — sin cambios (`public_read_*` intactas)
- Multi-tenant refactor
- Motor reservas/pagos salvo filtros `employee_id`

## Capabilities

### New Capabilities
- `rbac`: roles canónicos, permisos y helpers centrales
- `barber-scope`: agenda propia, servicios asignados (`employee_services`) y POS filtrado para barbero

### Modified Capabilities
- `dashboard-access`: guards en proxy/layout por rol
- `navigation`: sidebar filtrado por rol

## Approach

Single source `lib/auth/roles.ts`. `proxy.ts` guard temprano (evita flicker) + `x-user-role` header. RLS es enforcement real: barbero filtrado por `employee_id=self`. `layout.tsx` resuelve `owner → employees` y bloquea rutas. Sidebar filtra nav. Migración 058 idempotente (`DO $$`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/auth/roles.ts` | New | Helpers rol/permisos |
| `lib/auth-user.ts` | Modified | Propaga rol |
| `proxy.ts` | Modified | Guard + `x-user-role` |
| `app/(dashboard)/layout.tsx` | Modified | Resolve + block |
| `components/layout/sidebar.tsx` | Modified | Nav filtrado |
| `supabase/migrations/058_*` | New | Constraint + RLS |
| `app/onboarding/*` | Modified | Selector rol |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RLS rompe owner/admin | Med | Policies permisivas owner/admin; test auth vs anon |
| Bypass API barbero | Low | RLS filtra en DB |
| Migración no idempotente | Low | `if not exists` guards |

## Rollback Plan

Revertir 058 (`DROP POLICY`, restore `text`), revertir `proxy/layout/sidebar` a `main`, eliminar `lib/auth/roles.ts`. Sin pérdida datos.

## Dependencies

- `my_business_ids()` (`001`/`005`) + Supabase RLS
- Next.js 16 `proxy.ts` + `lib/supabase/server`

## Success Criteria

- [ ] Barbero: solo agenda/servicios/POS propios; Caja/Inventory/Settings → redirect
- [ ] Owner/Admin/Staff sin regresión
- [ ] `/book` y `/client` intactos
- [ ] RLS: barbero no lee `cash_registers` ni appointments ajenos
