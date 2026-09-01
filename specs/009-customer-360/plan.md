# Implementation Plan: Customer 360 — Experiencia Profesional para Clientes

**Branch**: `009-customer-360` | **Date**: 2026-09-01 | **Spec**: [`spec.md`](./spec.md) | **Constitution**: `v1.0.0` (2026-08-27)

**Input**: Feature specification from `/specs/009-customer-360/spec.md` — 23 capacidades Booksy/SQUIRE style unificando `app/client` + `app/(client)` en Customer 360 con `Inicio, Reservas, Mi estilo, Fidelidad, Pagos, Notificaciones, Check-in, Reseñas, Lista espera` priorizado `Crítico > Alta > Media > Avanzada` y decisión "sí" incluir `Check-in QR + Reseñas` en Slice 1.

## Summary

Unificar portales cliente (`app/client/page.tsx:1` anon phone y `app/(client)/client/dashboard/page.tsx:1` auth) en `GET /api/client/me` 360, manteniendo `proxy.ts:387` stealth y `app/page.tsx:130` client-first. Slice1 entrega valor comercial inmediato: reserva `Cualquier barbero` con disponibilidad realtime, dashboard próxima/historial/rebook, cancel/reprogram, check-in QR + reseñas post-completed. Slice2 completa `Mi estilo/Favoritos/Fotos, Lista espera dashboard, Fidelidad/Promos, Pagos historial`. Slice3 pule `Chat transaccional, Ubicación, Regalo`. Todo con FSM `039/047` y `pg_advisory_xact_lock` `032`, RLS tenant, mobile-first PWA.

## Technical Context

**Language/Version**: TypeScript 5 strict + Next.js 16.3 (App Router, `output: standalone`) + React 19.2

**Primary Dependencies**: Tailwind + shadcn/ui (Radix) + Supabase JS 2 (`@supabase/ssr` 0.10) + Serwist 9.5 PWA + next-intl 4.9 (`es-CO`, `COP`, `America/Bogota`) + Zod + DomPurify + `libphonenumber-js` + `date-fns-tz` + `rrule` (ya en 006) — no nueva dep para 009 salvo `qrcode` generación (`qrcode` o canvas, evaluación en research)

**Storage**: Supabase PostgreSQL (RLS + `pg_advisory_xact_lock` + `pgcrypto` + `pgsodium/vault` opcional) + Supabase Storage (`client-styles` nuevo bucket, reuse `inventory` si se quiere) + IndexedDB no necesario cliente (solo POS offline)

**Testing**: `vitest` unit (`preferences`, `favorites`, `reviews`, `checkin`, `waitlist`) + `playwright` E2E (`reserve→checkin→review`, `waitlist flow`) + `k6` opcional slot concurrency

**Target Platform**: Web PWA (mobile 375px/360px + desktop), Docker standalone, Supabase Cloud/local `127.0.0.1:54321/54322`

**Project Type**: Web application (monolito Next.js + Supabase)

**Performance Goals**: `GET /api/client/me` p95 <1.5s; `GET /api/book` slot calc <200ms p95; `POST /api/client/check-in` <300ms; Lighthouse Best Practices ≥90

**Constraints**: Stealth `ADMIN_SECRET_PATH=/escuderito-admin` intacto (`proxy.ts:332`); `DATABASE_URL` 5432 verify-full; `COP/es-CO/America/Bogota` parametrizado; `location_id` nullable no rompe single-sede; RLS en toda tabla nueva; `rateLimit book 20/10m`, `checkin 10/1h`; foto ≤5MB

