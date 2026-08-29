create table if not exists public.recurring_appointments (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  rrule text not null,
  next_at timestamptz not null,
  until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table recurring_appointments enable row level security;
drop policy if exists tenant_access_recurring on recurring_appointments;
create policy tenant_access_recurring on recurring_appointments for all using (business_id in (select my_business_ids()));
alter table appointments add column if not exists recurring_id uuid references recurring_appointments(id) on delete set null;
create index if not exists idx_recurring_business on recurring_appointments(business_id, next_at) where is_active;
grant all on table recurring_appointments to anon, authenticated;
