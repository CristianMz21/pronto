# Research: Barbería SaaS Integral — Escudería (006)

**Branch**: `006-barberia-saas-integral` | **Date**: 2026-08-28 | **Spec**: `spec.md`

## Phase 0 — Auditoría Pronto (57 migraciones, Next.js 16 + Supabase)

### Stack verificado

- `package.json:1` Next 16.3.2, React 19.2.8, Tailwind, shadcn/radix, Supabase JS, Serwist 9.5.12, next-intl 4.9.0, `resend/smtp/telegram/viber/whatsapp`, `next.config.js output: standalone`, `proxy.ts` SSR guard, `lib/supabase/{client,server,service}`, `lib/booking-availability.ts`, `lib/offline-db.ts`, `lib/auth/roles.ts` (005 RBAC).
- 57 migraciones: 001 core + 002-013 notifs/billing + 014-016 security + 017/019/031/032 double-booking (+advisory lock) + 018 sku + 020-035 pricing/brand/phone/modules/break + 036-040 barber extra/services/unavailability/FSM/availability + 041-043 cash/commissions + 044 locations + 045-052 hardening + 053-057 past-bookings/lead-time/cash-config/auth-guest.
- `docs/architecture.md`, `docs/security.md`, `docs/database.md` como fuente.

### Gaps 006 vs existente

| Módulo 006 | Estado Pronto | Gap a cerrar |
|------------|---------------|--------------|
| Clientes/preferencias/barbero habitual/cumple | ✅ tags/birthday/visits/spent | `preferences jsonb`, `preferred_barber_id`, `location_id`, segmentos 42d/cumple, import CSV ok, falta portal `/client` 1-click |
| Barberos como ruta propia | ⚠️ solo `employees` cols 038 | Falta ruta `/barberos` premium + filtro `location_id` + `employee_services` UI |
| Servicios + combos | ⚠️ capacity ok | Falta ruta `/servicios` + `service_combos` |
| POS/inventario | ✅ POS + offline-db + low-stock | Falta `location_id` en inventario + transferencia inter-sede + tax/discount por rol |
| Caja | ✅ 041/055 | Falta segmentar por `location_id` |
| Membresías | ❌ | tabla + consumo en POS/booking + portal cliente |
| Promociones | ❌ | tabla + evaluate/apply + promo_code |
| Fidelización puntos | ❌ | accounts/movements/redemptions |
| CRM campañas | ⚠️ solo `notification_log` + cron 007 | `campaigns` + `recipients` + segmento "Carlos 42d" |
| Reportes avanzados | ⚠️ dashboard sparkline | reportes por sede + export + atribución campaña |
| Multi-sucursal real | ⚠️ 044 `locations` con seed | Falta `location_id` nullable en 6 tablas + RLS + transferencia |
| Lista de espera | ❌ | `waitlist` + notify al liberar slot |
| Citas recurrentes | ❌ | `recurring_appointments` + rrule + generator |
| Propinas | ❌ | `tip_amount` en transactions + `tips` reportable |
| Festivos | ❌ | `holidays` + picker bloqueado |
| Config impuestos | ⚠️ `enabled_modules` | `tax_rate`, `payment_methods[]`, `loyalty_*`, `cancel_lead_time` por location |

### Decisiones técnicas (Phase 0 Research)

#### 1. Why Not Django (ADR resumida, ver plan.md)

- **Alternativas evaluadas**: (a) Keep Next.js+Supabase, (b) Django DRF + Next frontend, (c) Supabase Edge Functions para lógica pesada.
- **Elección**: (a). Django duplica auth/RLS, rompe PWA offline, exige 2 deploys y reescribir 57 migraciones. Edge Functions se reserva para BI futuro, no MVP.
- **Verificación**: `docs/architecture.md` ya documenta stack congelado; constitución VII lo blinda sin ADR.

#### 2. Recurrencias: `rrule` vs custom `interval_days`

- **Alternativas**: `rrule` (RFC 5545) vs columna `repeat_every_n_days` + cron.
- **Elección**: `rrule` (`npm i rrule`, ~10kB, 0 CVEs, usada por Google Calendar). Soporta `FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=6;UNTIL=...` sin reinventar. Validación por ocurrencia contra `checkSlotWithinHours`.
- **Rechazo custom**: no soporta mensual/BYDAY sin parser + igual necesita tests.
- **Mitigación**: `rrule` solo en `lib/recurring.ts` + `api/recurring` + `api/cron/recurring-generate`; no toca booking crítico.

#### 3. Waitlist diseño

- **Alternativas**: cola FIFO en DB vs Redis vs `notification_log` reuse.
- **Elección**: tabla `waitlist` FIFO (`ORDER BY created_at`) + `notification_log` deduplicado. Al `UPDATE appointments SET status=cancelled`, trigger o `api/appointments` encola `notifyWaitlist(location_id, service_id, employee_id, starts_at)` → `campaign` implícita 1:1.
- **Ventana notify**: 30m para confirmar; expira → siguiente en fila. RateLimit 10/h por cliente.

#### 4. Membresías / Promociones / Puntos

- **Membresías**: `client_memberships(remaining, expires_at)` con `pg_advisory_xact_lock(id)` en consumo; trigger `remaining>0` + `expires_at>now()`.
- **Promociones**: 1 por transacción salvo `rules.allow_stack=true`; evaluación server-side en `lib/promotions.ts:evaluate(client, service, date, location)`.
- **Puntos**: `loyalty_accounts(points)` + movements; `earn 1pt/$1k` configurable `businesses.loyalty_earn_rate`; redeem `100pts=$10k` configurable.

#### 5. Multi-sucursal `location_id` nullable

- **Por qué nullable**: no rompe single-sede (Escudería Centro ya con `11111111-...`); `UPDATE ... SET location_id = Centro WHERE location_id IS NULL` idempotente en migración seed.
- **Índices**: `idx_*_location(business_id, location_id)` para filtrar sin seq scan.
- **RLS V1**: `business_id IN my_business_ids()` suficiente; V2 añade `my_location_ids()` para `manager` single-sede.

#### 6. Cron: `pg_cron` opcional + fallback

- **Migración 007 ya** `DO $$ IF EXISTS pg_cron ELSE RAISE NOTICE`. Se replica patrón para `recurring-generate` (09:00) y `campaigns:42d` (09:00) y `waitlist-expire`.
- **Fallback**: `cron-job.org GET /api/cron/notify + /api/cron/recurring-generate` con `CRON_SECRET`. Local sin extensión no bloquea `supabase db reset`.

#### 7. PWA & Offline

- **Verificado**: `app/sw.ts` Serwist con `fallbacks /offline`, `additionalPrecacheEntries ['/offline']` (sin esto, offline = network error). `lib/offline-db.ts` ya probado para POS.
- **Decisión**: no offline para reservas/caja (integridad); solo POS queue.

#### 8. Festivos & Business Hours

- **Existente**: `business_hours(0-6, is_open, open/close, break)` (009/035).
- **Nuevo**: `holidays(business_id, location_id?, date, reason)` con `is_open=false` por sede; `checkSlotWithinHours` revisa `holidays` antes de `business_hours`.

## References

- `supabase/migrations/032_atomic_slot_allocation.sql` — advisory lock pattern a reutilizar
- `supabase/migrations/040_check_barber_availability.sql` + `039_appointment_fsm.sql` — guards a extender
- `lib/booking-availability.ts` — `effectiveHours` + `generateSlots` + `checkSlotWithinHours`
- `lib/auth/roles.ts` (005) — RBAC single source
- `docs/architecture.md` + `docs/security.md` + `.specify/memory/constitution.md v2.0.0`
