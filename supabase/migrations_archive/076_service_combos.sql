-- Migration 076: service_combos — combos de servicios con precio y duración agregada
-- Idempotente IF NOT EXISTS, grants, RLS tenant_access, advisory lock ready
-- Data-model 067_service_combos.sql mapped to 076 (existing 061-065 already cover memberships/promotions/loyalty)

create table if not exists public.service_combos (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  service_ids uuid[] not null,
  price integer not null check (price >= 0),
  duration_min integer not null check (duration_min > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_combos_business on public.service_combos(business_id) where is_active;
create index if not exists idx_service_combos_location on public.service_combos(location_id) where location_id is not null;

grant all on table public.service_combos to anon, authenticated;

alter table public.service_combos enable row level security;
drop policy if exists tenant_access_service_combos on public.service_combos;
create policy tenant_access_service_combos on public.service_combos
  for all using (business_id in (select public.my_business_ids()));

-- Ensure benefits jsonb in memberships already correct (from 072), no-op here
-- Advisory lock helper comment: lib/memberships.ts uses pg_advisory_xact_lock on client_memberships.id via function 079
