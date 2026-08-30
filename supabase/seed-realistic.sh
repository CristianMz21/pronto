#!/usr/bin/env bash
# DEPRECATED — supabase/seed-realistic.sh now delegates to ORM ultra seed
# Original SQL seed is deprecated (see drizzle/seed-ultra.ts). This wrapper keeps backwards compat.
# Uso: ./supabase/seed-realistic.sh [--local|--remote]  →  runs `npx tsx drizzle/seed-ultra.ts`
set -euo pipefail
MODE="${1:-local}"
echo "⚠ DEPRECATED: supabase/seed-realistic.sh — SQL seeds removed, using ORM ultra seed (drizzle/seed-ultra.ts)"
echo "→ Ejecutando: npx tsx drizzle/seed-ultra.ts (mode=$MODE)"
# Ensure DATABASE_URL is set for ORM
if [[ "$MODE" == "--remote" ]]; then
  : "${DATABASE_URL:?DATABASE_URL required for --remote}"
else
  export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
fi
npx tsx drizzle/seed-ultra.ts
echo "✓ seed-ultra ORM aplicado"
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
