# Implementation Plan: Pronto Barber Platform

**Branch**: `001-pronto-barber-platform` | **Date**: 2026-08-27 | **Spec**: `specs/001-pronto-barber-platform/spec.md`

**Input**: Feature specification from `/specs/001-pronto-barber-platform/spec.md`

## Summary

Transformar Pronto (Next.js 16 + Supabase + Docker + PWA) en software profesional para barbería real sin reescribir desde cero. Enfoque: auditar → levantar local → hardening + localización COP/es-CO → MVP barbería (clientes/barberos/servicios/agenda con FSM completo y sin doble reserva transaccional) → POS + caja + comisiones + inventario + CRM/dashboard → notificaciones WhatsApp + PWA + observabilidad → staging/production. Trazabilidad completa spec→plan→tasks→implement vía Spec Kit.

## Technical Context

**Language/Version**: TypeScript 5 + Node 20 (Docker) / 24 local, Next.js 16.3.2, React 19.2.8

**Primary Dependencies**: `@supabase/ssr` + `supabase-js`, `next-intl` 4.9, `@serwist/next` 9.5, Tailwind + Radix/shadcn, `zod`, `isomorphic-dompurify`, `xlsx`, `lucide-react`, `date-fns`, `nodemailer/resend`

**Storage**: Supabase PostgreSQL (RLS) + Storage bucket `inventory` + IndexedDB (`lib/offline-db.ts`) para cola POS offline

**Testing**: `eslint` baseline + nuevo: Vitest (unit), `pg` + Supabase Test (integration), Playwright (E2E). Criterio: `npm run lint && npm run test:unit && npm run test:e2e` en CI.

**Target Platform**: Web responsive (desktop/tablet/móvil) + PWA instalable (Android/iOS), Docker `standalone` en VPS con Cloudflare/Tunnel o Nginx

**Project Type**: Web application (Next.js App Router + API Routes)

**Performance Goals**: Reserva pública <1s TTFB, dashboard p95 <2s, POS cobro <15s, WhatsApp confirm <30s, `get_booked_slots` con índice `idx_appointments_starts_at`

**Constraints**: <200ms validación server-side `/api/book`, offline POS sin pérdida, RLS estricto (nunca `service_role` en cliente), `formatCurrency` parametrizado, advisory lock para concurrencia citas, `CRON_SECRET` + `INTERNAL_API_SECRET` obligatorios

**Scale/Scope**: 1 barbería MVP (5-15 barberos, 100-3000 clientes, ~50 citas/día), 38 requisitos funcionales, 32 migraciones base + ~6 nuevas, ~8 user stories en 5 fases (0 Bootstrap → 5 Producción)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Pronto-First**: Plan extiende módulos existentes (`booking-calendar.tsx`, `crm`, `pos-terminal.tsx`, `inventory`, `lib/*`), no greenfield. Cambios `upstream-*` vs `barber-*` separados.
- [x] **II. Cliente Real Primero**: Fases priorizan "operar día completo" antes de reportes/analytics. POS y agenda primero, comisiones/caja después, reportes al final.
- [x] **III. Integridad/Seguridad**: Trigger 032 (`pg_advisory_xact_lock`) se preserva y extiende; toda nueva tabla con RLS + `my_business_ids()`; Zod + DomPurify en `api/*`; `023_performance_indexes` se respeta.
- [x] **IV. Mobile-First/PWA**: `booking-form.tsx`, `pos-terminal.tsx`, `booking-calendar.tsx` mantienen touch + PWA `app/sw.ts` offline-safe. No nativo.
- [x] **V. Simplicidad/Mantenibilidad**: Nuevas tablas (`employee_services`, `employee_unavailability`, `cash_registers`) mínimas, reutilizan `lib/booking-availability.ts` como source of truth. Docs en `docs/` y `specs/`.

*Post-Phase 1 re-check*: Si `employee_services` requiere UI compleja, evaluar si un campo `services.allowed_employee_ids uuid[]` sería más simple y por qué se descarta (normalización vs queries).

## Project Structure

### Documentation (this feature)

```text
specs/001-pronto-barber-platform/
├── spec.md              # Qué/por qué (este feature)
├── plan.md              # Este archivo
├── research.md          # Phase 0: auditoría Pronto, decisiones técnicas, alternativas
├── data-model.md        # Phase 1: entidades, migraciones, relaciones
├── quickstart.md        # Phase 1: cómo levantar desde cero (copy de docs/local-development.md)
├── contracts/           # Phase 1: OpenAPI para /api/book, /api/appointments/[id], POS, inventory
└── tasks.md             # Phase 2: tasks por user story
```

### Source Code (repository root)

```text
# Web application — estructura real Pronto, no plantilla genérica
app/
├── (auth)/login,register,forgot-password
├── (dashboard)/booking, crm, dashboard, inventory, pos, settings
├── (public)/, book/[slug], onboarding, api/
├── globals.css, layout.tsx, sw.ts
components/{clients, inventory, layout, ui}
lib/{auth-user, booking-availability, supabase/*, whatsapp, telegram, viber, mailer, offline-db, modules, rate-limit, utils}
supabase/migrations/001..036
hooks/, i18n/, messages/{en,es,it,pt}.json
public/, certs/, scripts/migrate.js
docker-compose.yml, Dockerfile, next.config.js, proxy.ts

tests/
├── unit/booking-availability, currency, commissions
├── integration/api-book, appointments, pos, inventory
└── e2e/booking-to-pos.spec.ts
```

**Structure Decision**: Se mantiene estructura Pronto tal cual. No se introduce `src/` ni `backend/frontend/` separado; la convención Next App Router es el source. Tests en `tests/` raíz siguiendo Spec Kit, con `vitest` + `playwright` sin mover código existente.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 3 nuevas tablas (`employee_services`, `employee_unavailability`, `cash_registers` + `cash_movements`) | Mapear especialidades por barbero, bloqueos vacaciones/descansos y control caja son requisitos operativos P1 del cliente | Campo JSON en `employees` impediría FK/índices y queries de disponibilidad; no auditable |
| Extender `appointments.status` con 3 estados nuevos | FSM `scheduled→checked-in→in-service` es flujo barbería real, incompatible con solo `pending/confirmed` | Reusar `pending` confunde semántica y rompe reportes; extensión aditiva con check constraint ampliado es backward compatible |
| Advisory lock ya existente (032) se extiende a validación horario por barbero | Prevenir reserva fuera de horario/vacaciones de forma transaccional | Validación solo UI es bypasseable vía `curl` |
