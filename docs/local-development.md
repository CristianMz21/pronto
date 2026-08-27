# Local Development — Pronto Barber

> Fuente: `specs/001-pronto-barber-platform/quickstart.md`. Este archivo es la guía operativa para levantar Pronto Barber desde cero.

**Stack**: Next.js 16 + React 19 + Supabase (PostgreSQL) + Docker + Serwist PWA
**Prerrequisitos**: Docker, Docker Compose, **Supabase CLI** (`brew install supabase/tap/supabase`), Node 20+ (local Node 24 verificado), `openssl`, `git`

> **Modo LOCAL 100%** (recomendado, verificado 2026-08-27): `supabase start` local en `127.0.0.1:54321/54322/54323` + `npm run dev` en `localhost:3000`. No necesitas cuenta Supabase Cloud. Ver sección 2B.

## 1. Clonar y remotos

```bash
git clone https://github.com/SGrappelli/pronto.git escudero
cd escudero
git remote rename origin upstream
git remote add origin <TU-REPOSITORIO-PRIVADO>
git remote -v # upstream → SGrappelli/pronto, origin → tu remoto
```

## 2. Entorno (.env)

```bash
cp .env.example .env
# Editar .env — generar secrets:
openssl rand -hex 32 # → CRON_SECRET
openssl rand -hex 32 # → INTERNAL_API_SECRET
```

**Valores obligatorios en `.env`**:

### Opción A — Supabase Cloud
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres  # 5432 directo, no pooler 6543
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=<hex32>            # ya generado por setup (ver .env)
INTERNAL_API_SECRET=<hex32>    # ya generado
```

### Opción B — Local 100% (verificado, recomendado para dev)
```bash
supabase start # crea supabase/config.toml si no existe, levanta DB 54322 + API 54321 + Studio 54323
supabase status -o env # copia ANON_KEY, SERVICE_ROLE_KEY, DB_URL
# .env local (ya configurado en este repo):
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi... (ANON_KEY de status)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (SERVICE_ROLE_KEY)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
MIGRATE_SSL=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Supabase Dashboard** (Cloud, antes de `docker compose up`):

1. `Authentication → Providers → Email` → desmarcar **Confirm email** → Save.
2. `Storage → New bucket` → nombre `inventory` → Public → Create.
3. `Database → Extensions` → habilitar `pg_cron` + `pg_net` si quieres cron DB-level (opcional; si no, ver paso 6).

**Local**: `supabase/config.toml` ya tiene `enable_confirmations=false` (no confirma email) y bucket `inventory` se crea vía `psql` o Studio. `007_cron_jobs.sql` ya es local-safe (DO $pronto_outer$ con pg_cron conditional).

> `.env` ya está configurado para LOCAL con `CRON_SECRET=8c7a1001...` y `INTERNAL_API_SECRET=9490ca6b...`.

## 3. Levantar — Local 100% (verificado)

```bash
# Terminal 1 — Supabase Local
supabase start
# esperar "Started supabase local development setup" → Studio http://127.0.0.1:54323, API http://127.0.0.1:54321, DB 54322
supabase status -o env # verificar ANON_KEY etc
# Crear bucket inventory (si no existe)
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "insert into storage.buckets (id,name,public) values ('inventory','inventory',true) on conflict (id) do nothing;"

# Terminal 2 — Next.js
npm ci # primera vez
npm run dev -- --turbopack # http://localhost:3000
# esperar "Ready in 620ms" → http://localhost:3000
```

Chequeos:

```bash
curl -i http://localhost:3000/api/health # → 200 {"status":"ok"}
curl -i http://127.0.0.1:54321/auth/v1/health # → GoTrue
open http://127.0.0.1:54323 # Studio
open http://127.0.0.1:54324 # Mailpit (emails locales)
```

**Con Docker (Cloud)**:

```bash
docker compose up -d
docker compose logs -f migrate  # esperar "✓ Migrations complete."
docker compose logs -f app      # esperar "Ready on http://0.0.0.0:3000"
open http://localhost:3000
```

## 4. Verificar baseline (FASE 1 — smoke tests)

| Ruta | Qué probar |
|------|------------|
| `/register` | Crear owner → redirect `/onboarding` → completar barbería (nombre, slug, timezone `America/Bogota`, currency `COP`) |
| `/dashboard` | Sparkline 7 días, revenue hoy |
| `/booking` | Calendario drag&drop, break config |
| `/crm` | Crear cliente (nombre+tel+tags), import CSV |
| `/pos` | Venta `cash/card/transfer`, `items jsonb`, `receipt_number` |
| `/pos/history` | Búsqueda por cliente |
| `/inventory` | Crear producto SKU/barcode, movimientos, low-stock |
| `/book/<slug>` | Reserva pública sin cuenta: servicio→barbero→fecha→hora→nombre/tel→confirmar |
| `/offline` | Debe existir (precache Serwist `additionalPrecacheEntries`) |
| `/es`, `/pricing` | i18n `es`, `pt` |

**Script de verificación rápida** (sin DB):

```bash
npm run lint
npm run build -- --webpack # valida next build + Serwist sw.ts → public/sw.js
```

## 5. Tests (después de T007)

```bash
npm run lint
npm run test:unit   # vitest — lib/utils, booking-availability, currency COP
npm run test:e2e    # playwright — cliente→reserva→recepción→POS→historial
```

## 6. Notificaciones / Cron

Si `pg_cron` no está habilitado, la migración `007_cron_jobs.sql` hace skip con warning. Alternativa:

```bash
# External cron (cron-job.org) cada 15 min:
GET https://barberia.com/api/cron/notify
Header: Authorization: Bearer <CRON_SECRET>
```

Messenger creds (Telegram/WhatsApp/Viber) se configuran en `Settings → Notifications` por negocio, no en `.env`, salvo fallback env vars.

## 7. Troubleshooting

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `DATABASE_URL is not set` en `migrate` | `.env` sin `DATABASE_URL` | Copiar URI Session mode 5432 de Supabase |
| `social` login falla | Email confirm aún activo | Desmarcar Confirm email |
| `inventory` fotos 403 | Bucket no creado | Crear bucket `inventory` public |
| `007_cron_jobs.sql skipped` | `pg_cron` no habilitado | Habilitar extension o usar cron externo |
| `public/sw.js` no genera | Build con Turbopack | `npm run build -- --webpack` (Serwist no soporta Turbopack) |
| `CRON_SECRET` mismatch | `.env` no inyectado en `007` | `docker compose up -d --force-recreate` tras editar `.env` |

## 8. Spec Kit workflow

```bash
specify check
# /speckit.constitution → /speckit.specify → /speckit.clarify → /speckit.plan → /speckit.tasks → /speckit.implement → /speckit.analyze
# Artefactos: specs/001-pronto-barber-platform/{spec.md,plan.md,research.md,data-model.md,quickstart.md,tasks.md}
# Constitución: .specify/memory/constitution.md
```
