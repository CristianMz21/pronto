# Implementation Plan: Escudería Seguridad Crítica — Cifrado, Bcrypt, RLS

**Branch**: `004-escuderia-security` | **Date**: 2026-08-27 | **Spec**: `specs/004-escuderia-security/spec.md`

**Input**: Feature specification from `/specs/004-escuderia-security/spec.md`

## Summary

Hardening crítico para Escudería single (1 business) con `locations` multi-sede ready: bcrypt cost 10 + 8 chars + `lower_upper_letters_digits_symbols`, `secure_password_change=true`, `pgsodium` columns `clients.phone_encrypted`, RLS audit `my_business_ids()`, headers HSTS/CSP, rate-limit ya en `api/book` (20/10m).

## Technical Context

**Language/Version**: Supabase Auth (GoTrue) + PostgreSQL 17 + Next.js 16

**Primary Dependencies**: `pgsodium`, `supabase/vault` (optional, conditional), `next.config.js` headers

**Storage**: PostgreSQL `auth.users.encrypted_password` `$2a$10$`, `public.clients.phone_encrypted` bytea

**Testing**: `curl` weak 7chars → 422, strong `Escuderia1!` → 200, `psql` `left(encrypted_password,7)`, `curl -I` HSTS

**Target Platform**: Supabase local 54321 + Next 3000

**Project Type**: Web application

**Performance Goals**: Auth 422 <100ms, RLS <50ms, no `pg_dump` PII leak

**Constraints**: `pgsodium` conditional `IF NOT EXISTS` + `RAISE NOTICE`, no bloqueo `supabase db reset`, `location_id` nullable

**Scale/Scope**: 4 migrations (045 pgsodium bytea + 046 commission UPDATE + 047 FSM guard + 048 RLS view), seed.sql+seed-escuderia.sql (5 services/4 barberos/15 links), 1 config (8 chars), 1 next.config headers (no unsafe-eval)

## Constitution Check

- [x] III Seguridad: bcrypt + pgsodium + RLS + headers + rate-limit
- [x] I Pronto-First: usa `my_business_ids()` existente, no duplica
- [x] V Simplicidad: 045 conditional, no backfill masivo

## Project Structure

```text
supabase/migrations/045_security_hardening_escuderia.sql
supabase/config.toml (8, lower_upper_...)
next.config.js (headers)
specs/004-escuderia-security/{spec,plan,tasks}.md
```

**Structure Decision**: 045-048 + seed.sql + lib/utils (es-CO) + lib/booking-availability (Lun-Sáb) + app/escuderia/layout.tsx. No new src architecture.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| pgsodium conditional | PII cifrada sin bloquear local sin vault key | Hard `create extension pgsodium` fallaría en local sin key |
