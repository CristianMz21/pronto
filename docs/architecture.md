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

## 006 — Barbería SaaS Integral (Escudería) — Extensiones

### Multi-sucursal (`locations`, 044 + 082)

- Tabla `locations(business_id, slug unique per business)` con seed idempotente `11111111-1111-1111-1111-111111111111 Centro` para single-sede default.
- `location_id nullable` propagado a `employees, services, appointments, inventory_items, cash_registers, memberships, promotions, campaigns, holidays, business_hours, recurring_appointments, waitlist`.
- Filtros `?location=` en dashboard/reportes/POS/booking/calendar; manager futuro restringido vía `lib/auth/roles.ts:getUserLocationIds()` (V1 stub `all`).
- Índices `idx_appointments_location`, `idx_appointments_business_location_starts`, `idx_inventory_business_qty_threshold`.

### Waitlist + Recurring + Holidays (060, 061, 068, 083)

- `waitlist(business_id, client_id, desired_at unique, status waiting|notified|converted|expired|cancelled, location_id, employee_id)` + `idx_waitlist_desired` + `expire 30m` via `POST /api/waitlist` + `cron/notify` sweep + `PATCH /api/appointments/[id]` cancel triggers `notifyNext`.
- `recurring_appointments(business_id, rrule RFC5545, next_at, until, is_active)` + `RRule` lib (`rrule`) + `appointments.recurring_id` + `POST /api/recurring` batch con `checkSlotWithinHours` por ocurrencia + `cron/recurring-generate`.
- `holidays(business_id, location_id nullable, date, is_open default false, reason)` + `isHoliday` picker disable + `checkSlotWithHolidays`/`checkSlotWithinLocation` en lib+API.

### Membresías / Promos / Fidelización (061-065, 076-080)

- `memberships(business_id, price, duration_days, benefits jsonb {cuts})` + `client_memberships(client_id, membership_id, remaining, expires_at, status)` con `pg_advisory_xact_lock` consume + `transactions.discount_amount/audit`.
- `promotions(business_id, type percent|fixed|combo, value, promo_code unique per business, valid_from/to, rules jsonb {day_of_week, service_ids, client_segment}, location_id)` + `evaluatePromotion` + `calculateDiscount`.
- `loyalty_accounts(client_id PK, points)` + `loyalty_movements(earn/redeem)` + `loyalty_points_view` + `earn 1pt/$1k` / `redeem 100pt=$10k` + `l_view` transaction `discount_reason`.
- `service_combos(business_id, service_ids uuid[], price, duration_min)` + `findBestCombo`.
- `transactions.discount_amount, discount_reason, promo_code, membership_id, loyalty_points_earned/redeemed, tip_amount` + `tips(business_id, transaction_id, employee_id, amount, method)` (071).

### CRM Campañas (065 + 084)

- `campaigns(business_id, segment inactive_30/42/60|birthday_7|vip|new|all, channel whatsapp|email|telegram, template, status draft|sending|sent, stats jsonb {sent,delivered,rebooked}, location_id)` + `campaign_recipients(campaign_id, client_id, status pending|sent|delivered|rebooked|failed)`.
- Flujo `CRM segmentos → createFromSegment → sendCampaign → notification_log dedup 1h → cron inactive_42/birthday_7 auto-send + rebooked attribution` via `campaigns_completeness`.

### Performance (T079, 086)

- Índices polish `idx_appointments_employee_starts(business_id, employee_id, starts_at)` + `idx_transactions_business_created` + `idx_campaign_recipients_client_status` + `idx_client_memberships_active`.
- Dashboard `Promise.all` 9 queries paralelas (ya en `app/(dashboard)/dashboard/page.tsx:1`).
- `book/[slug] generateSlotsMemo` con cache Map + `useMemo` para `visibleServices/Employees` y `effectiveHours`.

### PWA & Offline

- `app/sw.ts` Serwist `fallbacks /offline` + `next.config.js additionalPrecacheEntries ['/offline']` + `public/sw.js` build check.

