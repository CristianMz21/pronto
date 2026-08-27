# PRONTO — AUDITORÍA INICIAL

**Fecha**: 2026-08-27 | **Commit base**: `SGrappelli/pronto@1a50f5f` | **Auditor**: Spec Kit 001
**Entorno verificado**: Node 24.11.1 / npm 11.6.2 / Docker 29.7.2 / Compose v2.40.3 / Next 16.3.2

## Estado de ejecución

- **Docker**: `docker compose config` OK (migrate + app, `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` hardcodeado, healthcheck `wget /api/health`). `npm ci` + `npm run build -- --webpack` **OK** (Serwist bundle `/sw.js`, 45 rutas, PWA `additionalPrecacheEntries /offline`).
- **Lint**: `eslint .` **16 warnings, 0 errors** (solo `react-hooks/set-state-in-effect` en `booking-form`, `OnboardingWizard`, `date-picker`).
- **Local run**: Bloqueado hasta configurar Supabase real en `.env` (`NEXT_PUBLIC_SUPABASE_URL` placeholder `your-project.supabase.co`, `DATABASE_URL` placeholder). `.env` ya generado con `CRON_SECRET=8c7a1001...` e `INTERNAL_API_SECRET=9490ca6b...` (T001). Sin credenciales reales, `migrate` no puede aplicar 001..035 — build y config validados, DB no.
- **Tests**: `vitest run` **2 files, 14 tests PASSED** (nuevo: `utils-currency` 7 + `booking-availability` 7). Antes: solo `lint`. Playwright placeholder `tests/e2e/booking-to-pos.spec.ts` skip hasta seed.

## Estado de tests

- **Antes**: `package.json` solo `lint` + `db:generate`. Sin unit/integration/e2e.
- **Ahora (T007)**: `vitest 4.1.11 + jsdom + @testing-library/react/jest-dom + @playwright/test` instalados, `vitest.config.ts` + `tests/setup.ts`, scripts `test:unit`, `test:unit:watch`, `test:e2e`, `test:coverage`. Cobertura objetivo ≥80% en críticos (precios, disponibilidad, comisiones, caja, inventario).

## Arquitectura

Ver `docs/architecture.md` completo. Resumen: Next.js App Router con `(auth)/(dashboard)/(public)/book/[slug]`, API Routes `book/appointments/clients/inventory/cron/email/health`, `proxy.ts` SSR + `lib/auth-user.ts` cache `x-user-id`, `lib/booking-availability.ts` source of truth, `lib/offline-db.ts` IndexedDB, Serwist PWA (`app/sw.ts`), i18n `next-intl`, `supabase/migrations/001..035`.

## Stack

Next.js 16.3.2 + React 19.2.8 + Tailwind + shadcn/Radix + Supabase SSR 0.10.2 + supabase-js 2.103 + Serwist 9.5 + next-intl 4.9 + Zod + DomPurify + xlsx + lucide + date-fns + nodemailer/resend. Node 20 Alpine Docker `standalone`. Verificado `package.json`.

## Base de datos

34 migraciones `001..035` (ver `supabase/migrations/`). Core `businesses/employees/services/clients/appointments/transactions/inventory_items/movements` (001), `notification_log` (002), `business_hours + get_booked_slots` (009), `email_provider` (015), revoke anon (016), **doble reserva 017→019→031→032** (032 atomic con `pg_advisory_xact_lock` para específico y `NULL` Anyone auto-assign), `unique_sku` (018), `performance_indexes` (023), `brand_color` (024), `client_phone_unique` (025), `search_tx_items_fn` (028), `security_advisor_fixes` (030), `whatsapp_business_columns` (033), `no_staff_available` (034), `business_hours_break` (035). RLS `my_business_ids()` en toda tabla (005/030 con `search_path=public`).

## Auth

Supabase Auth Email + Google OAuth via SSR. `proxy.ts` valida `auth.getUser()` una vez y propaga headers. `lib/auth-user.ts` cache. Protege `/(dashboard|pos|crm|inventory|booking|settings)` → `/login`. Auto-locale `Accept-Language` → cookie `dashboard_locale`. Riesgo: `api/*` no detrás de proxy, depende de `service_role` + filtro `business_id`.

## Reservas

`book/[slug]/page.tsx` Server + `booking-form.tsx` Client (steps service→employee→datetime→contact→done, `generateSlots` + `computeEffectiveHours` + `get_booked_slots(employee_id)`), POST `api/book/route.ts` Zod+DomPurify+rateLimit(20/10m) + `checkSlotWithinHours` + upsert client OR bug-8/9/10 + insert `confirmed` con `parseDateTimeInTz(business.timezone)` + fire-and-forget `api/email/confirm`. Trigger 032 evita doble reserva y `019/031` overlap interval. **Hardening ok, pero** `rateLimit` comentario dice 5 pero código 20, y `fora de horario` ya validado server-side.

## CRM

`crm/page.tsx` lista + `crm/[id]/client-detail-view.tsx` + `crm/new/new-client-form.tsx`, CSV import `api/clients/import` (Fresha/Vagaro/etc), `tags/birthday/total_visits/spent/last_visit_at` via trigger 008. Phone unique por business (025). **Ok**, falta `preferences/status VIP` y ficha profunda.

## POS

