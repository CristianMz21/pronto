-- Migration 077: transactions discount audit + loyalty config
-- Adds discount_amount, discount_reason, promo_code, membership_id for POS/booking loyalty flow
-- Idempotent, grants preserved via RLS existing on transactions, adds check constraints

alter table public.transactions add column if not exists discount_amount integer not null default 0 check (discount_amount >= 0);
alter table public.transactions add column if not exists discount_reason text;
alter table public.transactions add column if not exists promo_code text;
alter table public.transactions add column if not exists membership_id uuid references public.client_memberships(id) on delete set null;
alter table public.transactions add column if not exists loyalty_points_earned integer not null default 0 check (loyalty_points_earned >= 0);
alter table public.transactions add column if not exists loyalty_points_redeemed integer not null default 0 check (loyalty_points_redeemed >= 0);

create index if not exists idx_transactions_promo_code on public.transactions(business_id, promo_code) where promo_code is not null;
create index if not exists idx_transactions_membership on public.transactions(membership_id) where membership_id is not null;

-- Ensure commissions exclude tip+discount: no schema change, logic in lib/commission.ts + trigger 043/046 handles
-- commission_trigger already uses amount - tip, now POS should pass amount net of discount; audit via discount_amount

-- Loyalty config on businesses (earn/redeem rates parametrized, defaults match spec: 1pt/$1k, 100pts=$10k)
alter table public.businesses add column if not exists loyalty_earn_rate integer not null default 1000 check (loyalty_earn_rate > 0);
alter table public.businesses add column if not exists loyalty_redeem_rate integer not null default 100 check (loyalty_redeem_rate > 0);
alter table public.businesses add column if not exists loyalty_redeem_value integer not null default 10000 check (loyalty_redeem_value > 0);

comment on column public.businesses.loyalty_earn_rate is 'COP per point earned, default 1000 => 1pt/$1k';
comment on column public.businesses.loyalty_redeem_rate is 'points per redeem unit, default 100';
comment on column public.businesses.loyalty_redeem_value is 'COP value per redeem_rate points, default 10000 => 100pts=$10k';
