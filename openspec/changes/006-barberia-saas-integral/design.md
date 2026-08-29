# Implementation Plan: Barbería SaaS Integral — Escudería

**Branch**: `006-barberia-saas-integral` | **Date**: 2026-08-28 | **Spec**: [`spec.md`](./spec.md) | **Constitution**: `v2.0.0` (2026-08-28)

**Input**: Feature specification from `/specs/006-barberia-saas-integral/spec.md` — SaaS integral con 4 experiencias (Cliente, Barbero, Admin, Dueño), 13 módulos, CRM "Carlos 42d → WhatsApp", premium mobile-first, multi-sucursal real.

## Summary

Extender Pronto (Next.js 16 + Supabase, 57 migraciones) de single-sede operativo a **SaaS multi-sucursal premium** sin reescribir: nueva navegación `Dashboard/Agenda/Clientes/Barberos/Servicios/POS/Caja/Inventario/Membresías/Promociones/CRM/Reportes/Sucursales/Configuración`, con `location_id` nullable (044), waitlist + recurrentes + propinas, membresías/promociones/puntos y CRM campañas que cierran el loop `inactivo → WhatsApp → re-reserva`. Todo transaccional (032 advisory locks + FSM guards), RLS por sede y entregado en roadmap MVP→V1→V2→Premium (ver `tasks.md`).

## Technical Context

**Language/Version**: TypeScript 5 strict + Next.js 16.3 (App Router, `output: standalone`) + React 19.2

**Primary Dependencies**: Tailwind + shadcn/ui (Radix) + Supabase JS 2 (`@supabase/ssr`) + Serwist 9.5 PWA + next-intl 4.9 (`es-CO`, `COP`) + Zod + DomPurify + `libphonenumber-js` (E.164) + `rrule` (recurrencias) + `date-fns-tz`

**Storage**: Supabase PostgreSQL (RLS + `pg_advisory_xact_lock` + `pgcrypto` + `pgsodium/vault` opcional + `pg_cron/pg_net` opcional) + Supabase Storage (`inventory` bucket + futuros `avatars/receipts`) + IndexedDB `pending_transactions` (offline POS)

**Testing**: `npm run lint` + `vitest` (unit: precios, disponibilidad, comisiones, membresías, caja, puntos) + `playwright` (E2E booking→POS→historial→campaña) + `k6` opcional (concurrencia)

**Target Platform**: Web PWA (Chrome/Safari mobile + desktop), Docker `standalone` desplegable en VPS/Cloudflare Tunnel, `supabase cloud` o self-host

**Project Type**: Web application (monolito Next.js + Supabase backend-as-a-service)

**Performance Goals**: LCP `/book/[slug]` <1.5s p75; dashboard p95 <2s (7d); `get_booked_slots` <200ms p95; POS tap <100ms; Lighthouse mobile ≥90

**Constraints**: PWA offline-safe solo POS; doble reserva imposible en DB; `DATABASE_URL` 5432 verify-full con `certs/supabase-ca.crt`; `CRON_SECRET` + `INTERNAL_API_SECRET` rotables; RLS en toda tabla nueva; headers `HSTS/X-Frame/CS`P; rateLimit `book 20/10m`; `COP/es-CO/America/Bogota` parametrizado

**Scale/Scope**: 1 business → 1..N `locations`; 5 roles (`owner|admin|manager|barber|receptionist`); ~15 rutas dashboard + 2 públicas; ~12 nuevas tablas + 6 alters; ~11 nuevas APIs + 8 modificadas; 57→~70 migraciones

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate (I–VII) | Status | Evidence |
|--------------|--------|----------|
| **I Pronto-First / Library-First** | ✅ PASS | Cada módulo es slice independiente (`lib/memberships`, `lib/promotions`, `lib/loyalty`, `lib/waitlist`, `lib/recurring` + rutas `/barberos`/`/servicios`/`/membresias`/`/promociones`/`/crm`/`/sucursales`). Reusa `booking-availability`, `my_business_ids()`, `offline-db`, `whatsapp`, `mailer`. Aportes upstream aislables detrás de `enabled_modules`. |
| **II Spec-First** | ✅ PASS | `spec.md` v2.0.0 con 7 user stories priorizadas, 40+ FRs con IDs por módulo, NFRs y 15 SCs medibles; `plan.md` + `data-model.md` + `research.md` + `quickstart.md` + `contracts/` trazables; tema en `feature.json`. |
| **III Cliente Real Primero** | ✅ PASS | P1 = reserva 1-click + agenda barbero + operación global + dashboard 5s. Cada P1 es testeable independiente; roadmap MVP entrega barbería operativa día 1 sin Excel/WhatsApp manual. |
| **IV Integridad & Seguridad** | ✅ PASS | 032 `pg_advisory_xact_lock` + FSM 039/047/052 + `check_barber_availability` 040 + `prevent_past_bookings` 053 + `business_lead_time` 054 para citas; `pgsodium` 045/050/051 para PII; RLS `tenant_access_*` + `REVOKE anon` + `auth/roles.ts` 058; Zod+DomPurify+rateLimit en todo `api/*`. |
| **V Mobile-First + PWA** | ✅ PASS | `book/[slug]` 4 steps touch ≥44px + bottom-tab móvil + `booking-calendar` responsive + POS 1-mano + Serwist `fallbacks /offline` + `additionalPrecacheEntries`; NFR-001..004 con budgets medibles. |
| **VI Test-First & Simplicidad** | ✅ PASS | Plan reserva `vitest` unit + `playwright` E2E + `k6` concurrencia; NO nueva dependencia sin justificar (`rrule` es única nueva, evaluada vs cron custom). YAGNI: DIAN/ERP/marketplace out-of-scope V1. |
| **VII Multi-sucursal contenida** | ✅ PASS | 044 `locations` existente reutilizado; nuevos `location_id` nullable + índices + RLS `business_id in my_business_ids()` ahora y `my_location_ids()` futuro sin romper single-sede. |

