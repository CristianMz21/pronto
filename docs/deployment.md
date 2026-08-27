# Deployment — Pronto Barber

**Fecha**: 2026-08-27 | **Env**: `selfhosted` | **Domain**: `barberia-demo`/`barberia.com` (ejemplo)

## 1. Pre-requisitos VPS

- 1 vCPU / 2GB RAM mínimo, Docker + Docker Compose, dominio + DNS
- Supabase: usar **local** (`supabase start` 54321) o **Cloud** (`supabase.com`)
- Secrets: `openssl rand -hex 32` para `CRON_SECRET` + `INTERNAL_API_SECRET`
- **Docker BuildKit**: `next/font` (Playfair/ Montserrat/ Bricolage) requiere fetch a `fonts.googleapis.com` en build. Si `docker compose build` falla con `ETIMEDOUT 64.233.186.95:443`/`ENETUNREACH`, usa `build.network: host` (ya configurado en `docker-compose.yml`) o `docker build --network=host`.

## 2. Env (`.env`) — Variables requeridas para prod

**Requeridas** (8 + opcionales):
- `NEXT_PUBLIC_SUPABASE_URL` — `http://127.0.0.1:54321` local o `https://<ref>.supabase.co` Cloud
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (Supabase Dashboard → API)
- `SUPABASE_SERVICE_ROLE_KEY` — service_role (nunca `NEXT_PUBLIC`, solo servidor)
- `DATABASE_URL` — `postgresql://postgres:postgres@127.0.0.1:54322/postgres` local, `postgresql://postgres.<ref>:<pwd>@db.<ref>.supabase.co:5432/postgres` Cloud (puerto 5432 directo, no pooler 6543)
- `CRON_SECRET` — `openssl rand -hex 32` (protege `/api/cron/notify` `Authorization: Bearer`)
- `INTERNAL_API_SECRET` — `openssl rand -hex 32` (protege `/api/email/confirm` server-to-server)
- `NEXT_PUBLIC_APP_URL` — `https://barberia.com` (links booking, emails, canonical)
- `RESEND_API_KEY` — `re_...` o `SMTP_HOST/PORT/USER/PASS/FROM` (uno de los dos)

**Opcionales**: `NEXT_PUBLIC_SITE_URL` (alias APP_URL), `TELEGRAM_BOT_TOKEN`, `VIBER_BOT_TOKEN`, `META_WHATSAPP_*`, `APP_DOMAIN` (para redirect www→non-www)

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

`docker-compose.yml` separa local/prod via `env_file: .env` + hardcode `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` en `environment:` (override intencional, previene SaaS accidental). Local usa `network_mode: host` para que `migrate` alcance `127.0.0.1:54322` (supabase local); Cloud usa mismo compose (Cloud host externo funciona igual en host network).

## 3. Build & Run (Docker — standalone)

```bash
git clone https://github.com/<tu-org>/pronto-barber.git
cd pronto-barber
cp .env.example .env  # completar 8 vars requeridas
docker compose config  # verifica: NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted hardcodeado, migrate antes de app, healthcheck wget /api/health
docker compose build   # usa build.network: host para next/font (si falla, docker build --network=host -t pronto-app:local .)
docker compose up -d
docker compose logs -f migrate  # ✓ Migrations complete (001..050 incl. caja/commissions, FSM guard)
docker compose logs -f app      # Ready on http://0.0.0.0:3000
curl -i http://localhost:3000/api/health  # {"status":"ok"}
curl -s http://localhost:3000/escuderia | grep -q Escudería && echo "Landing OK"
curl -s http://localhost:3000/site.webmanifest | grep -q "Pronto\|Escuder" && echo "PWA OK"
docker compose down  # no zombies
```

`docker-compose.yml` ya tiene `migrate` (one-shot) → `app` (depends_on: completed_successfully, healthcheck `wget /api/health`). `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` hardcodeado en compose. `build.network: host` y `network_mode: host` permiten `migrate` alcanzar supabase local `127.0.0.1:54322` y `next/font` fetch sin `ETIMEDOUT`. Si Docker no disponible o falla por recursos/red, documenta `BLOCKED — EXTERNAL DEPENDENCY` con motivo (ver `docs/production-runbook.md` §10).

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
