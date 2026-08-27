# Production Runbook — Pronto / Escudería

**Fecha**: 2026-08-27 | **Stack**: Next 16 + Supabase PG 17 + Docker | **Mode**: `selfhosted`

---

## 1. DB Outage

### Síntomas
- `/api/health` 500 o timeout
- `migrate` container `ECONNREFUSED` o `ETIMEDOUT` a `DATABASE_URL`
- Dashboard `supabase status` muestra `DB` no healthy o `54322` no responde

### Diagnóstico
```bash
supabase status
# Esperado: API 54321, DB 54322, Studio 54323 — todos healthy
docker ps | grep supabase_db
curl -s http://127.0.0.1:54321/rest/v1/ | head
PGPASSWORD=postgres pg_isready -h 127.0.0.1 -p 54322 -U postgres
# Esperado: accepting connections
docker compose logs migrate --tail=100
```

### Mitigación local (supabase start)
```bash
# 1. Restart local DB
supabase stop
supabase start
# o solo DB:
docker compose -f supabase/docker-compose.yml restart db 2>/dev/null || docker restart supabase_db_escudero

# 2. Verificar
pg_isready -h 127.0.0.1 -p 54322 -U postgres
supabase status

# 3. Si sigue caído: reset (borra data, reaplica 001..050)
supabase db reset
```

### Mitigación producción (Docker standalone + Supabase Cloud)
```bash
# App container
docker compose logs app --tail=100
docker compose restart app
# DB es Supabase Cloud — verificar Dashboard → Database → Health
# Si DB Cloud caída: esperar Supabase status, luego:
docker compose restart migrate  # reaplica pendientes
curl -s https://<APP_DOMAIN>/api/health | jq
```

### Prevención
- `docker-compose.yml` tiene `migrate` one-shot antes de `app` (`depends_on: service_completed_successfully`)
- `app` healthcheck `wget /api/health` — Docker restartea si falla 3 veces
- Monitoreo externo: `cron-job.org` cada 5m `GET https://<APP_DOMAIN>/api/health` → alerta si != 200

---

## 2. Rollback

### Cuándo
- Deploy falló (`docker compose up` → migrate error o app crash)
- Regresión en booking/POS/caja después de deploy

### Procedimiento local
```bash
git log --oneline -10
# Identificar SHA malo (ej. abc1234)
git revert <sha> --no-edit
# O revert rango: git revert <sha-old>..HEAD
supabase db reset              # reaplica migraciones revertidas (idempotente)
npm run build -- --webpack     # verifica 51 routes
docker compose build           # build con network: host para Google Fonts
docker compose up -d --no-build
curl -s http://localhost:3000/api/health | jq
curl -s http://localhost:3000/escuderia | grep -q Escudería && echo "OK"
```

### Procedimiento producción (Supabase Cloud)
```bash
git revert <sha> && git push origin main
# DB: si migración mala ya se aplicó en Cloud:
supabase link --project-ref <ref>          # vincula Cloud
supabase db reset --linked                 # ATENCIÓN: borra data Cloud, reaplica desde 001
# Alternativa sin borrar data:
PGPASSWORD=<pwd> psql "postgresql://postgres.<ref>:<pwd>@db.<ref>.supabase.co:5432/postgres?sslmode=require" \
  -c "delete from schema_migrations where filename='050_bad.sql';"
# Luego revert SQL manual + redeploy
# O restaurar backup:
pg_restore -d "postgresql://..." backup-2026-08-27.sql
# O PITR: Dashboard → Database → Backups → PITR 7d → restore to point-in-time
```

### Verificación post-rollback
```bash
npm run test:unit
npm run lint
curl -s https://<APP_DOMAIN>/api/health
# E2E manual: /register → /onboarding → /dashboard → /book/<slug> → POS → /caja
```

---

## 3. Incident — Secrets / Acceso no autorizado

### Síntomas
- `CRON_SECRET` o `INTERNAL_API_SECRET` filtrado en logs/git
- Acceso no autorizado a `/api/cron/notify` o `/api/email/confirm`
- `clients.phone_encrypted` accedido sin autorización

### Respuesta inmediata
```bash
# 1. Revocar en DB (RLS)
psql $DATABASE_URL -c "REVOKE SELECT ON clients FROM anon; REVOKE SELECT ON businesses FROM anon;"
# Verificar políticas:
psql $DATABASE_URL -c "select * from pg_policies where tablename='clients';"

# 2. Rotar secrets
openssl rand -hex 32  # genera nuevo CRON_SECRET
openssl rand -hex 32  # genera nuevo INTERNAL_API_SECRET
# Actualiza .env + Supabase Cloud Dashboard → Settings → Database → Connection string
# y .env en VPS:
nano .env  # pega nuevos valores
docker compose up -d --force-recreate  # reinicia con nuevos secrets

# 3. Invalidar sesiones
psql $DATABASE_URL -c "delete from auth.refresh_tokens where user_id != 'owner-id';"
# O desde Dashboard → Auth → Users → revoke

# 4. Auditar
# Buscar en logs:
grep -r "CRON_SECRET\|INTERNAL_API_SECRET" logs/ 2>/dev/null | head
git log --oneline --all --grep="secret" | head
# Revisar audit_log si existe:
psql $DATABASE_URL -c "select * from audit_log order by created_at desc limit 20;"
```