`pos/pos-terminal.tsx` cart, descuento, `cash/card/transfer`, `bookingContext`, IndexedDB `offline-db.ts` queue+`syncQueue()` al online, `pos/history` con búsqueda `028`. **Ok offline**, falta flujo productos inventario integrados + comisión.

## Inventario

`inventory/*` lista/tabs/sales-tab, `api/inventory/*` CRUD+import/export/xlsx + lookup, `unique_sku` (018), `retail_barcode` (027), `useBarcodeScanner.ts`, movimientos, low-stock `api/email/low-stock`. **Completo**.

## Notificaciones

`lib/email.ts + mailer.ts` (Resend/SMTP por `businesses.email_provider`), `lib/whatsapp.ts` Meta v20 E.164 sin '+', `lib/telegram.ts/viber.ts`, `offers/tpl*`, `api/cron/notify` (pg_cron 007 optional, fallback cron-job.org con `CRON_SECRET`), `api/email/confirm/low-stock`. **Infra lista**, falta plantillas ES-CO + logs/reintentos.

## PWA

`app/sw.ts` Serwist con `runtimeCaching NetworkFirst supabase-data`, `fallbacks /offline`, `additionalPrecacheEntries ['/offline']` (fix precache), `disable` en dev (Turbopack), `reloadOnOnline:false`. `public/manifest.json`, `offline/page.tsx`. **Migración next-pwa→Serwist OK**. Falta test install touch.

## Seguridad

RLS en toda tabla (005/030), `my_business_ids()` stable, 016 revocó `public_read_businesses_for_booking` raw (cerró fuga `smtp_pass/resend_api_key`), `proxy.ts` correcto. **Pendientes**: `api/*` import sin `rateLimit`/`DomPurify`/`business_id` check exhaustivo, `CRON_SECRET` vs `INTERNAL_API_SECRET` separados OK, `Security Advisor` baseline aún sin credenciales reales (0 flags teórico).

## Problemas críticos

1. `lib/utils.ts:formatCurrency` hardcode `en-US/USD` → rompe COP (FIXED T008: parametrizado `CURRENCY_LOCALE`, `es-CO` para COP, NBSP normalizado, 7 tests).
2. `appointments.status` solo `pending/confirmed/completed/cancelled/no_show` → incongruente con FSM barbería `Scheduled→Confirmed→Checked-in→In-service→Completed` (plan mig 039).
3. Sin `employee_services` / `employee_unavailability` → se puede asignar barbero no capacitado o de vacaciones.
4. Sin `commissions` / `cash_registers` → no hay trazabilidad caja ni pago barberos.
5. Sin tests (FIXED T007 parcial: vitest+playwright instalados, 14 tests).

## Problemas importantes

- `api/book` rateLimit discrepancia comentario vs código (5 vs 20).
- `npm audit` 9 vulnerabilidades (2 low, 2 moderate, 5 high) post `vitest` install — revisar `npm audit fix`.
- Lint 16 warnings `set-state-in-effect`.
- `DATABASE_URL` placeholder bloquea `migrate` — requiere `openssl rand -hex 32` ya hecho, pero Supabase URL/keys faltan.

## Deuda técnica

- `formatCurrency` ya resuelto; queda extender `formatDate/formatTime` locale param si needed.
- Trigger 032 comentario menciona "any active employee can perform any service" — diseño actual no restringe, T016/T017 lo corrigen.
- `public/sw.js` regenerado en cada build, no commit (ok).
- `TECHNICAL_AUDIT.md` + `Pronto_MVP_v4.docx` en gitignore histórico — no afecta.

## Funciones faltantes (vs spec 001 FR-006..FR-018)

- Barberos: `color, specialties[], commission_rate, horario bar, vacaciones, role enum`.
- Servicios: `cost, allowed_employee_ids` (tabla puente).
- Agenda: FSM estados + `employee_unavailability`.
- Caja/comisiones/reportes: tablas + UI + triggers.
- Localización completa es-CO/COP más allá de `formatCurrency` (fecha/hora).

## Funciones ya existentes

Bookings (con hardening transaccional), CRM (con CSV), POS offline, Inventory (con barcode/xlsx), Notifications infra (email+telegram/whatsapp/viber), PWA Serwist, i18n base, Dashboard sparkline, Settings `business_hours` con break, Modules toggle, Docker `standalone`.

## Riesgos

- Sin `DATABASE_URL` real, 007 `pg_cron` skip y `migrate` no aplica 032 — doble reserva no probada en DB real. Mitigado con `docker compose config` + `npm run build` + unit `booking-availability` tests, pero requiere Supabase antes de FASE 3.
- `service_role` en `api/*` sin `business_id` check exhaustivo → cross-tenant leak si endpoint olvida filtro.
- NBSP es-CO en COP puede romper snapshots si no normalizado (ya normalizado con `replace \u00A0`).

## Recomendación

**Fase 1 parcialmente completada**: T001/T004/T005/T007/T008/T009 OK, T006 build verificado pero `docker compose up` requiere completar `.env` con Supabase proyecto. Próximo paso: usuario crea proyecto Supabase (`supabase.com`), copia `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY/DATABASE_URL` en `.env`, crea bucket `inventory`, desmarca Confirm email, luego `docker compose up -d` y smoke tests `lint/build/test:unit` ya verdes (14/14). Luego continuar con FASE 3 barbería (migraciones 036..041) vía `/speckit.implement`.
