create table if not exists public.loyalty_accounts (
  client_id uuid primary key references clients(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  points integer not null default 0 check (points>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_movements (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  type text not null check (type in ('earn','redeem','adjust')),
  points integer not null check (points<>0),
  reference text,
  created_at timestamptz not null default now()
);
alter table loyalty_accounts enable row level security;
alter table loyalty_movements enable row level security;
drop policy if exists tenant_access_loyalty_accounts on loyalty_accounts;
create policy tenant_access_loyalty_accounts on loyalty_accounts for all using (business_id in (select my_business_ids()));
drop policy if exists tenant_access_loyalty_movements on loyalty_movements;
create policy tenant_access_loyalty_movements on loyalty_movements for all using (business_id in (select my_business_ids()));
create index if not exists idx_loyalty_movements_client on loyalty_movements(client_id, created_at desc);
grant all on table loyalty_accounts to anon, authenticated;
grant all on table loyalty_movements to anon, authenticated;