**Scale/Scope**: 1 business `escuderia` + `cristain/escudero` seeds; 5 roles; ~8 nuevas tablas (`favorites, client_styles, reviews, gift_cards`, alters `clients, appointments`), ~6 nuevas APIs, ~4 UI rutas cliente, 87 pages → ~95

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate (I–VII) | Status | Evidence |
|--------------|--------|----------|
| **I Pronto-First / Library-First** | ✅ PASS | Reusa `booking-availability`, `my_business_ids()`, `waitlist`, `loyalty`, `memberships`, `whatsapp` `mailer`. No reescribir booking wizard (`booking-form.tsx:617`). Nuevas tablas son add-on, no reemplazo. Upstream aportable si `preferences` genérico. |
| **II Spec-First** | ✅ PASS | `spec.md` con 11 stories P1-P4, 21 FR-C*, 7 entidades, 13 SCs medibles; `plan.md`+`research/data-model/quickstart`+`contracts/` trazables. |
| **III Cliente Real Primero** | ✅ PASS | P1 = reservar + dashboard + cancel/reprogram + checkin + reseña — barbería opera día 1 sin llamar. Cada slice testeable independiente; `Waitlist` reduce no-show inmediato. |
| **IV Integridad & Seguridad** | ✅ PASS | `check_slot_availability()` 032 + FSM 039/047 para checkin (solo `confirmed→checked_in`) + `reviews` FK unique por `appointment_id` + RLS `business_id IN my_business_ids()` + `REVOKE anon` + Zod+DomPurify en todo nuevo `api/client/*`. Fotos `storage` RLS por `business_id`. |
| **V Mobile-First + PWA** | ✅ PASS | Bottom-tab cliente, cards `Próxima cita`, touch ≥44px, `qrcode` check-in scans desde móvil staff, `sw.ts` ya `fallbacks /offline` intacto, no requiere offline cliente. |
| **VI Test-First & Simplicidad** | ✅ PASS | No nueva dep pesada; `qrcode` (<30kB) vs generar en server con `canvas`. YAGNI: PSP real, chat libre, IA estilos diferidos a V2. Tests `vitest` para `preferences` y `reviews` antes de impl. |
| **VII Multi-sucursal contenida** | ✅ PASS | Toda query cliente filtra `business_id` + opcional `location_id`; `favorites` + `client_styles` con `business_id` + `location_id` nullable; no asume multi-sede pero no lo bloquea. |

**Re-check after Phase 1**: pending — validar `qrcode` elección y `gift_cards` solo schema V1.

## Project Structure

### Documentation (this feature)

```text
specs/009-customer-360/
├── spec.md               # 11 stories P1-P4, 21 FRs, 13 SCs (this spec)
├── plan.md               # This file
├── research.md           # Phase 0: auditoría 001..087 + gaps 12 + qrcode vs canvas + why not add PSP
├── data-model.md         # Phase 1: ERD + migraciones 088..095
├── quickstart.md         # Phase 1: docker up + seed + curl /api/client/me + e2e
├── contracts/            # Phase 1: OpenAPI 3.0
│   ├── api-client-me.yaml
│   ├── api-client-preferences.yaml
│   ├── api-client-favorites.yaml
│   ├── api-client-styles.yaml
│   ├── api-client-checkin.yaml
│   ├── api-reviews.yaml
│   └── api-waitlist-client.yaml
└── tasks.md              # Phase 2: roadmap Slice1→2→3 por story
```

### Source Code (repository root) — Next.js App Router + Supabase

