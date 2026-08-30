#!/usr/bin/env bash
# supabase/seed-realistic.sh — aplica supabase/seed-realistic.sql idempotente
# Uso: ./supabase/seed-realistic.sh [--local|--remote]
#   --local  (default) usa supabase local en 54322
#   --remote usa $DATABASE_URL o SUPABASE_DB_URL
set -euo pipefail
DB_URL=""
MODE="${1:-local}"
if [[ "$MODE" == "--remote" ]]; then
  DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
  if [[ -z "$DB_URL" ]]; then echo "ERROR: DATABASE_URL no definido para --remote" >&2; exit 1; fi
else
  # local supabase
  DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
  # verificar que supabase local esté corriendo
  if ! pg_isready -h 127.0.0.1 -p 54322 -q 2>/dev/null; then
    echo "WARN: supabase local no responde en 54322, intenta con DATABASE_URL=$DB_URL" >&2
  fi
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="$SCRIPT_DIR/seed-realistic.sql"
if [[ ! -f "$SQL_FILE" ]]; then echo "ERROR: no existe $SQL_FILE" >&2; exit 1; fi
echo "→ Aplicando $SQL_FILE a $DB_URL (mode=$MODE)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "✓ seed-realistic aplicado"
echo "→ Verificación:"
psql "$DB_URL" -c "
select 'locations' as tabla, count(*) from public.locations where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
union all select 'employees', count(*) from public.employees where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
union all select 'services', count(*) from public.services where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
union all select 'clients', count(*) from public.clients where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
union all select 'appointments', count(*) from public.appointments where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
union all select 'transactions', count(*) from public.transactions where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
union all select 'inventory_items', count(*) from public.inventory_items where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
union all select 'holidays', count(*) from public.holidays where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
order by tabla;
"
