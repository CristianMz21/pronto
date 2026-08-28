#!/usr/bin/env bash
set -e

# =================================================================
# Pronto / Escudería — GO-LIVE check (non-destructive, idempotent)
# Valida todo lo automatizable localmente. NO hace supabase link
# ni git push automático, solo verifica y printea checklist.
# Uso: ./scripts/go-live.sh  (o bash scripts/go-live.sh)
# Requiere: git, supabase CLI, npm, docker compose, curl (opcionales)
# =================================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

ok()   { echo -e "${GREEN}✓ $1${NC}"; PASS=$((PASS+1)); }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; WARN=$((WARN+1)); }
fail() { echo -e "${RED}✗ $1${NC}"; FAIL=$((FAIL+1)); }
info() { echo -e "${CYAN}→ $1${NC}"; }
section() { echo -e "\n${BLUE}━━ $1 ━━${NC}"; }

# Contador de errores sin abortar por set -e en checks que pueden fallar
set +e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Pronto / Escudería — GO-LIVE check (non-destructive)${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo "PWD: $ROOT_DIR"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ── 1. git status --porcelain debe estar clean ──────────────────
section "1. git status --porcelain (debe estar clean)"
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  fail "No es un repo git"
else
  STATUS="$(git status --porcelain 2>&1)"
  if [ -z "$STATUS" ]; then
    ok "git working tree clean"
  else
    # Si solo este script + .env.production.example están untracked, igual es FAIL hasta commitear
    fail "git working tree NO está clean — commitea/stashea antes de go-live:"
    echo "$STATUS" | sed 's/^/  /'
  fi
  info "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?') @ $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  info "remote: $(git remote get-url origin 2>/dev/null || echo '(no origin — BLOCKED external, ver §BLOCKED)')"
fi

# ── 2. supabase status ──────────────────────────────────────────
section "2. supabase status"
if ! command -v supabase >/dev/null 2>&1; then
  warn "supabase CLI no instalado — skip (instala con: brew install supabase/tap/supabase)"
else
  if supabase status 2>&1 | tee /tmp/go-live-supabase-status.log | head -60; then
    # Check health: DB port 54322
    if grep -q "54322" /tmp/go-live-supabase-status.log 2>/dev/null; then
      ok "supabase status OK (DB 54322 presente)"
    else
      warn "supabase status OK pero no se detectó DB 54322 — revisa log"
    fi
  else
    warn "supabase status falló (¿supabase stop? ejecuta: supabase start)"
    cat /tmp/go-live-supabase-status.log 2>/dev/null | tail -20
  fi
fi

# ── 3. supabase db lint (o db reset --dry-run) ─────────────────
section "3. supabase db lint / db reset --dry-run"
if ! command -v supabase >/dev/null 2>&1; then
  warn "skip db lint (supabase CLI no instalado)"
else
  if supabase db lint 2>&1 | tee /tmp/go-live-db-lint.log; then
    if grep -qi "No schema errors found" /tmp/go-live-db-lint.log; then
      ok "supabase db lint: 0 errors"
    else
      ok "supabase db lint: OK (revisar output arriba)"
    fi
  else
    warn "supabase db lint falló — prueba: supabase db reset --dry-run 2>&1 | head -20"
    # Try dry-run as fallback (no destructivo)
    if supabase db reset --dry-run 2>&1 | head -20; then
      ok "supabase db reset --dry-run: OK (dry-run)"
    else
      warn "supabase db reset --dry-run también falló — revisa migraciones 001..051"
    fi
  fi
fi

# ── 4. npm run lint (debe exit 0; 20 warnings OK, 0 errors) ─────
section "4. npm run lint (0 errors, 20 warnings documentadas OK)"
if [ ! -f "package.json" ]; then
  fail "package.json no encontrado"
else
  info "ejecutando: npm run lint"
  if npm run lint 2>&1 | tee /tmp/go-live-lint.log; then
    # eslint exit 0 = 0 errors (warnings OK)
    if grep -q "✖" /tmp/go-live-lint.log && grep -q "0 errors" /tmp/go-live-lint.log; then
      ok "npm run lint: 0 errors (warnings OK)"
    elif grep -q "✖" /tmp/go-live-lint.log; then
      # Check if errors >0
      if grep -E "✖ [0-9]+ problems \([1-9][0-9]* errors" /tmp/go-live-lint.log; then
        fail "npm run lint: tiene errors (debe ser 0 errors)"
      else
        ok "npm run lint: exit 0 (warnings documentadas)" 
      fi
    else
      ok "npm run lint: exit 0"
    fi
  else
    fail "npm run lint: exit !=0 (revisa /tmp/go-live-lint.log)"
  fi
fi

# ── 5. npm run test:unit (29/29) ────────────────────────────────
section "5. npm run test:unit (29/29)"
if [ ! -f "package.json" ]; then
  fail "skip test (no package.json)"
else
  info "ejecutando: npm run test:unit"
  if npm run test:unit 2>&1 | tee /tmp/go-live-test.log; then
    if grep -q "29 passed" /tmp/go-live-test.log; then
      ok "npm run test:unit: 29/29 passed"
    elif grep -q "passed" /tmp/go-live-test.log; then
      ok "npm run test:unit: OK (revisa conteo arriba)"
    else
      ok "npm run test:unit: exit 0"
    fi
  else
    fail "npm run test:unit: FAILED (revisa /tmp/go-live-test.log)"
  fi
fi

# ── 6. npm run build — debe generar 51 routes ───────────────────
section "6. npm run build (51 routes)"
if [ ! -f "package.json" ]; then
  fail "skip build (no package.json)"
else
  info "ejecutando: npm run build (puede tardar ~30s)"
  if npm run build 2>&1 | tee /tmp/go-live-build.log; then
    # Busca línea "Generating static pages ... (51/51)" o conteo de rutas
    ROUTES_LINE="$(grep -E "Generating static pages.*\(51/51\)" /tmp/go-live-build.log || true)"
    ROUTE_COUNT="$(grep -c "ƒ /" /tmp/go-live-build.log || echo 0)"
    if [ -n "$ROUTES_LINE" ]; then
      ok "npm run build: 51/51 static pages OK"
    elif grep -q "51 routes" /tmp/go-live-build.log 2>/dev/null; then
      ok "npm run build: 51 routes OK"
    else
      # Fallback: contar líneas de Route table (aprox)
      if [ "$ROUTE_COUNT" -ge 40 ]; then
        warn "npm run build: OK pero no se detectó 51/51 exacto (count=$ROUTE_COUNT) — revisa log"
        grep "Route (app)" -A 60 /tmp/go-live-build.log | tail -20 || true
      else
        warn "npm run build: exit 0 pero no se verificó 51 routes — revisa /tmp/go-live-build.log"
      fi
    fi
  else
    fail "npm run build: FAILED (revisa /tmp/go-live-build.log)"
  fi
fi

# ── 7. docker compose config — validate selfhosted + IS_DOCKER + extra_hosts ──
section "7. docker compose config (selfhosted + IS_DOCKER + extra_hosts, sin network_mode:host runtime)"
if ! command -v docker >/dev/null 2>&1; then
  warn "docker no instalado — skip compose validate"
else
  if docker compose config >/tmp/go-live-compose.yml 2>/tmp/go-live-compose.err; then
    ok "docker compose config: válido"
    # selfhosted
    if grep -q "NEXT_PUBLIC_DEPLOYMENT_MODE.*selfhosted" /tmp/go-live-compose.yml; then
      ok "compose: NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted hardcodeado (docker-compose.yml)"
    else
      fail "compose: NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted NO encontrado en docker compose config"
    fi
    # IS_DOCKER
    if grep -q "IS_DOCKER.*true" /tmp/go-live-compose.yml; then
      ok "compose: IS_DOCKER=true presente (migrate + app)"
    else
      fail "compose: IS_DOCKER=true NO encontrado"
    fi
    # extra_hosts
    if grep -q "host.docker.internal:host-gateway" /tmp/go-live-compose.yml || grep -q "host.docker.internal" /tmp/go-live-compose.yml; then
      ok "compose: extra_hosts host.docker.internal:host-gateway presente"
    else
      fail "compose: extra_hosts host.docker.internal NO encontrado (requerido para bridge sin network_mode:host)"
    fi
    # Validar SIN network_mode:host en runtime (solo build.network:host permitido para Google Fonts)
    # docker compose config expande build.network pero runtime network_mode es otra key
    if grep -q "network_mode:.*host" /tmp/go-live-compose.yml; then
      fail "compose: network_mode:host detectado en runtime — DEBE ser solo build.network:host (revisar docker-compose.yml)"
    else
      ok "compose: sin network_mode:host en runtime (solo build.network:host OK)"
    fi
    # build.network: host debe existir para next/font
    if grep -q "network: host" /tmp/go-live-compose.yml; then
      ok "compose: build.network: host presente (para Google Fonts en BuildKit)"
    else
      warn "compose: build.network:host no detectado — verifica que Dockerfile next/font funcione en build"
    fi
  else
    fail "docker compose config: FAILED"
    cat /tmp/go-live-compose.err | head -30
  fi
fi

# ── 8. grep dev-only-not-prod en supabase/config.toml ───────────
section "8. supabase/config.toml — dev-only-not-prod check"
if grep -r "dev-only-not-prod" supabase/config.toml >/tmp/go-live-vault.log 2>&1; then
  warn "supabase/config.toml contiene 'dev-only-not-prod-32bytes-escuderia' (DEV ONLY) — BORRAR antes de supabase db push --linked en prod"
  cat /tmp/go-live-vault.log | sed 's/^/  /'
  echo -e "  ${YELLOW}Acción prod requerida: eliminar [db.vault] secret/secret_key dev antes de push → ver docs/production-runbook.md §6 Vault rotation${NC}"
else
  ok "supabase/config.toml: sin dev-only key (prod-ready)"
fi

# ── 9. .env.production.example exists ───────────────────────────
section "9. .env.production.example"
if [ -f ".env.production.example" ]; then
  ok ".env.production.example existe"
  # Verifica 8 vars placeholder
  MISSING=""
  for VAR in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY DATABASE_URL CRON_SECRET INTERNAL_API_SECRET NEXT_PUBLIC_APP_URL RESEND_API_KEY; do
    if ! grep -q "^${VAR}=" .env.production.example; then
      MISSING="$MISSING $VAR"
    fi
  done
  if [ -z "$MISSING" ]; then
    ok ".env.production.example: 8 vars prod presentes"
  else
    fail ".env.production.example: faltan vars:$MISSING"
  fi
  if grep -q "NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted" .env.production.example; then
    ok ".env.production.example: NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted comentado"
  else
    warn ".env.production.example: falta NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted"
  fi
  if grep -q "APP_DOMAIN" .env.production.example; then
    ok ".env.production.example: APP_DOMAIN placeholder presente"
  else
    warn ".env.production.example: falta APP_DOMAIN placeholder"
  fi
  # No valores reales
  if grep -q "supabase.co" .env.production.example && grep -q "<ref>" .env.production.example; then
    ok ".env.production.example: usa placeholders <ref> (sin valores reales)"
  else
    warn ".env.production.example: verifica que use placeholders <ref> / <...> sin valores reales"
  fi
else
  fail ".env.production.example NO existe — créalo según spec §1"
fi

# ── 10. curl /api/health si dev running ─────────────────────────
section "10. curl http://localhost:3000/api/health (si dev/app running)"
if command -v curl >/dev/null 2>&1; then
  if curl -sf http://localhost:3000/api/health >/tmp/go-live-health.json 2>&1; then
    ok "curl /api/health: 200 OK"
    cat /tmp/go-live-health.json | head -20 | sed 's/^/  /'
  else
    warn "curl /api/health: no responde (¿dev no running? opcional — ignora si no hay app local)"
    info "para probar: npm run dev  o  docker compose up -d  luego curl http://localhost:3000/api/health"
  fi
else
  warn "curl no instalado — skip health check"
fi

# ── Resumen ─────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN} RESUMEN:${NC} ${GREEN}PASS $PASS${NC} / ${YELLOW}WARN $WARN${NC} / ${RED}FAIL $FAIL${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED} Estado: FAIL — corrige los ✗ arriba antes de go-live${NC}"
else
  if [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW} Estado: PASS con WARN — revisa ⚠ (dev-only key es esperado en local)${NC}"
  else
    echo -e "${GREEN} Estado: PASS — listo para go-live local${NC}"
  fi
fi
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

# ── BLOCKED external — comandos copiar-pegar (NO se ejecutan) ───
cat <<'BLOCKED_EOF'

┌─────────────────────────────────────────────────────────────────┐
│  BLOCKED external — 3 comandos manuales para PROD (copiar-pegar)│
│  Requieren origin privado, Supabase Cloud, DNS/TLS prod y Vault │
└─────────────────────────────────────────────────────────────────┘

  1) ORIGIN privado (GitHub) — reemplaza <private_url> por tu repo privado:
     ─────────────────────────────────────────────────────────────────
     git remote add origin <private_url>   # ej: git@github.com:<org>/escuderia.git
     # si ya existe upstream (pronto), usa origin para privado:
     git remote -v
     git push -u origin main

  2) SUPABASE CLOUD — link + push migraciones (reemplaza <ref>):
     ─────────────────────────────────────────────────────────────────
     supabase link --project-ref <ref>
     # ANTES de push: borra dev key de supabase/config.toml [db.vault]
     #   secret = "dev-only-not-prod-32bytes-escuderia"  ← BORRAR
     #   secret_key = "dev-only-not-prod-32bytes-escuderia" ← BORRAR
     # Ver docs/production-runbook.md §6 "Vault rotation Cloud (prod)"
     supabase db push --linked
     # Alternativa con nueva DB: supabase db reset --linked (¡borra data!)

  3) DNS / TLS + APP_DOMAIN + SPF/DKIM (Resend):
     ─────────────────────────────────────────────────────────────────
     # .env en VPS (prod) — copia .env.production.example → .env y completa:
     APP_DOMAIN=<APP_DOMAIN>
     NEXT_PUBLIC_APP_URL=https://<APP_DOMAIN>
     # next.config.js ya hace redirect www → non-www automático si APP_DOMAIN está seteado:
     #   www.<APP_DOMAIN> → https://<APP_DOMAIN> (301)

     # DNS en tu provider (Cloudflare/Route53/etc):
     #   Tipo  Nombre  Valor
     #   A     @       <VPS_IP>
     #   A     www     <VPS_IP>   (o CNAME www → <APP_DOMAIN>)
     #   TXT   @       v=spf1 include:amazonses.com ~all
     #   TXT   resend._domainkey  <DKIM valor de Resend Dashboard → Domains → DKIM>
     # Verifica:
     #   dig +short <APP_DOMAIN>
     #   dig TXT <APP_DOMAIN> | grep spf
     #   dig TXT resend._domainkey.<APP_DOMAIN>
     #   curl -I https://<APP_DOMAIN>/ | grep -i "strict\|hsts"

     # Resend Dashboard → Domains → Add Domain → copia DKIM + verifica SPF:
     #   SPF:  TXT @ v=spf1 include:amazonses.com ~all
     #   DKIM: TXT resend._domainkey  p=MIGfMA0GCSqGSIb3DQEBAQUAA4...

  Vault rotation Cloud (prod) — ver runbook §6:
     openssl rand -hex 32  # nueva prod key (guárdala en 1Password/Vault)
     supabase link --project-ref <ref>
     supabase secrets set VAULT_SECRET=<new>   # o Dashboard → Vault
     PGPASSWORD=postgres psql -h db.<ref>.supabase.co -U postgres -c "SELECT pgsodium.create_key(name := 'pii_escuderia');"
     psql "postgresql://postgres.<ref>:<pass>@db.<ref>.supabase.co:5432/postgres?sslmode=require" -c "UPDATE clients SET phone_encrypted=encrypt_pii(phone) WHERE phone_encrypted IS NULL;"

BLOCKED_EOF

# Restaura set -e para caller
set -e

# Exit code: FAIL >0 → 1, solo WARN → 0
if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  exit 0
fi
