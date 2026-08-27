# Architecture — Pronto Barber

**Fecha**: 2026-08-27 | **Branch**: `001-pronto-barber-platform` | **Base**: `SGrappelli/pronto@1a50f5f`

## Resumen

Pronto es un sistema de gestión multi-módulo (Bookings + CRM + POS + Inventory + Notifications) construido con Next.js 16 App Router + Supabase (PostgreSQL + Auth + Storage) + Serwist PWA + Docker `standalone`. La estrategia correcta es extenderlo, no reescribirlo. Este documento describe la arquitectura verificada leyendo código, no solo README.

## Stack

| Capa | Tech | Evidencia |
|------|------|-----------|
| Frontend | Next.js 16.3.2 + React 19.2.8 + Tailwind + shadcn/ui (Radix) | `package.json:1`, `app/layout.tsx`, `components/ui/*` |
| Backend | Next.js API Routes (App Router) | `app/api/{book,appointments,clients,inventory,cron,health,telegram,viber,email}` |
| DB | Supabase PostgreSQL + RLS + pg_cron/pg_net opcional | `supabase/migrations/001..035`, `scripts/migrate.js` |
| Auth | Supabase Auth (Email + Google OAuth) via SSR | `proxy.ts`, `lib/supabase/{client,server,service}.ts`, `lib/auth-user.ts` |
| Storage | Supabase Storage bucket `inventory` | `app/api/inventory/[id]/photo/route.ts` |
| PWA | Serwist 9.5.12 (`app/sw.ts` → `public/sw.js`) | `next.config.js:withSerwist`, `offline/page.tsx` |
| i18n | next-intl 4.9.0 (en, es, it, pt) | `i18n/request.ts`, `messages/*.json`, `proxy.ts` locale |
| Notifs | Resend/SMTP + Telegram + Viber + WhatsApp Meta Cloud v20 | `lib/{mailer,email,telegram,viber,whatsapp}.ts` |
| Deploy | Docker multi-stage `standalone` | `Dockerfile`, `docker-compose.yml` (migrate + app + healthcheck) |

## Estructura del Proyecto

```
app/
├── (auth)/login,register,forgot-password,reset-password
├── (dashboard)/booking, crm, dashboard, inventory, pos, settings
│   └── layout.tsx (sidebar + header)
├── (public)/privacy,terms,refund
├── book/[slug]/page.tsx + booking-form.tsx  # pública sin cuenta
├── onboarding/OnboardingWizard.tsx + actions.ts
├── api/
│   ├── book/route.ts          # booking público Zod + DomPurify + rateLimit
│   ├── appointments/[id]/route.ts  # PATCH employee_id (unassign)
│   ├── clients/import/route.ts, inventory/{route,import,export,sales,lookup}
│   ├── cron/notify/route.ts   # protegido por CRON_SECRET
│   ├── email/{confirm,low-stock}, health, telegram/viber webhooks
│   └── business/modules, check-slug, user/locale
├── auth/callback/route.ts, check-email, es/*, landing, sw.ts, sitemap.ts
components/{clients,inventory,layout, onboarding-checklist, ui}
lib/{auth-user, booking-availability, supabase/*, offline-db, modules, rate-limit, plan-limits, email, mailer, gcal, telegram, viber, whatsapp, utils}
supabase/migrations/001..035 + certs/supabase-ca.crt + email-templates
hooks/useBarcodeScanner.ts, i18n/request.ts, messages/*.json
public/{manifest.json, site.webmanifest, icons, logo}
scripts/{migrate.js, generate-icons.js}
```

## Base de Datos (34 migraciones)

| Rango | Propósito |
|-------|-----------|
| 001 | Core: `businesses, employees, services, clients, appointments (pending/confirmed/completed/cancelled/no_show), transactions, inventory_items/movements`, RLS + `my_business_ids()` + `receipt_seq` |
| 002-006 | `notification_log`, telegram/viber tokens, billing `plan`, `viber_user_id` |
| 007 | `pg_cron` → `GET /api/cron/notify` (env-interpolated, optional, skipped si sin extension) |
| 008 | Trigger `client_stats` (`total_visits/spent/last_visit_at` en `clients` tras `transactions`) |
| 009 | `business_hours (day 0-6, is_open, open_time, close_time)` + `get_booked_slots` RPC |
| 010-013 | `whatsapp_number`, `owner_whatsapp`, `onboarding_completed` |
| 014 | `get_booked_slots(p_employee_id)` filtrado por empleado |
| 015-016 | `email_provider` (smtp/resend) por negocio + revoke `public_read_businesses_for_booking` raw |
| 017-019-031-032 | **Doble reserva**: 017 (equality), 019 (interval overlap + capacity), 031 (fix interval + capacity), **032 (atomic con `pg_advisory_xact_lock` para específico y "Anyone" NULL auto-assign)** |
| 020,023-035 | `appointment_paid`, índices perf, `brand_color`, phone unique, `enabled_modules`, barcode, `search_tx_items_fn`, notification_language, security advisor, WhatsApp columns, `no_staff_available` distinguish, `business_hours_break` |

**RLS**: `my_business_ids()` union `businesses.owner_id = auth.uid()` + `employees.user_id = auth.uid()`. Grants `anon,authenticated` en toda tabla (001). 005/030 corrigen `search_path`.

