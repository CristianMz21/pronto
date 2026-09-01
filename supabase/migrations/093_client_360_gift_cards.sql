-- Migration 093: Customer 360 — gift_cards (stub V1 schema only, no purchase flow)
-- Spec: FR-C20, data-model.md gift_cards (093), plan.md 093_client_360_gift_cards.sql
-- Schema only V1: id, business_id, code unique, amount, balance, purchaser_client_id, recipient_name, expires_at
-- Idempotent: IF NOT EXISTS + DO $$ + tenant_access_gift_cards

create table if not exists public.gift_cards (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  code                  text not null unique,
  amount                integer not null check (amount > 0),
  balance               integer not null check (balance >= 0),
  purchaser_client_id   uuid references public.clients(id) on delete set null,
  recipient_name        text,
  recipient_email       text,
  expires_at            timestamptz,
  created_at            timestamptz not null default now()
);

-- Ensure columns if table existed partially (completeness)
alter table public.gift_cards add column if not exists business_id uuid;
alter table public.gift_cards add column if not exists code text;
alter table public.gift_cards add column if not exists amount integer;
alter table public.gift_cards add column if not exists balance integer;
alter table public.gift_cards add column if not exists purchaser_client_id uuid references public.clients(id) on delete set null;
alter table public.gift_cards add column if not exists recipient_name text;
alter table public.gift_cards add column if not exists recipient_email text;
alter table public.gift_cards add column if not exists expires_at timestamptz;
alter table public.gift_cards add column if not exists created_at timestamptz not null default now();

-- Idempotent check constraints (guard if created via IF NOT EXISTS without explicit name)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gift_cards_amount_check' and conrelid = 'public.gift_cards'::regclass) then
    begin
      alter table public.gift_cards add constraint gift_cards_amount_check check (amount > 0);
    exception when duplicate_object then null;
    end;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gift_cards_balance_check' and conrelid = 'public.gift_cards'::regclass) then
    begin
      alter table public.gift_cards add constraint gift_cards_balance_check check (balance >= 0);
    exception when duplicate_object then null;
    end;
  end if;
  -- Additional invariant: balance <= amount (soft, not strict but helpful for V1)
  if not exists (select 1 from pg_constraint where conname = 'gift_cards_balance_amount_check' and conrelid = 'public.gift_cards'::regclass) then
    begin
      alter table public.gift_cards add constraint gift_cards_balance_amount_check check (balance <= amount);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Unique constraint guard for code (already UNIQUE inline, but ensure named)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gift_cards_code_key' and conrelid = 'public.gift_cards'::regclass) then
    begin
      alter table public.gift_cards add constraint gift_cards_code_key unique (code);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

create unique index if not exists unique_gift_cards_code on public.gift_cards(code);
create index if not exists idx_gift_cards_business on public.gift_cards(business_id);
create index if not exists idx_gift_cards_purchaser on public.gift_cards(purchaser_client_id) where purchaser_client_id is not null;
create index if not exists idx_gift_cards_expires on public.gift_cards(expires_at) where expires_at is not null;
create index if not exists idx_gift_cards_balance on public.gift_cards(business_id, balance);

-- Grants
grant all on table public.gift_cards to anon, authenticated;

-- RLS
alter table public.gift_cards enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gift_cards' and policyname='tenant_access_gift_cards') then
    create policy "tenant_access_gift_cards" on public.gift_cards
      for all using (business_id in (select public.my_business_ids()))
      with check (business_id in (select public.my_business_ids()));
  end if;
end $$;

-- Optional: client self-read via purchaser link (read own purchased cards)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gift_cards' and policyname='client_self_gift_cards') then
    create policy "client_self_gift_cards" on public.gift_cards
      for select using (
        purchaser_client_id in (select id from public.clients where user_id = auth.uid())
        or business_id in (select public.my_business_ids())
      );
  end if;
exception when duplicate_object then null;
end $$;

comment on table public.gift_cards is 'Customer 360: gift cards stub V1 — code unique, amount/balance COP integer, redeem partial later';
comment on column public.gift_cards.code is 'Unique redemption code, e.g. nanoid 12 or custom, es-CO safe charset';
comment on column public.gift_cards.amount is 'Initial amount COP integer >0';
comment on column public.gift_cards.balance is 'Remaining balance COP integer >=0 <=amount';
