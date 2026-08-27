# Security — Pronto Barber

> Baseline T009. Luego de `docker compose up`, verificar siempre `Supabase Dashboard → Advisors → Security Advisor`.

## RLS

Todas las tablas tienen `enable row level security` + policy `tenant_access_* using (business_id in (select my_business_ids()))` donde `my_business_ids() = businesses.owner_id = auth.uid() union employees.user_id = auth.uid() and is_active`.

Nuevas tablas (036..041) deben seguir patrón + `GRANT ALL anon,authenticated` (001 pattern) + `SECURITY DEFINER stable set search_path = public` en helpers.

## Endpoints

- `proxy.ts` protege rutas `/(dashboard|pos|crm|inventory|booking|settings)` → redirect `/login`.
- `api/*` **no** está detrás de proxy; depende de `auth.getUser()` + `eq('business_id', business.id)` en cada handler. Revisar: `api/book` (ok, service-role + validación Zod), `api/appointments/[id]` (ok, `business_id` filter), `api/clients/import` y `api/inventory/*` (pendiente: agregar `rateLimit` + `business_id` check).
- `api/cron/notify` protegido por `Authorization: Bearer CRON_SECRET` (no `INTERNAL_API_SECRET`).
- `api/email/confirm` protegido por `INTERNAL_API_SECRET` (server-to-server `fetch` desde `api/book`).
- `api/inventory/[id]/photo` usa `supabase storage inventory` — validar MIME y size server-side.

## Secrets

Env: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`, `INTERNAL_API_SECRET` — solo en `.env`, nunca en `NEXT_PUBLIC_*`.

DB por negocio: `smtp_pass`, `resend_api_key`, `telegram_bot_token`, `meta_whatsapp_access_token` — protegidos por RLS; 016 ya revocó `public_read_businesses_for_booking` que los exponía anon. No volver a crear políticas `using (true)` en `businesses`.

## Hardening Checklist

- [ ] `Security Advisor` 0 errors, 0 warnings
- [ ] `supabase gen types typescript --local` regenera `lib/supabase/database.types.ts` tras migraciones
- [ ] `zod` + `isomorphic-dompurify` en todo `api/*` que reciba input usuario
- [ ] `rate-limit.ts` en `book` (20/10m) extendido a `import` (ej: 10/min)
- [ ] `proxy.ts` no expone `x-user-id` spoofeable (solo set por middleware, no por cliente)
- [ ] `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` no filtrable vía `.env` en compose (hardcodeado)
- [ ] Storage `inventory` bucket con RLS file-level si aplica
- [ ] `certs/supabase-ca.crt` usado en `scripts/migrate.js` con `rejectUnauthorized: true`

## Observabilidad

`notification_log` (002) evita duplicados. Nuevo `audit_log` (T041) para `transactions/payments/cash_registers/appointments/inventory` con `who, what, when, record`.

## Backups

Ver `docs/backup.md` (T042): `pg_dump` via `DATABASE_URL` + Supabase PITR.
