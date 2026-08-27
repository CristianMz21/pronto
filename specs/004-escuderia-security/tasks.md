# Tasks: Escudería Seguridad Crítica

**Input**: `specs/004-escuderia-security/spec.md`, `plan.md`

## Phase 1: Bcrypt (P1)

- [x] T001 `supabase/config.toml` `minimum_password_length=8` (was 6) + `password_requirements="lower_upper_letters_digits_symbols"` + `secure_password_change=true`
- [x] T002 `supabase stop && supabase start` + `curl` weak 7chars → 422 `length+characters`, strong `Escuderia1!` → 200, `psql` `$2a$10$` 4 rows

## Phase 2: Cifrado (P1)

- [x] T003 `045_security_hardening_escuderia.sql` pgsodium conditional (`create extension if not exists pgsodium`, `phone_encrypted` bytea, `RAISE NOTICE` if no vault), no bloqueo `supabase db reset`

## Phase 3: RLS + Headers (P1)

- [x] T004 RLS audit: `048_security_rls_view.sql` independent audit `RAISE EXCEPTION` if missing `relrowsecurity`, `VIEW businesses_public` (id,name,slug,type,phone,address,timezone,currency,brand_color) + `GRANT anon/authenticated` + `REVOKE SELECT ON businesses FROM anon` + column-level `REVOKE (smtp_pass,resend_api_key)` DO-catch, verified `anon 42501` blocked
- [x] T005 `next.config.js` headers HSTS/CSP (removed `unsafe-eval` + `object-src none base-uri self`)/X-Frame Deny + `curl -I` 200 `Strict-Transport-Security`, `npm run build` 51 rutas

## Phase 4: Integridad negocio (auditoría 61 requisitos)

- [x] T006 `supabase/seed.sql` + `seed-escuderia.sql` regenerados (108/75 líneas COPY/INSERT `\.` válidos): 5 services COP (15k/20k/25k/30k/45k), 4 employees (Owner #1a1a1a 50%, Ana #ec4899 50%+10k, Luis #0ea5e9 45%, Miguel #f59e0b 50%), 15 employee_services, 7 business_hours Lun-Sáb 09-20 Dom cerrado, 1 location Centro — verified `supabase db reset` → 5/4/15
- [x] T007 `046_commission_trigger_update.sql`: `AFTER INSERT OR UPDATE OF status WHEN completed` + dedup `commissions.transaction_id` — verified pending→completed genera 1 commission, duplicate skip
- [x] T008 `047_appointment_fsm_guard.sql`: `check_fsm_transition() BEFORE UPDATE OF status` matrix pending→scheduled|confirmed, scheduled→confirmed, confirmed→checked_in, checked_in→in_service, in_service→completed, completed→paid, terminal blocked — verified 9 transitions
- [x] T009 `lib/booking-availability.ts` DEFAULT_HOURS Lun-Sáb `dow 1-6` (era 1-5) + `lib/utils.ts` formatDate/Time/InBusinessTimezone default `es-CO` (era en-US) + `app/escuderia/layout.tsx` viewport themeColor #0A0A0A + `next.config` CSP no unsafe-eval — verified lint 0 errors, test:unit 29/29, build 51 rutas
- [x] T010 `docs/security.md` + `spec.md SC-002` marcados PARTIAL pgsodium (columnas bytea listas, cifrado real requiere vault Cloud), `tests/unit/booking-availability.test.ts` updated Sáb true
