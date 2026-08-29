-- Migration 058: holidays — bloqueos por festivos / mantenimiento por sede
-- Tabla idempotente, nullable location_id para no romper single-sede (044)

create table if not exists public.holidays (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  date        date not null,
  reason      text,
  is_open     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (business_id, location_id, date)
);

create index if not exists idx_holidays_business_date on public.holidays(business_id, date);
create index if not exists idx_holidays_location on public.holidays(location_id) where location_id is not null;

grant all on table public.holidays to anon, authenticated;
alter table public.holidays enable row level security;
drop policy if exists "tenant_access_holidays" on public.holidays;
create policy "tenant_access_holidays" on public.holidays
  for all using (business_id in (select public.my_business_ids()));