**Re-check after Phase 1**: done — no violations; `rrule` justificada, `pg_cron` opcional no rompe local.

## Project Structure

### Documentation (this feature)

```text
specs/006-barberia-saas-integral/
├── spec.md               # Feature spec (7 stories, 40+ FRs, 8 NFRs, 15 SCs)
├── plan.md               # This file
├── research.md           # Phase 0: auditoría Pronto + decisiones (why not Django)
├── data-model.md         # Phase 1: ERD + migraciones 058..070
├── quickstart.md         # Phase 1: levantar desde cero + verificación
├── contracts/            # Phase 1: OpenAPI para APIs nuevas/modificadas
│   ├── api-book.yaml
│   ├── api-appointments.yaml
│   ├── api-waitlist.yaml
│   ├── api-recurring.yaml
│   ├── api-memberships.yaml
│   ├── api-promotions.yaml
│   ├── api-loyalty.yaml
│   ├── api-campaigns.yaml
│   ├── api-locations.yaml
│   └── api-tips.yaml
└── tasks.md              # Phase 2: roadmap MVP→V1→V2→Premium por story
```

### Source Code (repository root) — Next.js App Router + Supabase

```text
app/
├── (dashboard)/                # RBAC via proxy.ts + layout.tsx (005)
│   ├── dashboard/page.tsx      # dueña: ventas/ticket/nuevos/top barberos
│   ├── booking/page.tsx + booking-calendar.tsx  # agenda global + por sede
│   ├── crm/page.tsx + crm/[id]/   # clientes + ficha + segmentos 42d/cumple
│   ├── barberos/page.tsx        # NUEVO: CRUD employees filtrado por location
│   ├── servicios/page.tsx       # NUEVO: CRUD services + combos
│   ├── pos/page.tsx + pos-terminal.tsx  # POS + bookingContext + offline-db
│   ├── caja/page.tsx            # cash_registers por location
│   ├── inventory/page.tsx       # inventory_items por location
│   ├── membresias/page.tsx      # NUEVO: memberships + client_memberships
│   ├── promociones/page.tsx     # NUEVO: promotions
│   ├── crm-campaigns/page.tsx   # NUEVO: campaigns + recipients (alias /crm)
│   ├── reportes/page.tsx        # NUEVO: reportes + export
│   ├── sucursales/page.tsx      # NUEVO: locations (044)
│   └── settings/page.tsx        # business_hours/holidays/tax/methods/loyalty
├── book/[slug]/page.tsx + booking-form.tsx  # pública mobile-first
├── client/page.tsx             # portal cliente (historial + 1-click rebook)
├── onboarding/                 # wizard (locations + hours + employees + services)
├── sw.ts                       # Serwist PWA
└── api/
    ├── book/route.ts           # POST booking + waitlist fallback
    ├── appointments/[id]/route.ts # PATCH FSM
    ├── waitlist/route.ts        # NUEVO: POST/GET/DELETE
    ├── recurring/route.ts       # NUEVO: POST series
    ├── memberships/route.ts     # NUEVO
    ├── promotions/route.ts      # NUEVO + apply
    ├── loyalty/route.ts         # NUEVO: earn/redeem
    ├── campaigns/route.ts       # NUEVO: create/send/stats
    ├── locations/route.ts       # NUEVO: CRUD
    ├── tips/route.ts            # NUEVO
    └── cron/
        ├── notify/route.ts      # 007 + inactivos/cumple/waitlist
        └── recurring-generate/route.ts # NUEVO

lib/
├── booking-availability.ts      # checkSlotWithinHours + effectiveHours
├── auth/roles.ts               # 005 single source RBAC
├── memberships.ts              # NUEVO: eligibility + consume
├── promotions.ts               # NUEVO: evaluate + apply
├── loyalty.ts                  # NUEVO: earn/redeem
├── waitlist.ts                 # NUEVO: enqueue/notify/convert
├── recurring.ts                # NUEVO: rrule → appointments
├── locations.ts                # NUEVO: helpers location_id
├── tips.ts                     # NUEVO: helpers propinas
├── offline-db.ts               # IndexedDB queue
├── supabase/{client,server,service}.ts
└── utils.ts                    # formatCurrency COP, formatInTZ

supabase/migrations/
├── 058_rbac_barbero.sql         # 005 (ya)
├── 059_locations_rls_hardening.sql  # holidays + location RLS polish
├── 060_waitlist.sql
├── 061_recurring_appointments.sql
├── 062_tips.sql
├── 063_memberships.sql
├── 064_promotions.sql
├── 065_loyalty.sql
├── 066_campaigns.sql
├── 067_service_combos.sql
├── 068_holidays.sql
└── 069_inventory_location_transfer.sql

components/
├── layout/sidebar.tsx           # nav premium filtrado por rol (005)
└── {barberos,servicios,membresias,promociones,crm,sucursales,reportes}/

tests/
├── unit/{booking-availability,commissions,tips,caja,memberships,loyalty}.test.ts
├── integration/{auth,rls,book,appointments,waitlist,recurring}.test.ts
└── e2e/{booking-pos-historial-campaign}.spec.ts
```

