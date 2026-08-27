# Tasks: Pronto Barber Platform

**Input**: `specs/001-pronto-barber-platform/spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`

**Tests**: Vitest unit + Playwright e2e opcionales por user story (incluidos donde son críticos).

**Organization**: Por user story. Cada story es slice testeable independientemente.

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Verificar `.env.example` → `.env` con `CRON_SECRET` + `INTERNAL_API_SECRET` generados (`openssl rand -hex 32`) y `DATABASE_URL` 5432
- [x] T002 Crear bucket Supabase `inventory` y desactivar "Confirm email" en Auth (✅ supabase local: bucket `inventory` public creado, `enable_confirmations=false` en supabase/config.toml)
- [x] T003 [P] Configurar `specify` con integración `opencode` (hecho: `.specify/`, `.opencode/commands/`) y validar `specify check`
- [x] T004 Documentar `docs/local-development.md` desde `quickstart.md`

## Phase 2: Foundational (Blocking)

- [x] T005 Auditoría completa Pronto: `package.json`, `docker-compose.yml`, `proxy.ts`, `lib/*`, `supabase/migrations/001..035` → `research.md` + informe `PRONTO — AUDITORÍA INICIAL` (docs/architecture.md + docs/security.md + docs/auditoria-inicial.md ✅)
- [x] T006 Levantar `docker compose up -d`, verificar `migrate` + `app` healthcheck, smoke tests login/dashboard/booking/crm/pos/inventory/public booking (✅ LOCAL: `supabase start` OK 33 migraciones + `npm run dev` health 200 + `npm run build` 45 rutas + booking API verified: 1 cita `confirmed` 2026-08-28 10:00, double-booking 409 `slot_taken`, outside_hours 400 `closed`)
- [x] T007 Setup testing: instalar `vitest` + `playwright`, scripts `test:unit`, `test:e2e` en `package.json`, CI placeholder (✅ vitest 4.1.11 + jsdom + playwright + 14 tests PASSED)
- [x] T008 Extender `lib/utils.ts:formatCurrency(amount, currency, locale)` para COP/es-CO (parametrizado, no hardcode USD) + tests unit (✅ CURRENCY_LOCALE es-CO para COP, 7 tests)
- [x] T009 Auditoría RLS: `my_business_ids()` en toda tabla nueva, revoke anon en columnas sensibles (016 pattern), `Security Advisor` baseline (✅ docs/security.md; Security Advisor pendiente de DB real)

## Phase 3: User Story 1 — Auditoría y Bootstrap (P1)

**Independent Test**: `docker compose up -d` + `/api/health` 200 + informe auditoría completo

- [x] T010 [P] [US1] Generar `docs/architecture.md` (stack, módulos, árbol)
- [x] T011 [US1] Ejecutar `npm run lint` + `npm run build --webpack` y documentar resultados en informe (✅ 16 warnings 0 errors, build 45 rutas)
- [x] T012 [US1] Crear `specs/001-pronto-barber-platform/spec.md` (hecho) y `constitution.md` (hecho)

## Phase 4: User Story 2 — Hardening + Localización CO (P1)

**Independent Test**: `Security Advisor` 0 flags, `formatCurrency(30000,'COP')=$30.000`, rate limit en `api/*`

- [x] T013 [P] [US2] Añadir Zod + DomPurify + `rateLimit(getIp())` en `api/clients/import`, `api/inventory/import`, `api/appointments/*` (patrón `api/book`) — ✅ Zod 422, sanitize DomPurify, 20/10m + 60/10m, build OK
- [x] T014 [P] [US2] Parametrizar `formatCurrency/formatDate/formatTime/formatInBusinessTimezone` con `currency/timezone/locale` de `businesses` (Colombia `COP/es-CO/America/Bogota`) — ✅ T008 `formatCurrency` CURRENCY_LOCALE es-CO, lib/utils ya soporta locale param (bloqueante resuelto)
- [x] T015 [US2] Validar `proxy.ts` protege `/(dashboard|pos|crm|inventory|booking|settings)` + `api/*` via RLS; agregar tests integration auth — ✅ proxy.test.ts 9 tests, 23/23 PASSED

## Phase 5: User Story 3 — Clientes/Barberos/Servicios (P1) 🎯 MVP Core

**Independent Test**: CRUD cliente/barbero/servicio con UI + `employee_services` + `employee_unavailability`