```text
app/
├── (client)/client/                # NUEVO unificado (reemplaza app/client + app/(client)/dashboard)
│   ├── page.tsx                    # redirect → /client/me o /book/escuderia si anon
│   ├── me/page.tsx                 # Inicio 360 (próxima + timeline + fidelidad preview)
│   ├── reservas/page.tsx           # Próximas | Historial | Rebook + Lista espera
│   ├── estilo/page.tsx             # Preferencias + Fotos + Favoritos
│   └── layout.tsx                  # bottom-tab cliente, auth phone+OTP + user_id
├── book/[slug]/page.tsx            # público, ya existe, solo extiende Any barber + waiting CTA
│   └── booking-form.tsx            # 4 steps, ya tiene waitlist prompt 937-983, añadir gift_card tip stub
├── client/page.tsx                 # DEPRECATED → redirect a (client)/client/me (compat 301)
└── api/
    ├── client/
    │   ├── me/route.ts             # NUEVO: GET 360 (fusiona findLinkedClient+findClientByPhone+loyalty)
    │   ├── preferences/route.ts    # NUEVO: PUT jsonb + preferred_barber_id
    │   ├── favorites/route.ts      # NUEVO: POST/DELETE + GET próxima disponibilidad
    │   ├── styles/route.ts         # NUEVO: POST upload + GET list + storage
    │   ├── check-in/route.ts       # NUEVO: POST checked_in + GET QR
    │   ├── waitlist/route.ts       # NUEVO alias client view (proxy a lib/waitlist)
    │   └── appointments/[id]/route.ts # EXTEND: ya existe 19-183, añadir checkin guard client
    ├── reviews/route.ts            # NUEVO: POST rating 1-5 + tags + comment (solo completed)
    └── book/route.ts               # EXTEND: gift_card_code?, tip_amount? (stub)

lib/
├── client-360.ts                   # NUEVO: helpers getClient360(businessId, phone|userId) → 360
├── preferences.ts                  # NUEVO: validate Preferences jsonb schema Zod
├── favorites.ts                    # NUEVO: toggle + nextAvailability(lib/booking-availability)
├── styles.ts                       # NUEVO: storage helpers
├── qrcode.ts                       # NUEVO: generateCheckinCode(appointmentId) → base64
└── supabase/{client,server,service}.ts # ya

supabase/migrations/
├── 088_client_360_preferences.sql  # clients ADD preferences jsonb + status + preferred_barber_id + notification_prefs
├── 089_client_360_favorites.sql    # favorites PK (client_id, employee_id)
├── 090_client_360_styles.sql       # client_styles + storage bucket client-styles
├── 091_client_360_reviews.sql      # reviews appointment_id unique + RLS
├── 092_client_360_checkin.sql      # appointments ADD checkin_code + payment_status stub + gift_cards stub table
├── 093_client_360_gift_cards.sql   # gift_cards (code unique, balance) — schema only V1
└── 094_client_360_storage.sql      # storage bucket + RLS

components/
├── client/
│   ├── upcoming-card.tsx           # Próxima cita + timeline
│   ├── history-list.tsx            # Historial + rebook
│   ├── style-editor.tsx            # Mi estilo form
│   ├── photo-grid.tsx              # Fotos + upload
│   ├── favorites-list.tsx          # Favoritos + próxima disponibilidad
│   ├── checkin-qr.tsx              # QR + Estoy aquí
│   └── review-form.tsx             # ★★★★★ + tags
└── layout/bottom-tab-client.tsx    # NUEVO

tests/
├── unit/{preferences,favorites,reviews,checkin,waitlist}.test.ts
├── integration/{client-360,reviews-fsm}.test.ts
└── e2e/client-360.spec.ts          # reserve→checkin→review→rebook
```

**Structure Decision**: mantener monolito Next.js + Supabase. No extraer `client-service` backend: duplicaría RLS y rompería `proxy.ts` stealth. Cada slice es vertical (`migration + api + lib + UI + test`) con `business_id` obligatorio. `app/client` viejo redirige 301 para no romper bookmarks.

## Architecture Decisions

### DB Extensions & Concurrency

- **Advisory locks**: reusar `pg_advisory_xact_lock` de `032` para `favorites` toggle idempotente y `reviews` única por cita (evita doble review race). `checkin` solo `confirmed→checked_in` validado por trigger `enforce_fsm` ya existente `047`.
- **RLS**: `enable row level security` en `favorites, client_styles, reviews, gift_cards` + `USING (business_id IN (SELECT my_business_ids()))` + `FOR INSERT WITH CHECK`. `reviews` solo `client_id = (SELECT id FROM clients WHERE user_id=auth.uid())` o `phone` match. `storage.objects` RLS por `bucket_id='client-styles' AND business_id`.
- **FSM**: no nuevo estado; reusar `checked_in, in_service, completed` ya en `appointments.status` `drizzle/schema.ts:956`. Cliente solo puede `confirmed→checked_in` y `pending→cancelled`; staff hace resto.
- **PII**: `preferences jsonb` no PII sensible, no `pgsodium`; fotos `storage` con `public false` y signed URL 1h.

### API

