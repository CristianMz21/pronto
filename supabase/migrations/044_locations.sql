-- Migration 044: locations — preparación multi-sede (single ahora, N sedes futuro)
-- 1 business (Escudería) → 1 location default (Centro). Futuro: Norte, Sur, etc.

create table if not exists public.locations (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  slug        text not null,
  address     text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists idx_locations_business on public.locations(business_id);
create index if not exists idx_locations_slug on public.locations(business_id, slug);

grant all on table public.locations to anon, authenticated;
alter table public.locations enable row level security;
drop policy if exists "tenant_access_locations" on public.locations;
create policy "tenant_access_locations" on public.locations
  for all using (business_id in (select public.my_business_ids()));

-- Seed default location for Escudería (single sede) — idempotente
insert into public.locations (id, business_id, name, slug, address, phone)
select '11111111-1111-1111-1111-111111111111'::uuid, id, 'Escudería Centro', 'centro', address, phone
from public.businesses where slug='escuderia'
on conflict (business_id, slug) do nothing;

-- Preparación: columnas location_id nullable futuras (no obligatorias en este slice)
-- Se agregan como nullable para no romper single-sede; si ya existen no hace nada
alter table public.employees add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.services add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.appointments add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.inventory_items add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists idx_employees_location on public.employees(location_id);
create index if not exists idx_appointments_location on public.appointments(location_id);