**Structure Decision**: mantener monolito Next.js + Supabase (probado en 044/057). No extraer backend separado: duplicaría auth/RLS, rompería SSR/PWA y violaría I. Cada módulo nuevo es slice vertical (`app` ruta + `api` + `lib` helper + migración + test) con `location_id` nullable para no romper single-sede. `enabled_modules` ya oculta rutas no usadas (026).

## Architecture Decisions

### DB Extensions & Concurrency

- **Advisory locks (032 ya)**: `pg_advisory_xact_lock(hashtext(business_id:employee_id))` para slot específico; `hashtext(business:service:alloc)` para Anyone. Reusado para `waitlist` convert y `recurring` batch insert. No `SELECT FOR UPDATE` masivo (escalaría mal con `capacity>1`).
- **RLS**: `enable row level security` en toda tabla nueva + `tenant_access_* FOR ALL USING (business_id IN (SELECT my_business_ids()))`. `locations` y tablas con `location_id` mantienen filtro por `business_id` en V1; `my_location_ids()` se añade en V2 cuando haya `manager` single-sede sin romper `owner` multi-sede. `anon` revocado de sensibles (016).
- **FSM guards (039/047/052 ya)**: `appointments_status_fsm` check + trigger `enforce_fsm` + `allow_pos_paid` (052) para `completed→paid` via POS. `waitlist.status` y `client_memberships.status` con checks similares.
- **Extensiones**: `pgcrypto` (uuid), `pgsodium`+`vault` (045/050/051) para `clients.phone/email` bytea + vista descifrada (condicional `IF EXISTS` + `RAISE NOTICE` si falta vault en local), `pg_cron/pg_net` opcional 007 (skip si falta).

### API

- **Estilo**: Next API Routes (App Router) `route.ts` con `Zod` + `DomPurify` + `rateLimit` + `createServiceClient` server-side (correcto: RLS no expone sensibles en 016). Cada `POST/PATCH` valida `business_id` + `location_id` + rol + FSM + disponibilidad.
- **Nuevas rutas**: `waitlist`, `recurring`, `memberships`, `promotions`, `loyalty`, `campaigns`, `locations`, `tips`, `holidays`, `service_combos` — ver `contracts/*.yaml`.
- **Modificadas**: `api/book` (membership/promo/loyalty apply, waitlist enqueue), `api/appointments/[id]` (propinas, FSM tip), `api/cron/notify` (inactivos/cumple/waitlist/review), `api/cron/recurring-generate`.

### PWA

Serwist 9.5 `app/sw.ts` con `runtimeCaching: NetworkFirst supabase-data` + `StaleWhileRevalidate` assets + `fallbacks: /offline` + `additionalPrecacheEntries: ['/offline']`. `disable` en `development` (Turbopack). Solo POS encola `pending_transactions` IndexedDB con `syncQueue()` al `online`; `/book` y `/caja` requieren online (integridad).

### Despliegue Docker