### Post-incident
- [ ] Cambiar `SUPABASE_SERVICE_ROLE_KEY` si se filtró (Dashboard → API → Reset)
- [ ] Revisar `docs/security.md` checklist y `Security Advisor`
- [ ] Notificar clientes si PII expuesta (compliance)

---

## 4. Rate Limit — Multi-instance

`lib/rate-limit.ts` es in-memory `Map` sliding window (per-process).

- **Single replica / single Node process**: funciona como documentado (`20/10m` para `/api/book`, `60/10m` para `inventory-import`, `10/60m` para `cash-open/close`, `10/60m` para `cron`).
- **Multi-instance / horizontal scaling**: cada réplica tiene su propio contador, límite real = `N × limit`.

> // PROD: replace with Redis/Upstash if scaling beyond 1 replica

Cuando escales más allá de 1 réplica, reemplaza con store distribuido:

- **Recomendado**: Upstash Redis + `@upstash/ratelimit` o `ioredis` con sliding window.
- Mantén misma API: `rateLimit(ip, { limit, windowMs }) → boolean` pero con `INCR + EXPIRE`.
- Env: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (o `REDIS_URL`).
- No agregues Redis en single-replica Docker Compose; mantén in-memory para simplicidad.

Checklist antes de habilitar multi-réplica:
- [ ] Agregar servicio Redis / proyecto Upstash
- [ ] Reemplazar `lib/rate-limit.ts` implementación (mantener signature)
- [ ] Verificar `api/book` y `api/cron/notify` limits siguen retornando 429 cuando excedidos
- [ ] Load test con 2 réplicas (`docker compose up --scale app=2` → NOTA: con `network_mode: host` no se puede escalar; cambiar a bridge + `extra_hosts` primero)

---

## 5. Security Headers

`next.config.js` `headers()` debe incluir:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy: upgrade-insecure-requests; default-src 'self'; ... object-src 'none'; base-uri 'self'` (sin `unsafe-eval`)

Verifica después de deploy:
```bash
curl -I https://<APP_DOMAIN>/ | grep -i "strict\|x-frame\|csp"
# wss://*.supabase.co debe permanecer en connect-src; upgrade-insecure-requests no rompe realtime
```

---

## 6. PII Encryption (Vault)

- Local: `050_pii_encryption_boundary.sql` es vault-aware. Si `pgsodium.key` `pii_escuderia` falta o vault no configurado, `encrypt_pii()` retorna `NULL` con `RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md'` y trigger es no-op. `supabase db reset` no debe fallar.
- Prod (Supabase Cloud): habilita `[db.vault]` o crea `pgsodium` key `pii_escuderia` via `pgsodium.create_key`. Luego trigger dual-write `phone_encrypted`; `clients_secure` view `phone_secure = decrypt_pii(phone_encrypted)` para `authenticated`. Mantén `phone` plain para índices hasta backfill + cutover.
- View: `clients_secure` `GRANT SELECT TO authenticated` solo; `REVOKE SELECT ON clients FROM anon` reforzado por 048/050.

---

## 7. Branding

- Escudería Obsidian `#0A0A0A` + Gold `#C5A059` + Ivory `#F9F6F1`
- `supabase/seed.sql` y `supabase/seed-escuderia.sql` traen `#0A0A0A` para `business.id 17c1a2b5-5d3b-4d84-bbb1-d361077d4c95` (idempotente migración 049 corrige DBs existentes).
- `isEscuderia` check es `slug === 'escuderia'` primario, `brand_color in ('#0A0A0A','#1a1a1a')` backward compat.

---

## 8. Secrets