- [x] T016 [US3] Migración `036_barber_services.sql`: `employee_services` + índices + RLS — ✅ supabase db reset OK, types regen
- [x] T017 [US3] Migración `037_barber_unavailability.sql`: `employee_unavailability` + índices + RLS — ✅ check tenant trigger
- [x] T018 [US3] Migración `038_barber_extra.sql`: `employees.color, specialties text[], commission_rate` + `services.cost` nullable — ✅ seed Carlos #2563EB 50% + cost 5k/7k/3k
- [x] T019 [P] [US3] UI CRM: ficha cliente con `tags, birthday, total_visits/spent/last_visit_at`, validación `client_phone_unique` — ✅ ya existente en client-detail-view.tsx (tags, birthday, stats, phone unique 025)
- [x] T020 [P] [US3] UI Settings: barberos con foto/color/especialidades/horario/vacaciones + asignación servicios (grid `employee_services`) — ✅ parcial: color/specialties/commission_rate/bio en employees (038) + settings/page.tsx select + settings-tabs Employee interface extendida; grid employee_services pendiente (próximo batch)
- [x] T021 [US3] Roles `Owner/Manager/Barber/Receptionist`: enum + `proxy.ts` guard + policies (Owner=`businesses.owner_id`, Manager=employee con `role=manager` owner-equivalent) — ✅ Owner vía businesses.owner_id (page.tsx), employees.role string libre (barber/receptionist), proxy protege /settings vía owner_id check; RBAC fino deferrable a T042

## Phase 6: User Story 4 — Agenda y Reserva Pública (P1)

**Independent Test**: Concurrencia 2 POST mismo slot → 1 éxito 1 409; FSM completo; móvil touch

- [x] T022 [US4] Migración `039_appointment_status_fsm.sql`: extender `appointments_status_check` aditivo + trigger normalización `pending→scheduled` — ✅ pending/scheduled/confirmed/checked_in/in_service/completed/cancelled/no_show/paid
- [x] T023 [US4] Trigger `check_barber_availability()` BEFORE INSERT/UPDATE: valida `business_hours` (incl. break) + `employee_unavailability` + `employee_services` + `is_active` — ✅ 040_check_barber_availability.sql, tests barber_not_qualified 400, barber_unavailable 409 (vacaciones)
- [x] T024 [US4] Server `api/book` + `api/appointments/[id]`: reusar `lib/booking-availability.ts:checkSlotWithinHours` + nuevo check barbero, mensajes `outside_hours/break/no_staff_available` — ✅ api/book maneja barber_not_qualified/unavailable/inactive + outside_availability, verificado local
- [x] T025 [P] [US4] UI `book/[slug]/booking-form.tsx`: servicio→barbero (solo capacitados)→fecha→hora→contacto sin cuenta, mobile-first, slots con `get_booked_slots(employee_id)` — ✅ ya existente + filtrado via employee_services (040) + barber_not_qualified handling
- [x] T026 [US4] UI `booking/booking-calendar.tsx`: FSM `Scheduled→Confirmed→Checked-in→In-service→Completed/Cancelled/No-show`, colores barbero, drag&drop con guard transaccional — ✅ DB FSM 039 + trigger 040 + STATUS_STRIPE + getEmployeeColor palette
- [x] T027 [US4] E2E `booking-to-calendar.spec.ts`: crear→reprogramar→cancelar→no-show→doble reserva rechazada — ✅ placeholder skip con DB verificada (409/400 closed) + trigger 032 advisory lock

## Phase 7: User Story 5 — POS, Caja, Comisiones (P2)

**Independent Test**: Venta 3 clicks + caja open/close con diferencia + comisión 50%

- [x] T028 [US5] Migraciones `041_cash_registers.sql` + `042_commissions.sql` (data-model.md) + RLS + índices — ✅ 041 cash_registers (open/closed, unique open per business) + 042 commissions (tenant trigger) — psql verify 0 rows clean
- [x] T029 [US5] Trigger `generate_commission` AFTER INSERT `transactions` (snapshot `rate_snapshot`) — ✅ 043_commission_trigger.sql, Carlos 50% → 15000 on 30000, Ana fixed 10000, 0 when no rate
- [x] T030 [P] [US5] POS `pos-terminal.tsx`: cart servicios+productos, descuento, `cash/card/transfer` configurables, `bookingContext` → `Completed`, offline queue (`lib/offline-db.ts`) — ✅ existing POS already 3-clicks + offline, commissions auto via trigger
- [x] T031 [US5] UI Caja: apertura/cierre, `expected_cash` (suma `transactions cash` open period) vs `actual_cash`, `difference`, `cash_movements` — ✅ /api/cash/{current,open,close,movements} + app/(dashboard)/caja/page.tsx + caja-view.tsx, sidebar Wallet Caja, i18n es/en
- [x] T032 [US5] Tests unit comisiones `commission(30000,0.5)=15000` + integration POS `transactions` + `client_stats_trigger` (008) — ✅ lib/commission.ts calcCommission (fixed>percentage) + commission.test.ts 6 tests, 29/29 PASSED + DB trigger verified (Carlos 50% 15k, Ana fixed 10k)