### Customer 360 (009) — Experiencia Profesional para Clientes

- **Unificación portales**: `app/client/page.tsx:1` anon `?phone=` + `app/(client)/client/dashboard` auth `user_id` → `GET /api/client/me` 360 (`lib/client-360.ts:176 getClient360`) que resuelve por `phone` (normalizePhoneCO +57) o `user_id` link `056_clients_auth.sql` y retorna `client, upcoming (5 asc), history (20 desc), loyalty, memberships, favorites, styles, reviews, transactions, promotions` en **Promise.all parallel** p95 <1.5s. `app/(client)/client/me/page.tsx` poll 30s + timeline `Reservada→Confirmada→En espera→En servicio→Completada`.
- **Reserva 7 pasos**: `app/book/[slug]/booking-form.tsx:700-727` Any barber `data-testid=any-barber` → `app/api/book:290-321` auto-assign `no_staff_available 409` + `deposit_amount/payment_status` stub + `tip_amount` validado no cobrado + `guest_name` (`Yo/Mi hijo/Otra` radio) + `waitlist.enqueue` CTA.
- **Cancel/Reprogram**: `PUT /api/client/appointments/[id]` `checkSlotWithinHours` + `cancel_lead_time 2h` + `waitlist.notifyNext` en `PATCH cancel`; `components/client/upcoming-card` modal date/time + política `2h gratis luego $10k`.
- **Check-in QR + Reseñas**: `lib/qrcode.ts:59 generateCheckinCode nanoid(8)` + `toDataURL` → `GET /api/client/check-in` QR + `POST checked_in` FSM guard `confirmed→checked_in` + `components/client/checkin-qr.tsx` print-friendly + `POST /api/reviews` 1 por `appointment_id UNIQUE` + `pg_advisory_xact_lock`.
- **Mi estilo/Favoritos/Fotos**: `lib/preferences.ts` Zod `cut/length/clipper/beard`, `lib/favorites.ts:toggleFavorite+nextAvailability`, `lib/styles.ts:validatePhotoFile 5MB`, `app/api/client/{preferences,favorites,styles}` con RLS `tenant_access_* + client_self_*`, `storage client-styles private` signed URL 1h.
- **Fidelización/Promos/Pagos**: `loyalty_accounts/movements 062` + `memberships 072` + `promotions 061` `evaluatePromotion 1/week` + `transactions completed` historial + `appointments.payment_status deposit_paid` stub (`095_payment_stub.sql`).
- **Lista espera**: `lib/waitlist.ts` TTL 30m + `app/api/client/waitlist` GET + `components/client/waitlist-card` polling 30s.
- **Notificaciones/Ubicación/Chat/Gift/Realtime**: `app/api/client/notifications` dedup 1h window (type|channel) + `app/api/client/chat` transaccional (DomPurify 500 + notes JSON 20 + notification_log chat_message) + `components/client/chat-thread` + `components/client/location-card` desde `locations 044` + `app/api/cron/notify` 24h/2h/1h/post (`reminder_2h 105-135m`) + `app/api/gift-cards` stub `code` 10 + `app/api/locations/status` silla tiempo real (`in_service` count polling 30s).
- **Layout cliente**: `app/(client)/layout.tsx` header Escudería + `components/layout/bottom-tab-client.tsx` 6 tabs Inicio/Reservas/Estilo/Fidelidad/Pagos/Notifs @ 375px max-w 375, `loading.tsx/error.tsx` por ruta, QR print, bottom-tab 360px no scroll.

## Infra

- `docker-compose.yml`: `migrate` (one-shot `scripts/migrate.js` con retry + `certs/supabase-ca.crt` verify) → `app` (3000, `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` hardcodeado)
- `next.config.js`: `output standalone`, `serverActions allowedOrigins` (appHost), `images remotePatterns supabase.co/r2`, `additionalPrecacheEntries /offline`
