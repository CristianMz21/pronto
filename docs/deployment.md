# Deployment — Pronto Barber

**Fecha**: 2026-08-27 | **Env**: `selfhosted` | **Domain**: `barberia-demo`/`barberia.com` (ejemplo)

## 1. Pre-requisitos VPS

- 1 vCPU / 2GB RAM mínimo, Docker + Docker Compose, dominio + DNS
- Supabase: usar **local** (`supabase start` 54321) o **Cloud** (`supabase.com`)
- Secrets: `openssl rand -hex 32` para `CRON_SECRET` + `INTERNAL_API_SECRET`

## 2. Env (`.env`)

```
NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321  # o https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres  # 5432 Cloud, no pooler
MIGRATE_SSL=false  # true para Cloud con certs/supabase-ca.crt
NEXT_PUBLIC_APP_URL=https://barberia.com
NEXT_PUBLIC_SITE_URL=https://barberia.com
CRON_SECRET=<hex32>
INTERNAL_API_SECRET=<hex32>
RESEND_API_KEY=re_...  # o SMTP_*
APP_DOMAIN=barberia.com  # para redirect www→non-www (proxy.ts)
```

## 3. Build & Run (Docker)

```bash
git clone https://github.com/<tu-org>/pronto-barber.git
cd pronto-barber
cp .env.example .env  # completar
docker compose up -d --build
docker compose logs -f migrate  # ✓ Migrations complete (041-043 incl. caja/commissions)
docker compose logs -f app      # Ready on http://0.0.0.0:3000
curl -i https://barberia.com/api/health  # 200
```

`docker-compose.yml` ya tiene `migrate` (one-shot) → `app` (depends_on: completed_successfully, healthcheck `wget /api/health`). `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` hardcodeado en compose.

## 4. Dominio / HTTPS

- **Cloudflare Tunnel** (recomendado): `cloudflared tunnel create barberia && cloudflared tunnel route dns barberia barberia.com`
- O **Nginx** (descomentar en compose): `nginx:80/443` con `nginx.conf` + `ssl/` + `certbot`
- `next.config.js` ya hace redirect `www.<APP_DOMAIN>` → `https://<APP_DOMAIN>` si `APP_DOMAIN` seteado

## 5. Supabase Storage

```bash
# Local
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -c "insert into storage.buckets (id,name,public) values ('inventory','inventory',true) on conflict do nothing;"
# Cloud: Dashboard → Storage → New bucket `inventory` public
```

## 6. Cron

- **DB** (`007`): si `pg_cron` habilitado, `cron.schedule('pronto-notify','*/15 * * * *', net.http_get(...))` con `host.docker.internal:3000` (local) o `https://barberia.com`
- **Externo** (recomendado si no pg_cron): `cron-job.org` cada 15m `GET https://barberia.com/api/cron/notify` `Authorization: Bearer <CRON_SECRET>`

## 7. Verificación staging → prod

```bash
npm run lint && npm run test:unit && npm run build -- --webpack
supabase status  # 54321/54322/54323 OK
curl -s https://barberia.com/book/barberia-demo | head
# E2E: /register → /onboarding → /dashboard → /booking → /book/<slug> → POS → /caja → /crm
```

## 8. Rollback

- `docker compose down && docker compose up -d --build` re-ejecuta `migrate` (idempotente)
- DB: `supabase db reset` (local, borra data) o `psql < backup.sql` (prod). Ver `docs/backup.md`
- Git: `git log --oneline -5` + `git revert <sha>` si deploy falla