- **Estilo**: Next Route Handlers `route.ts` + Zod + `createClient` `supabase/server` (server) o `service` solo para `storage` admin. Cada `POST` valida `business_id` tenant + `client_id` pertenece a business.
- **Nuevas rutas**: `client/me`, `client/preferences`, `client/favorites`, `client/styles`, `client/check-in`, `reviews`, `waitlist-client` (read-only alias). Modificadas: `api/client/appointments/[id]` añade `checkin`, `api/book` añade `gift_card_code` stub (validación sin balance V1).
- **Rate**: `check-in 10/1h` por `client_id`, `reviews 5/1h`, `styles upload 20/1h 5MB`.

### PWA & Mobile

- **QR**: generar server `checkin_code = nanoid(8)` en `appointments` al crear, mostrar QR en cliente `GET /api/client/check-in?appointment_id=` con `qrcode.toCanvas`. Staff escanea con `BarcodeDetector` ya en `hooks/useBarcodeScanner.ts` o manual code entry. No necesita WebSocket; polling `GET /api/client/me` cada 30s para `En espera ~10m` suficiente V1.
- **Bottom-tab**: 5 items max, icon+label, active state `bg-gray-900`.

### Despliegue Docker

- No nuevo servicio. `supabase/migrations/088..094` idempotentes `IF NOT EXISTS` + `DO $$` grants. `storage` bucket creado via `storage.buckets` insert idempotente o `supabase storage` CLI. `app` standalone ya healthchecks `/api/health`.

### Decision: Why Not PSP yet (ADR)

**Context**: ¿Integrar Bold/Wompi/Stripe en Slice1?

**Decisión**: **No**. V1 stub `appointments.payment_status=unpaid/deposit_paid/paid` + `deposit_amount` sin flujo dinero. Razones: 1) Booking actual es `status=confirmed` sin transacción (`app/api/book:1243`); cambiar a `pending_payment` rompe `pos/transaction` que espera `completed` → `paid`; 2) Requiere webhook idempotente + `search_path` + PCI; 3) Constitución III exige integridad antes de dinero. Se diseña schema para V2, se deja `gift_cards.balance` sin compra flujo completo.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `qrcode` npm (~30kB) | Generar QR `checkin_code` client + staff scan sin backend extra | Canvas manual requiere `qrcode-generator` igual peso y menos tipos; server SVG sin lib deja cliente sin QR offline; `qrcode` es 0 CVE, tree-shakeable, usado en `inventory/[id]/photo` pattern similar. |
| `storage bucket client-styles` | Fotos estilos `client_styles.photo_url` necesita RLS y signed URL | Reusar `inventory` bucket mezcla permisos `inventory_items` `is_active` vs `client_styles` `private`; separar evita `REVOKE` regresión `016`. |

## Risks & Mitigations

| Riesgo | Prob | Mitigación |
|--------|------|------------|
| RLS `favorites` filtra mal cross-business | Media | Test `anon cannot read favorites of other business` + `Security Advisor` 0 flags; `my_business_ids()` unit. |
| Doble review race | Baja | `reviews.appointment_id UNIQUE` + `pg_advisory_xact_lock(appointment_id)` en `POST`. |
| Check-in fuera de ventana (muy temprano) | Media | Validar `starts_at ±2h` en `POST /api/client/check-in` + `isPastInTz/isTooSoonInTz` reuse. |
| Foto 50MB explota storage | Baja | `storage.file_size_limit 5MB` en bucket + Zod `max 5*1024*1024` + `config.toml:123` ya 50MiB global pero bucket override. |
| Waitlist spam si notifyNext falla | Baja | `notification_log` dedup `(client_id, event, 1h)` ya en `002` + `waitlist` TTL 30m ya `lib/waitlist:expireStale`. |

## Phases

**Phase 0 — Research** (`research.md`): auditoría `app/client` vs `app/(client)` duplicado, 12 gaps, `qrcode` vs canvas, PSP stub decision, Supabase Storage RLS.

**Phase 1 — Design** (`data-model.md` + `contracts/` + `quickstart.md`): ERD 360, migraciones 088..094, OpenAPI `contracts/*.yaml`, `quickstart.md` `docker compose up + curl /api/client/me` + E2E.

**Phase 2 — Tasks** (`tasks.md`): roadmap Slice1→2→3 (ver `tasks.md`).

**Phase 3 — Apply**: slices verticales con work-unit commits y chained PRs si >400 líneas.
