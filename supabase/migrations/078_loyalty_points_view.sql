-- Migration 078: loyalty_points view + loyalty_transactions alias
-- Provides aggregated balance view for audit; respects tenant via security_invoker
-- Idempotent via CREATE OR REPLACE

create or replace view public.loyalty_points
with (security_invoker = true) as
  select
    lm.client_id,
    lm.business_id,
    coalesce(sum(lm.points), 0)::integer as total_points,
    max(lm.created_at) as last_movement_at
  from public.loyalty_movements lm
  group by lm.client_id, lm.business_id;

-- Also expose loyalty_movements alias for spec naming (065_loyalty.sql mentions loyalty_transactions)
-- Create view loyalty_transactions as alias to loyalty_movements for contract compatibility
create or replace view public.loyalty_transactions
with (security_invoker = true) as
  select
    id,
    business_id,
    client_id,
    type,
    points,
    reference,
    created_at
  from public.loyalty_movements;

grant select on public.loyalty_points to anon, authenticated;
grant select on public.loyalty_transactions to anon, authenticated;

-- Refresh grants for underlying tables (already granted in 062, re-ensure)
grant all on table public.loyalty_accounts to anon, authenticated;
grant all on table public.loyalty_movements to anon, authenticated;
