# Tasks: Escudería Seguridad Crítica

**Input**: `specs/004-escuderia-security/spec.md`, `plan.md`

## Phase 1: Bcrypt (P1)

- [x] T001 `supabase/config.toml` `minimum_password_length=8` (was 6) + `password_requirements="lower_upper_letters_digits_symbols"` + `secure_password_change=true`
- [x] T002 `supabase stop && supabase start` + `curl` weak 7chars → 422 `length+characters`, strong `Escuderia1!` → 200, `psql` `$2a$10$` 4 rows

## Phase 2: Cifrado (P1)

- [x] T003 `045_security_hardening_escuderia.sql` pgsodium conditional (`create extension if not exists pgsodium`, `phone_encrypted` bytea, `RAISE NOTICE` if no vault), no bloqueo `supabase db reset`

## Phase 3: RLS + Headers (P1)

- [x] T004 RLS audit: `relrowsecurity` t en `businesses/clients`, `my_business_ids()` `search_path=public` (005), `anon` no ve `smtp_pass` (016)
- [x] T005 `next.config.js` headers HSTS/CSP/X-Frame/Deny + `curl -I` 200 `Strict-Transport-Security`, `npm run build` 51 rutas
