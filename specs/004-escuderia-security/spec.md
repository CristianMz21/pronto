# Feature Specification: Escudería Seguridad Crítica — Cifrado, Bcrypt, RLS

**Feature Branch**: `004-escuderia-security`

**Created**: 2026-08-27

**Status**: Draft

**Input**: Barbería Escudería single sede (1 business) ahora, enfocarse en temas críticos: cifrado (pgsodium/Vault), bcrypt hardening, RLS audit, headers, rate-limit.

## User Scenarios & Testing

### User Story 1 — Passwords con bcrypt robusto (Priority: P1)

Como owner quiero que las contraseñas se hasheen con bcrypt y requieran 8+ chars con complejidad, para que ni un dump filtre passwords en claro.

**Why this priority**: Supabase Auth usa bcrypt (GoTrue) pero el default es 6 chars sin complejidad → rainbow tables. Es el riesgo #1.

**Independent Test**: `curl POST /auth/v1/signup` con `pass=12345` → 422 `weak password`; con `Abc123!@` → 200. `supabase/auth.users.encrypted_password` empieza con `$2a$` (bcrypt) y no en claro.

**Acceptance Scenarios**:

1. **Given** `auth` config con `minimum_password_length=8` y `password_requirements=lower_upper_letters_digits_symbols`, **When** intento `password=abc123`, **Then** 422 `Password should contain at least one digit, uppercase, etc.`
2. **Given** `password` válido `Escudería2026!`, **When** se crea `auth.users`, **Then** `encrypted_password` es `$2a$10$...` y no igual al plain

---

### User Story 2 — PII cifrada en reposo (Priority: P1)

Como cliente quiero que mi teléfono/email no se lea en un `SELECT` sin clave, por si hay leak de backup.

**Why this priority**: Teléfonos +57 son PII crítico en Colombia. RLS no cubre backups filtrados; pgsodium sí.

**Independent Test**: `select phone from clients` sin `pgsodium` → muestra `+57 ...` en claro (antes); con `pgsodium` + `vault` → columna `phone_encrypted` bytea y `phone` es vista descifrada solo para `authenticated` con clave.

**Acceptance Scenarios**:

1. **Given** `pgsodium` + `vault` habilitados, **When** inserto `clients.phone='+57 300...'`, **Then** se guarda `phone_encrypted` (bytea) y `phone` es `null` o vista
2. **Given** `anon` sin clave, **When** `select * from clients`, **Then** no ve `phone` en claro (RLS + column privilege)

---

### User Story 3 — RLS audit sin fugas multi-tenant (Priority: P1)

Como owner de Escudería quiero que nadie vea `cristain` si es de otro tester, y que `anon` no lea `smtp_pass`.

**Why this priority**: Ya vimos `cristain` junto a `escuderia` en `pg_dump` — si RLS falla, un `anon` ve todo.

**Independent Test**: `psql` como `anon` (`SET ROLE anon; select * from businesses`) → solo ve `public` para `book`, no `smtp_pass` column.

**Acceptance Scenarios**:

1. **Given** `anon`, **When** `select smtp_pass from businesses`, **Then** 0 rows o `42501` (no privilege)
2. **Given** `authenticated` como `test@barber.local`, **When** `select * from businesses`, **Then** solo `escuderia` (1 row), no `cristain`

---

### Edge Cases

- Cambio de `minimum_password_length` no invalida passwords viejos (solo nuevos signups) → documentar
- `pgsodium` requiere `vault` key en `supabase/config.toml` `[db.vault] secret_key` — si falta, migración skip con NOTICE
- RLS `my_business_ids()` con `SECURITY DEFINER` debe tener `search_path=public` (ya en 005)
- Rate-limit `sign_in_sign_ups=30/5m` no bloquea owner legítimo en día de alta masiva → tuneable

## Requirements

### Functional Requirements

- **FR-001**: System MUST set `supabase/config.toml` `minimum_password_length=8` y `password_requirements="lower_upper_letters_digits_symbols"` (o `letters_digits` mínimo) y `secure_password_change=true` y `double_confirm_changes=true`
- **FR-002**: System MUST habilitar `pgsodium` (`create extension if not exists pgsodium`) y `vault` (`supabase/vault` o `pgsodium` key) para cifrar `clients.phone`/`email`/`whatsapp_number` y `employees.phone/email` (columna `*_encrypted` bytea + vista descifrada), con fallback si no hay `vault` → solo RLS + `GRANT` column-level
- **FR-003**: System MUST auditar RLS: toda tabla `public.*` con `enable row level security` y `tenant_access_*` `business_id in (select my_business_ids())`, y revocar `anon` de columnas sensibles (`smtp_pass`, `resend_api_key`, `telegram_bot_token`, `meta_whatsapp_access_token`) via `REVOKE`
- **FR-004**: System MUST añadir `next.config.js` headers: `Strict-Transport-Security`, `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Content-Security-Policy` (default-src self), `Referrer-Policy strict-origin`
- **FR-005**: System MUST mantener `lib/rate-limit.ts` en `sign_in_sign_ups` (30/5m) y en `POST /api/book` (20/10m) y en `/api/clients/import` (20/10m) — ya existe, verificar

### Key Entities

- **AuthUser**: `auth.users.encrypted_password` `$2a$10$` bcrypt, `raw_app_meta_data.provider=email`
- **Client**: `phone_encrypted bytea`, `phone` vista descifrada (o `phone` plain si no vault)
- **Business**: columnas sensibles `smtp_pass`, `resend_api_key` con `REVOKE` anon

## Success Criteria

### Measurable Outcomes

- **SC-001**: `curl signup` con `pass=123` → 422 <100ms; con `Strong1!` → 200 y `encrypted_password` `$2a$`
- **SC-002**: `select phone_encrypted from clients` muestra `\\x...` (bytea) y `select phone from clients_view` muestra `+57...` solo para `authenticated` — **PARTIAL en local**: columnas `phone_encrypted bytea` existen (045) pero `phone` sigue en claro; cifrado real requiere `vault` key en Cloud (ver `docs/security.md` PII PARTIAL). Local protege via RLS + `businesses_public` view (048).
- **SC-003**: `anon` `select smtp_pass` → 0 rows; `authenticated` owner → 1 row `escuderia`
- **SC-004**: `curl -I https://localhost:3000/` → headers `strict-transport-security` + `x-frame-options: DENY`
- **SC-005**: `pg_dump` filtrado no expone `phone` en claro si `pgsodium` activo

## Assumptions

- Single barbería `escuderia` ahora, pero RLS `my_business_ids()` ya es multi-tenant safe
- Supabase Auth `bcrypt` cost 10 es suficiente (no se cambia cost sin migrar GoTrue)
- `pgsodium` en local puede no tener `vault` key → migración 045 será conditional `IF NOT EXISTS` + `RAISE NOTICE` y no bloquea `supabase db reset`
- No se cifra `appointments`/`transactions` (no PII), solo `clients`/`employees` PII
