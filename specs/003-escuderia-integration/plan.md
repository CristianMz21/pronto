# Implementation Plan: Escudería Integración Completa

**Branch**: `003-escuderia-integration` | **Date**: 2026-08-27 | **Spec**: `specs/003-escuderia-integration/spec.md`

**Input**: Feature specification from `/specs/003-escuderia-integration/spec.md`

## Summary

Single barbería Escudería (1 business, 1 location default Centro) con arquitectura multi-sede lista (locations table, location_id nullable en employees/services/appointments), admin blindado (proxy + RLS my_business_ids() + layout owner/employee), y landing 100% dinámica (business, services, employees, hours, stats desde DB, 0 hardcode de negocio).

## Technical Context

**Language/Version**: TypeScript 5 + Next.js 16 App Router, Node 24, Supabase (RLS)

**Primary Dependencies**: `next/font` Playfair+Montserrat, Tailwind, `@supabase/ssr`, `pg` (simulate)

**Storage**: Supabase PostgreSQL (businesses, locations, services, employees, appointments, transactions, business_hours, commissions, cash)

**Testing**: `vitest` 29 tests (proxy, commission, booking-availability, currency), `curl` 200/307, `supabase db reset` 44 migraciones

**Target Platform**: Web (escuderia.com → /escuderia, localhost:3000/escuderia)

**Project Type**: Web application

**Performance Goals**: LCP <2.5s, TTFB <600ms, RLS <50ms, no hardcode rebuild

**Constraints**: Single tenant ahora, `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted`, `location_id` nullable, `x-user-id` no spoof, `suppressHydrationWarning` ya en layout

**Scale/Scope**: 1 landing (`app/escuderia/page.tsx` ~260 lines), 1 migration (044_locations), 1 proxy patch (/caja), 1 layout patch (owner/employee)

## Constitution Check

- [x] I Pronto-First: Reusa `businesses/services/employees` (COP), extiende `app/escuderia` a dinámico sin duplicar
- [x] II Cliente Real: Landing sin hardcode → owner cambia precio en /settings y se ve en <1s
- [x] III Seguridad: proxy + RLS + layout owner/employee, locations RLS, 044 idempotente
- [x] IV Mobile-First: h-[80vh] mobile, 12-col → 4-col, glass-nav, no hardcode rebuild
- [x] V Simplicidad: 1 tabla locations + 3 columnas nullable, no full multi-sede UI en este slice

## Project Structure

```text
specs/003-escuderia-integration/
├── spec.md
├── plan.md (this)
└── tasks.md

supabase/migrations/044_locations.sql
app/escuderia/page.tsx (SSR dynamic)
proxy.ts (/caja)
app/(dashboard)/layout.tsx (owner/employee)
```

**Structure Decision**: Single file `app/escuderia/page.tsx` como Source of Truth para Escudería (no `src/`), `locations` como preparación multi-sede sin romper single.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `locations` + 3 nullable FKs | Preparar multi-sede sin rewrite; 1 location default Centro | Hardcodear `business_id` en cada query bloquearía futuro Norte/Sur |