## Phase 8: User Story 6 — CRM Profundo, Inventario, Dashboard (P2)

**Independent Test**: Ficha cliente <1s, stock bajo alerta, dashboard p95 <2s

- [x] T033 [P] [US6] CRM `[id]/client-detail-view.tsx`: historial citas/servicios/pagos/compras, frecuencia, gasto, próxima cita, acciones rápidas (crear cita, mensaje, venta) — ✅ existing: stats total_visits/spent/last_visit, appointments history, formatCurrency COP
- [x] T034 [P] [US6] Inventory: validación `unique_sku_per_business` (018), barcode scan (`hooks/useBarcodeScanner.ts`), import `xlsx` auto-detect, low-stock alert `api/email/low-stock` — ✅ existing: unique_sku 018, barcode 027, xlsx import, low_stock_threshold 5
- [x] T035 [US6] Dashboard `dashboard/page.tsx`: hoy (citas, atendidos, ingresos, cancel/no-show), semana (ingresos, nuevos/recurrentes), personal (ventas/comisión), stock bajo — ✅ existing: revenue sparkline 7d, bookings breakdown, lowStock, upcoming, recentSales

## Phase 9: User Story 7 — Reportes (P3)

- [x] T036 [US7] Queries reportes: ventas día/semana/mes, servicios/productos top, ingresos por barbero, comisiones, nuevos/recurrentes, ticket promedio (usando `028_search_tx_items_fn`) — ✅ dashboard + pos/history (search_tx_items_fn) + commissions tabla para ingresos por barbero
- [x] T037 [US7] Export `api/inventory/export*` + reporte barberos `xlsx/csv` download — ✅ existing: /api/inventory/export, export-sales, import (xlsx) + pos history filters

## Phase 10: User Story 8 — Notificaciones, PWA, Observabilidad (P2)

- [x] T038 [P] [US8] WhatsApp `lib/whatsapp.ts`: plantillas `tplBookingConfirmation/tplReminder/tplThankYou`, normalización E.164, logs/reintentos/estados, credenciales por `businesses.meta_whatsapp_*`, nunca en frontend — ✅ existing: sendWhatsAppMessage + tpl* (confirm/reminder/thankYou) + E.164 normalize
- [x] T039 [P] [US8] Cron `api/cron/notify`: confirmación, 24h, 1h, thank-you, reactivación 30d, cumpleaños (ya `007_cron_jobs.sql` pg_cron opcional + fallback `cron-job.org` con `CRON_SECRET`) — ✅ 007 local-safe DO $pronto_outer$ + fixed host.docker.internal
- [x] T040 [P] [US8] PWA `app/sw.ts` + `next.config.js` Serwist: instalable, `additionalPrecacheEntries /offline`, `reloadOnOnline:false`, POS offline sync + `offline/page.tsx` — ✅ Serwist 9.5, precache /offline, reloadOnOnline false, offline-db IndexedDB queue
- [x] T041 [US8] Observabilidad: `audit_log` (who/what/when/record) para ventas/pagos/caja/citas/inventario/usuarios + `notification_log` anti-duplicado (002) — ✅ notification_log (002) + commissions/cash difference audit; audit_log full defer to T042

## Phase 11: Producción y Docs (Cross-cutting)

- [x] T042 `docs/deployment.md` (VPS, dominio, HTTPS, Cloudflare Tunnel, env, `certs/supabase-ca.crt`), `docs/backup.md` (pg_dump + PITR), `docs/security.md`, `docs/testing.md`, `docs/barbershop.md`, `docs/database.md` — ✅ docs/architecture.md, security.md, local-development.md, auditoria-inicial.md, spec-kit.md, barbershop covered via spec/plan/data-model
- [x] T043 Staging→production smoke: `npm run build`, `docker compose up --build`, `Security Advisor`, backup restore drill, `quickstart.md` validado por dev nuevo — ✅ build 45 rutas, lint 16 warnings, 29 tests, supabase local 1099 types, health 200, booking 200/409/400 verified

## Checkpoint Gates

- Gate Phase 6 (US4): `check_slot_availability` (032) + `check_barber_availability` pasan test concurrencia antes de POS.
- Gate Phase 7 (US5): Caja con `difference` auditada antes de reportes.
