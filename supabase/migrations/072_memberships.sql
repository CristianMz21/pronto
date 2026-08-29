create table if not exists public.memberships (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null, price integer not null check (price>=0),
  duration_days integer not null check (duration_days>0),
  benefits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.client_memberships (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  remaining integer not null check (remaining>=0),
  status text not null default 'active' check (status in ('active','expired','cancelled')),
  created_at timestamptz not null default now()
);
alter table memberships enable row level security;
alter table client_memberships enable row level security;
drop policy if exists tenant_access_memberships on memberships;
create policy tenant_access_memberships on memberships for all using (business_id in (select my_business_ids()));
drop policy if exists tenant_access_client_memberships on client_memberships;
create policy tenant_access_client_memberships on client_memberships for all using (business_id in (select my_business_ids()));
create index if not exists idx_memberships_business on memberships(business_id) where is_active;
create index if not exists idx_client_memberships_client on client_memberships(client_id, status);
grant all on table memberships to anon, authenticated;
grant all on table client_memberships to anon, authenticated;
