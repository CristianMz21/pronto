# Quickstart — Pronto Barber

**Feature**: `001-pronto-barber-platform` | **Prerrequisitos**: Docker, Docker Compose, cuenta Supabase gratuita, Node 20+

## 1. Clonar y remotos

```bash
git clone https://github.com/SGrappelli/pronto.git escudero
cd escudero
git remote rename origin upstream
git remote add origin <TU-REPOSITORIO-PRIVADO>
```

## 2. Entorno

```bash
cp .env.example .env
# Editar .env:
# NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres  # 5432, no pooler
# CRON_SECRET=$(openssl rand -hex 32)
# INTERNAL_API_SECRET=$(openssl rand -hex 32)
# NEXT_PUBLIC_APP_URL=http://localhost:3000
# NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

En Supabase Dashboard → Authentication → Providers → Email → desmarcar "Confirm email" → Save.
Storage → New bucket `inventory` (public).

## 3. Levantar

```bash
docker compose up -d
docker compose logs -f migrate  # debe terminar "Migrations complete"
docker compose logs -f app
open http://localhost:3000
```

Health: `http://localhost:3000/api/health` → 200.

## 4. Verificar baseline (FASE 1)

- `/register` → crear owner → redirect `/onboarding` → completar barbería
- `/dashboard` → sparkline
- `/booking` → calendario drag&drop
- `/crm` → crear cliente, import CSV
- `/pos` → venta con método cash/card/transfer
- `/inventory` → crear producto, SKU, barcode
- `/book/<slug>` → reserva pública sin cuenta
- PWA: `http://localhost:3000/offline` debe existir (precache)

## 5. Tests

```bash
npm run lint
npm run test:unit   # después de hardening (vitest)
npm run test:e2e    # playwright — flujo cliente→reserva→pos→historial
```

## 6. Spec Kit workflow (para features nuevas)

```bash
specify check
# Flujo:
# /speckit.constitution → /speckit.specify → /speckit.clarify → /speckit.plan → /speckit.tasks → /speckit.implement → /speckit.analyze
# Archivos en specs/001-pronto-barber-platform/{spec.md,plan.md,research.md,data-model.md,quickstart.md,tasks.md}
# Constitución en .specify/memory/constitution.md
```

## 7. Deployment staging/production

```bash
docker compose up -d --build  # VPS
# Configurar: NEXT_PUBLIC_APP_URL=https://barberia.com, APP_DOMAIN, Supabase SSL cert certs/supabase-ca.crt
# Advisors → Security Advisor → fix flags → backup strategy en docs/backup.md
```