- `.env` está gitignored; `.env.example` solo placeholders.
- Verifica antes de push: `git grep -n "SERVICE_ROLE\|CRON_SECRET\|INTERNAL_API_SECRET\|BEGIN PRIVATE\|eyJhbGci"` no debe retornar secrets commiteados (solo refs y placeholders). Local `.env` contiene dev keys `eyJhbGci...` (supabase demo) que no son production secrets.
- Required env producción: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`, `INTERNAL_API_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY` (o SMTP), `APP_DOMAIN` opcional.

---

## 9. Checklist Go-Live (25 items)

### Infra & Config
- [ ] 1. VPS 1 vCPU / 2GB RAM, Docker + Compose instalados, DNS A record apunta a IP
- [ ] 2. `.env` completo con 8 vars requeridas (ver §8) — `openssl rand -hex 32` para secrets
- [ ] 3. `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` hardcodeado en `docker-compose.yml` (no en `.env`)
- [ ] 4. `DATABASE_URL` usa `5432` directo (no pooler 6543), `MIGRATE_SSL=true` para Cloud con `certs/supabase-ca.crt`
- [ ] 5. `docker compose config` muestra `migrate` → `app` `depends_on: service_completed_successfully` y `healthcheck wget /api/health`
- [ ] 6. `docker compose build` OK (con `build.network: host` para Google Fonts `next/font` en BuildKit)
- [ ] 7. `docker compose up -d` OK, `docker compose logs migrate` ✓ Migrations complete, `curl /api/health` 200
- [ ] 8. Supabase Storage bucket `inventory` público creado (local `psql` o Cloud Dashboard)
- [ ] 9. Cron configurado: `cron-job.org` cada 15m `GET /api/cron/notify` `Authorization: Bearer <CRON_SECRET>` o `pg_cron` con `net.http_get`

### Seguridad
- [ ] 10. `next.config.js` headers (HSTS, CSP sin unsafe-eval, etc.) verificados con `curl -I`
- [ ] 11. `proxy.ts` protege `/(dashboard|pos|crm|inventory|booking|settings)` → redirect `/login`
- [ ] 12. RLS habilitado en todas las tablas, `Security Advisor` 0 errors, `supabase gen types` regenerado
- [ ] 13. Secrets no commiteados (`git grep` limpio), `.env` gitignored
- [ ] 14. PII boundary: `050` trigger no rompe `supabase db reset`; prod vault key `pii_escuderia` creada si se requiere cifrado

### Calidad & Data
- [ ] 15. `npm run lint` 0 errors (warnings `setState-in-effect` documentados como harmless)
- [ ] 16. `npm run test:unit` 29 passed (FSM, comisión, currency)
- [ ] 17. `npm run build -- --webpack` 51 routes, `supabase db reset` OK
- [ ] 18. `lib/utils.ts` `formatCurrency` COP `es-CO` → `$ 30.000`, `lib/commission.ts` `Math.round(...*100)/100`, `app/api/cash/*` y `app/api/inventory/import` sin `parseFloat` crudo
- [ ] 19. UI móvil: sin `overflow-x`, inputs `min-h-[44px]`, `grid-cols-1 md:grid-cols-2`, hero `h-[80vh] md:h-screen`, `Playfair_Display` via `next/font`
- [ ] 20. PWA: `withSerwist` `swSrc: app/sw.ts`, `site.webmanifest` `display standalone` `theme_color #0A0A0A`, `/offline` precache, `curl /site.webmanifest` OK
- [ ] 21. SEO: `/escuderia` `title Escudería — Barbería Premium`, `canonical`, `openGraph`, `jsonLd BarberShop` con `address Colombia` y `priceRange` dinámico

### Operaciones
- [ ] 22. Backups: `pg_dump` nightly (crontab `0 3 * * *`), PITR 7d Supabase Cloud, RPO 24h, RTO 1h, restore `supabase db reset --linked` o `pg_restore` verificado
- [ ] 23. Runbook probado: `supabase status`/`pg_isready`/`docker compose restart`, `git revert` + `supabase db reset --linked`, rotación `CRON_SECRET`
- [ ] 24. Monitoreo: `cron-job.org` o UptimeRobot cada 5m en `/api/health`, alerta si != 200
- [ ] 25. E2E manual: `/register` → `/onboarding` → `/dashboard` → `/booking` → `/book/<slug>` → POS → `/caja` → `/crm` OK

---

## 10. Comandos Rápidos

```bash
# Health
curl -s http://localhost:3000/api/health | jq
curl -s http://localhost:3000/escuderia | grep -q Escudería && echo "Landing OK"
curl -s http://localhost:3000/site.webmanifest | head -20

# DB
supabase status
PGPASSWORD=postgres pg_isready -h 127.0.0.1 -p 54322 -U postgres
supabase db reset

# Docker
docker compose config | grep -A2 "NEXT_PUBLIC_DEPLOYMENT_MODE"
docker compose build   # con network: host para next/font
docker compose up -d
docker compose logs -f migrate
docker compose logs -f app
docker compose down

# Build & Tests
npm run lint 2>&1 | tail -20
npm run test:unit 2>&1 | tail -20
npm run build -- --webpack 2>&1 | tail -40
```

Ver también: `docs/security.md`, `docs/deployment.md`, `docs/backup.md`, `specs/004-escuderia-security/spec.md`.
