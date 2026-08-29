create table if not exists public.promotions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null,
  type text not null check (type in ('percent','fixed','combo')),
  value numeric(10,2) not null check (value>=0),
  promo_code text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, promo_code)
);
alter table promotions enable row level security;
drop policy if exists tenant_access_promotions on promotions;
create policy tenant_access_promotions on promotions for all using (business_id in (select my_business_ids()));
create index if not exists idx_promotions_business_active on promotions(business_id) where is_active;
grant all on table promotions to anon, authenticated;
