# Research — Pronto Barber Platform

**Feature**: `001-pronto-barber-platform` | **Date**: 2026-08-27

## Auditoría Pronto (FASE 0 — evidencias)

**Stack verificado**: `package.json:1` Next 16.3.2 + React 19.2.8, `Dockerfile:1` Node 20 Alpine multi-stage `standalone`, `docker-compose.yml:1` migrate→app con healthcheck, `next.config.js:1` Serwist PWA + `next-intl`, `proxy.ts:1` middleware SSR con `x-user-id` header, `lib/auth-user.ts:1` cache.

**Módulos**: Booking público (`app/book/[slug]/booking-form.tsx` + `lib/booking-availability.ts` source of truth + `app/api/book/route.ts` Zod/DomPurify/rateLimit), CRM (`app/(dashboard)/crm/[id]/client-detail-view.tsx`), POS offline (`app/(dashboard)/pos/pos-terminal.tsx` + `lib/offline-db.ts` IndexedDB), Inventory (`app/(dashboard)/inventory/*` + `supabase/migrations/018_unique_sku.sql` + `027_retail_barcode.sql`), Dashboard mínimo, Settings (`business_hours` 009+035 con `break_start/end`).

**DB**: 32 migraciones `001..035`, RLS en toda tabla via `my_business_ids()` (005), `my_business_ids()` + `public_read_*` para booking (009) revocado en 016 para cerrar exposición `smtp_pass/resend_api_key`, triggers de disponibilidad `017→019→031→032` (032 introduce `pg_advisory_xact_lock` para "Anyone" NULL y race específico), `028_search_tx_items_fn.sql` para POS history, `014_get_booked_slots_employee.sql` por empleado.

**Gaps para barbería** (ver `spec.md` FR-006..FR-018): sin `employee_services`, sin `employee_unavailability`, `employees.role` string libre, `appointments.status` legacy, sin comisiones/caja, `formatCurrency` hardcodeado `en-US/USD` (`lib/utils.ts:8`), dashboard/reportes mínimos, sin tests.

## Decisiones Técnicas

### 1. No reescribir — extender Pronto
**Decisión**: Mantener Pronto como base, especializar alrededor de módulos existentes.
**Alternativas**: Fork "Barbería" separado, greenfield propio.
**Razón**: Preset `Salon/Barbershop = Bookings+CRM+POS+Inventory+Notifications` ya coincide con necesidad (README). Costo de reescribir disponibilidad transaccional + PWA offline + RLS desde cero es 10x.
**Riesgo**: Deuda técnica upstream se hereda; mitigado con auditoría FASE 0 y branches `upstream-*` vs `barber-*`.

### 2. Concurrencia citas: preservar trigger 032 + extender validación horario server-side
**Decisión**: Reusar `check_slot_availability()` (032) tal cual; agregar segundo trigger `check_barber_availability()` para validar `business_hours` + `employee_unavailability` + `employee_services` antes de insert.
**Alternativas**: Pasar a `SELECT ... FOR UPDATE` app-level, o unique index parcial.
**Razón**: Unique index no cubre intervalos overlap ni capacity>1 ni "Anyone" NULL; app-level lock no es transaccional bajo `READ COMMITTED`.
**Evidencia**: 032 ya resuelve 2 bugs confirmados con test de concurrencia 5/5 paralelas (comentario migración).

### 3. Localización COP/es-CO sin hardcode
**Decisión**: Parametrizar `formatCurrency(amount, currency)` via `Intl.NumberFormat(locale, {currency})` + `businesses.currency/timezone`; `messages/es.json` existente es base para `es-CO`.
**Alternativas**: Hardcodear `es-CO/COP` global.
**Razón**: Regla 21: evitar bloquear otra moneda/locale futura; `businesses.timezone` ya existe (001) y `currency` también.

### 4. FSM citas: extensión aditiva
**Decisión**: Migrar `036_extend_appointment_status.sql` → `CHECK (status IN ('pending','confirmed','scheduled','checked_in','in_service','completed','cancelled','no_show','paid'))` + trigger que normaliza `pending→scheduled` legacy.
**Alternativas**: Renombrar columna o crear `appointment_events` event-sourcing.
**Razón**: Menor riesgo; app actual usa `pending/confirmed` y seguiría funcionando; nueva UI usa `scheduled/checked_in/in_service`.

### 5. Comisiones/Caja: tablas dedicadas, no JSON en transactions
**Decisión**: `commissions(id, business_id, appointment_id, transaction_id, employee_id, service_id, amount, rate, type)` + `cash_registers` + `cash_movements` + trigger `update_client_stats` existente (008) sigue para `total_visits/spent`.
**Alternativas**: Calcular on-the-fly en reportes, o guardar en `transactions.items`.
**Razón**: Auditabilidad y queries por barbero/periodo sin parsear JSON; RLS por `business_id`.

### 6. Testing stack
**Decisión**: Vitest (unit) + Supabase local (integration) + Playwright (E2E). Hoy solo `eslint` baseline.
**Alternativas**: Jest, Cypress.
**Razón**: Vitest es nativo Vite/Next, Playwright cubre PWA offline; Jest requiere más config con Next 16/Turbopack.

### 7. Spec Kit workflow con integración opencode
**Decisión**: `specify init --integration opencode` (`.opencode/commands/`, `.specify/`), constitución versionada, specs en `specs/###-name/`, planes en `plan.md`, tasks por user story.
**Alternativas**: `branch-pr` / `chained-pr` skills (Gentle AI), o gestión ad-hoc en `docs/`.
**Razón**: Usuario pidió explícitamente `github/spec-kit` para trazabilidad; opencode es el agent runtime disponible (`specify check` confirma `opencode available`). `branch-pr` queda compatible para PRs posteriores.

## Research Backlog (para `quickstart.md` / `data-model.md`)

- Verificar `supabase/migrations/009_business_hours.sql` límites de `open_time/close_time` y default `Mon-Fri 09:00-19:00` vs barbería Colombia 09:00-20:00 — ya hay `computeEffectiveHours` fallback `DEFAULT_HOURS`.
- Confirmar `app/api/cron/notify/route.ts` auth via `CRON_SECRET` y `INTERNAL_API_SECRET` separados — no reutilizar mismo secret.
- Medir `lib/offline-db.ts:DB_VERSION=1` migración si se agregan stores para `cash_registers` offline — evaluar bump.
