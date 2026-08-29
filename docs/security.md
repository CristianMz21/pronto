# Security — Pronto Barber

> Baseline T009. Luego de `docker compose up`, verificar siempre `Supabase Dashboard → Advisors → Security Advisor`.

## RLS

Todas las tablas tienen `enable row level security` + policy `tenant_access_* using (business_id in (select my_business_ids()))` donde `my_business_ids() = businesses.owner_id = auth.uid() union employees.user_id = auth.uid() and is_active`.

Nuevas tablas (036..086) siguen patrón + `GRANT ALL anon,authenticated` (001 pattern) + `SECURITY DEFINER stable set search_path = public` en helpers.

### RLS per location (006)

- `locations`, `holidays`, `waitlist`, `recurring_appointments`, `tips`, `memberships`, `client_memberships`, `promotions`, `campaigns`, `campaign_recipients` todas con `tenant_access_*` por `business_id`.
- `appointments/location_id` y `transactions/location_id` filtrados en queries server (`eq('location_id', selectedLocation)` solo si multi-sede). V1 mantiene `location_id nullable` — single-sede no rompe RLS existente (toda query incluye `business_id`).
- Futuro `my_location_ids()` restringirá `manager` a sede única: ver `lib/auth/roles.ts:getUserLocationIds()` stub (V1 retorna `all` para owner/admin). TODO V2: `my_location_ids()` SQL + policy `location_id IN my_location_ids()`.
- Verificación Advisors: `idx_appointments_location` + `idx_locations_slug` evitan seq scan cross-tenant señalado en Performance Advisor; Security Advisor 0 flags post 048/050/051 (businesses_public view + REVOKE anon en clients + pgsodium fallback).

## Endpoints

- `proxy.ts` protege rutas `/(dashboard|pos|crm|inventory|booking|settings|barberos|servicios|membresias|promociones|crm-campaigns|reportes|sucursales)` → redirect `/login`.
- `api/*` **no** está detrás de proxy; depende de `auth.getUser()` + `eq('business_id', business.id)` en cada handler. Todo `api/*` nuevo (006) con `Zod` + `isomorphic-dompurify` sanitize + `rateLimit` (ver `lib/rate-limit.ts`):
  - `api/book` 20/10m, `api/waitlist` 60/10m, `api/recurring` 30/10m, `api/tips` 60/10m, `api/memberships*` 60/10m, `api/promotions*` 60-120/min, `api/loyalty` 60/min, `api/campaigns*` 20/10m + 10/h send, `api/locations*` 60/10m + 30/min delete, `api/holidays` 60/10m, `api/inventory/transfer` 30/10m, `api/business/{hours,tax,whatsapp-verify}` 30-10/min, `api/pos/transaction` 60/10m, `api/reports` 60/min, `api/crm/segments` 60/min.
- `api/cron/notify` y `api/cron/recurring-generate` protegidos por `Authorization: Bearer CRON_SECRET` (no `INTERNAL_API_SECRET`) — sin rateLimit, ya protegidos por secreto rotatable.
- `api/email/confirm` protegido por `INTERNAL_API_SECRET` (server-to-server `fetch` desde `api/book`).
- `api/inventory/[id]/photo` usa `supabase storage inventory` — validar MIME y size server-side.

## Secrets

Env: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`, `INTERNAL_API_SECRET` — solo en `.env`, nunca en `NEXT_PUBLIC_*`.

DB por negocio: `smtp_pass`, `resend_api_key`, `telegram_bot_token`, `meta_whatsapp_access_token` — protegidos por RLS; 016 ya revocó `public_read_businesses_for_booking` que los exponía anon. No volver a crear políticas `using (true)` en `businesses`.

## PII / pgsodium — BOUNDARY (050 local PASS, 051 fallback)

`045` añadió `clients.phone_encrypted / email_encrypted / whatsapp_encrypted bytea`. `050` añadió boundary vault-aware; `051` lo hace **LOCAL PASS** sin romper `supabase db reset`:
- `public.encrypt_pii(text) → bytea` / `public.decrypt_pii(bytea) → text` usan **pgsodium primary** (`pgsodium.crypto_aead_det_encrypt/decrypt` con `key_id` `pii_escuderia` creado lazy via `pgsodium.create_key`) y **pgcrypto fallback dev-only** (`extensions.pgp_sym_encrypt/decrypt` con key `dev-only-not-prod-32bytes-escuderia`) si pgsodium no tiene permisos / vault no configurado. Local siempre encripta → `phone_encrypted = \x…` (no NULL).
- Trigger `trg_encrypt_phone` `BEFORE INSERT OR UPDATE OF phone ON clients` dual-write: si `phone IS NOT NULL AND phone_encrypted IS NULL` → `phone_encrypted := encrypt_pii(phone)`; `phone` en claro se mantiene para índices/búsquedas.
- Vista `clients_secure` (`security_invoker=true` si PG15+) expone `phone_secure = decrypt_pii(phone_encrypted)` solo a `authenticated` (`GRANT SELECT ON clients_secure TO authenticated`, `REVOKE SELECT ON clients FROM anon` reafirmado en 050/051).
- **LOCAL (051)**: `supabase/config.toml` `[db.vault] secret = "dev-only-not-prod-32bytes-escuderia"` (dev-only, determinística) + fallback pgcrypto → `phone_encrypted` activo, `pg_dump` local ya no expone solo clear (existe bytea), RLS + cifrado. Ver `supabase/migrations/051_vault_local_fallback.sql`.
- **PROD Cloud**: **DEBE rotar** la dev key inmediatamente: generar prod key con `openssl rand -hex 32`, configurar via `supabase secrets` o Cloud Dashboard → Vault, crear `pgsodium` key `pii_escuderia` real, re-backfill `UPDATE clients SET phone_encrypted = encrypt_pii(phone) WHERE phone_encrypted IS NULL` y verificar `select decrypt_pii(phone_encrypted)`.
- `048` ya había cerrado fuga `businesses` con `businesses_public` view + `REVOKE SELECT ON businesses FROM anon`.

## Hardening Checklist

- [x] `Security Advisor` 0 errors, 0 warnings — verificado post 086: REVOKE anon en clients/businesses, headers HSTS/X-Frame/CSP en next.config.js, pgsodium fallback documentado
- [ ] `supabase gen types typescript --local` regenera `lib/supabase/database.types.ts` tras migraciones
- [x] `zod` + `isomorphic-dompurify` en todo `api/*` que reciba input usuario — 006 completo (ver Endpoints arriba)
- [x] `rate-limit.ts` en `book` (20/10m) + `import` 20/10m + todo `api/*` nuevo con rateLimit (lista arriba)
- [ ] `proxy.ts` no expone `x-user-id` spoofeable (solo set por middleware, no por cliente)
- [ ] `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` no filtrable vía `.env` en compose (hardcodeado)
- [ ] Storage `inventory` bucket con RLS file-level si aplica
- [ ] `certs/supabase-ca.crt` usado en `scripts/migrate.js` con `rejectUnauthorized: true`

## Observabilidad

`notification_log` (002) evita duplicados. Nuevo `audit_log` (T041) para `transactions/payments/cash_registers/appointments/inventory` con `who, what, when, record`.

## Backups

Ver `docs/backup.md` (T042): `pg_dump` via `DATABASE_URL` + Supabase PITR.
