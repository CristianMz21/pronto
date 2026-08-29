create table if not exists public.waitlist (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  service_id uuid not null references services(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  desired_at timestamptz not null,
  status text not null default 'waiting' check (status in ('waiting','notified','converted','expired','cancelled')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, client_id, desired_at)
);
alter table waitlist enable row level security;
drop policy if exists tenant_access_waitlist on waitlist;
create policy tenant_access_waitlist on waitlist for all using (business_id in (select my_business_ids()));
create index if not exists idx_waitlist_desired on waitlist(business_id, location_id, desired_at) where status='waiting';
grant all on table waitlist to anon, authenticated;