`docker-compose.yml`: `migrate` (one-shot `scripts/migrate.js` con `certs/supabase-ca.crt` verify-full + retry) → `app` (3000 `output: standalone`, healthcheck `/api/health`, `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted`). Env: `DATABASE_URL` 5432, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo server), `CRON_SECRET` + `INTERNAL_API_SECRET` (`openssl rand -hex 32`). Cron fallback: `cron-job.org GET /api/cron/notify` si `pg_cron` sin extension. VPS: `Caddy/Traefik → app:3000`, HTTPS + Cloudflare Tunnel opcional, `supabase cloud` o self-host. Ver `docs/deployment.md` y `docs/backup.md`.

### Decision: Why Not Django (ADR)

**Context**: ¿Migrar backend a Django/DRF para SaaS multi-módulo?

**Decisión**: **No**. Mantener Next.js 16 + Supabase.

| Criterio | Next.js+Supabase (actual) | Django + Next.js frontend |
|----------|---------------------------|---------------------------|
| Auth/RLS | Supabase Auth SSR + `my_business_ids()` RLS nativo, `proxy.ts` single shot, sin duplicar session | Reimplementar auth, JWT dual, RLS manual (riesgo cross-tenant) |
| Realtime/Triggers | `pg_advisory_xact_lock` + triggers 032/040 en Postgres, `notification_log` + `pg_cron` ya probados | Reescribir triggers en ORM, perder atomicidad DB |
| PWA Offline | Serwist + IndexedDB queue ya funciona con Supabase JS | Django REST añadiría latencia + serialización doble |
| Deploy | 1 contenedor `standalone` + 1 `migrate`, `certs/supabase-ca.crt` verify | 2 servicios (django + next), +1 DB pool, +1 gunicorn, más secretos |
| Equipo/stack | 1 stack TS full-stack, `shadcn/ui` SSR directo | 2 stacks (PY+TS), context switch, onboarding 2× |
| Migraciones | 57 migraciones SQL idempotentes ya, `schema_migrations` source of truth | Reescribir a Django migrations, perder historial |

**Consecuencia**: No se introduce Django. Se documenta ADR en `docs/architecture.md` y constitución VII. Si en V2 se necesita BI pesado, se evalúa `supabase Edge Functions` o `worker` Node separado, no Django monolito.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `rrule` dep nueva (~10kB) | Generar `recurring_appointments` con RFC 5545 `FREQ=WEEKLY;INTERVAL=2;COUNT=6` parseado y validado por ocurrencia | Cron custom con `interval_days` no soporta `BYDAY`, mensual complejo, y requeriría igual parser + tests. `rrule` es estándar, 0 CVEs, tree-shakeable. |
| `pg_cron` opcional | Disparar `notify` + `recurring-generate` diario 09:00 `America/Bogota` sin infra externa | Solo `cron-job.org` dejaría local sin cron y CI sin cerco; con `pg_cron` conditional (`IF EXISTS`) se cubren ambos sin romper `supabase db reset`. |

## Risks & Mitigations

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| RLS multi-sede filtra mal | Media | RLS por `business_id` en V1 (probado 044); `my_location_ids()` en V2 con tests `anon vs barber Centro vs manager Norte`; `Security Advisor` en CI. |
| `rrule` genera slots inválidos (feriado/break) | Media | Validar cada ocurrencia con `checkSlotWithinHours` + `employee_unavailability` + `holidays`; omitir con aviso, no fallar serie. |
| Waitlist spam WhatsApp | Baja | RateLimit `campaigns/send 10/1h`, `notification_log` deduplica por `(client_id, event, 1h)` window, opt-out por `clients.tags NOT LIKE 'no_whatsapp'`. |
| Membresía doble consumo race | Baja | `pg_advisory_xact_lock(client_memberships.id)` en `consume` + `remaining>0` check en trigger; `409 no_uses_left`. |
| Supabase `pgsodium` sin vault en local | Media | Migraciones `DO $$ IF EXISTS vault ELSE RAISE NOTICE` no bloquean `db reset`; CI usa Cloud con vault, local usa RLS-only. |

## Phases

**Phase 0 — Research** (`research.md`): auditoría 001..057, gaps vs 006 spec (membresías/promos/loyalty/waitlist/recurring/tips/holidays/combos), decisión `rrule` vs custom, `pg_cron` conditional, por qué no Django.

**Phase 1 — Design** (`data-model.md` + `contracts/` + `quickstart.md`): ERD con `location_id` nullable, migraciones 059..069, OpenAPI `contracts/*.yaml`, `quickstart.md` con `docker compose up` + `seed Escudería Centro` + verificación SCs.

**Phase 2 — Tasks** (`tasks.md`): roadmap MVP→V1→V2→Premium (ver `tasks.md`).

**Phase 3 — Apply**: implementar por slices verticales con work-unit commits y chained PRs si >400 líneas.