## Flujos Críticos

### Auth

`proxy.ts` → `createServerClient` SSR → `auth.getUser()` una vez → propaga `x-user-id`/`x-user-email` → `lib/auth-user.ts:cache` lee headers (evita round-trip). Protege `/dashboard,/pos,/crm,/inventory,/booking,/settings` hacia `/login`. Auto-detect locale via `Accept-Language` → cookie `dashboard_locale`.

### Booking público

`book/[slug]/page.tsx` (Server) carga `business, services, employees, workingHours` + `computeEffectiveHours` (default Mon-Fri 09-19) → `booking-form.tsx` (Client) steps `service→employee→datetime→contact→done`, genera slots `generateSlots(open,close,duration)` + filtro break + `get_booked_slots` → POST `/api/book` (Zod, sanitiza `name` con DomPurify, requiere `phone||email`, valida `service.business_id` + `checkSlotWithinHours`, upsert client por `phone/email OR`, inserta `appointments confirmed`, fire-and-forget `fetch /api/email/confirm` con `INTERNAL_API_SECRET`).

### Concurrencia

Trigger `check_slot_availability()` BEFORE INSERT/UPDATE: si `employee_id NOT NULL` → `pg_advisory_xact_lock(business:employee)` + `COUNT overlap < capacity`; si `employee_id NULL` → lock `business:service:alloc` + busca `SELECT e.id ... WHERE COUNT overlap < capacity LIMIT 1` → asigna `NEW.employee_id:=found` o `RAISE slot_already_booked/no_staff_available`.

### POS offline

`pos-terminal.tsx` cachea `services/employees/clients` en IndexedDB (`lib/offline-db.ts:pending_transactions, services_cache`), `navigator.onLine` listener, `syncQueue()` loop al volver online: `insert transactions` + `markTransactionSynced`. `pos/page.tsx` Server pasa `bookingContext` (appointment→POS).

### PWA

`app/sw.ts` Serwist con `runtimeCaching NetworkFirst supabase-data`, `fallbacks /offline`, `additionalPrecacheEntries ['/offline']` (sin esto offline sería network error), `disable: NODE_ENV=development` (incompatible Turbopack).

## Seguridad (baseline para T009)

- **RLS**: OK en toda tabla, pero `api/*` usa `createServiceClient` (service_role) — depende de checks `auth.getUser()` + `business_id in my_business_ids()` a nivel query, no solo RLS. Riesgo: si endpoint olvida `.eq('business_id', business.id)`, filtra cross-tenant.
- **009→016**: Pública `public_read_*` para booking ahora cerrada; booking usa service-role server-side (correcto).
- **Rate limit**: solo en `/api/book` (`20/10min` bug: comentario dice 5 pero code 20). Falta en `import` endpoints.
- **XSS**: solo `api/book` sanitiza; otros `api/*` no validan DOMPurify.
- **Secrets**: `businesses.smtp_pass/resend_api_key/telegram_bot_token/meta_whatsapp_access_token` en DB — RLS los protege pero 001 les daba `GRANT ALL anon` antes de 016; ahora 016 revoca.

## Gaps para Barbería (mapeo a spec)

| Spec FR | Estado Pronto | Gap |
|---------|---------------|-----|
| FR-005 Clientes | ✅ tags/birthday/visits/spent | falta `preferences, status VIP` |
| FR-006 Barberos | ⚠️ solo 7 cols | falta `color, specialties, horario/bar, vacaciones, commission` + `role enum` |
| FR-008 Servicios | ⚠️ `capacity` ok | falta `cost, employee_services` |
| FR-009-010 Agenda/FSM | ⚠️ interval+capacity ok | falta `scheduled/checked_in/in_service` + `employee_unavailability` |
| FR-013 Comisiones | ❌ | tabla `commissions` |
| FR-014 Caja | ❌ | `cash_registers/movements` |
| FR-017 Dashboard | ⚠️ sparkline | falta operativo completo |
| FR-021 PWA | ✅ | falta test install touch |
| FR-025 Testing | ❌ solo lint | vitest/playwright |

Ver `specs/001-pronto-barber-platform/spec.md` y `data-model.md` para migraciones 036..041 que cierran gaps.

## Decisión Arquitectónica: No Reescribir

Presets README: `Salon/Barbershop = Bookings+CRM+POS+Inventory+Notifications` coincide con barbería. Valor está en hardening + especialización, no greenfield. `upstream` vs `origin` mantiene contribución abierta.

## Diagramas

```
Proxy (SSR) → x-user-id → Server Components → Supabase (RLS via my_business_ids)
Public booking → Client slots (computeEffectiveHours) → POST /api/book → trigger 032 → notification_log → cron → email/telegram/whatsapp
POS → IndexedDB queue → syncQueue → transactions → trigger 008 → clients.total_* → commissions
```

## Infra

- `docker-compose.yml`: `migrate` (one-shot `scripts/migrate.js` con retry + `certs/supabase-ca.crt` verify) → `app` (3000, `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` hardcodeado)
- `next.config.js`: `output standalone`, `serverActions allowedOrigins` (appHost), `images remotePatterns supabase.co/r2`, `additionalPrecacheEntries /offline`
