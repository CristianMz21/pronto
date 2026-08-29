-- Migration 083: US7 Waitlist / Recurring / Holidays / Tips — idempotent completeness (T065)
-- All tables already exist via 058_holidays, 063_waitlist, 064_recurring_appointments, 071_tips
-- This migration guarantees idempotency, indexes, RLS and grants without breaking existing data.
-- Stacked-to-main: no destructive changes, only IF NOT EXISTS / DO $$ guards.

-- ── holidays (058) completeness ─────────────────────────────────────────────
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

-- Ensure columns exist if table was created earlier with slightly different def
alter table public.holidays add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.holidays add column if not exists reason text;
alter table public.holidays add column if not exists is_open boolean not null default false;
alter table public.holidays add column if not exists created_at timestamptz not null default now();

create index if not exists idx_holidays_business_date on public.holidays(business_id, date);
create index if not exists idx_holidays_location on public.holidays(location_id) where location_id is not null;
-- Extra: per-business+location+date unique already as constraint, add covering index for picker disabled dates
create index if not exists idx_holidays_business_location_date on public.holidays(business_id, location_id, date);

grant all on table public.holidays to anon, authenticated;
alter table public.holidays enable row level security;
drop policy if exists "tenant_access_holidays" on public.holidays;
create policy "tenant_access_holidays" on public.holidays
  for all using (business_id in (select public.my_business_ids()));

-- ── waitlist (063) completeness ─────────────────────────────────────────────
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

alter table public.waitlist add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.waitlist add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.waitlist add column if not exists status text not null default 'waiting' check (status in ('waiting','notified','converted','expired','cancelled'));
alter table public.waitlist add column if not exists notified_at timestamptz;
alter table public.waitlist add column if not exists created_at timestamptz not null default now();

-- Idempotent check constraint (pg doesn't support IF NOT EXISTS for constraints, so guard via DO)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_status_check' and conrelid = 'public.waitlist'::regclass) then
    -- the check is already inline above; this guard is for legacy tables without the check name
    begin
      alter table public.waitlist add constraint waitlist_status_check check (status in ('waiting','notified','converted','expired','cancelled'));
    exception when duplicate_object then null;
    end;
  end if;
end $$;

alter table public.waitlist enable row level security;
drop policy if exists tenant_access_waitlist on public.waitlist;
create policy tenant_access_waitlist on public.waitlist for all using (business_id in (select public.my_business_ids()));
create index if not exists idx_waitlist_desired on public.waitlist(business_id, location_id, desired_at) where status='waiting';
create index if not exists idx_waitlist_status on public.waitlist(business_id, status);
create index if not exists idx_waitlist_client on public.waitlist(client_id);
create index if not exists idx_waitlist_notified_at on public.waitlist(business_id, notified_at) where status='notified';
grant all on table public.waitlist to anon, authenticated;

-- ── recurring_appointments (064) completeness ───────────────────────────────
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

alter table public.recurring_appointments add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.recurring_appointments add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.recurring_appointments add column if not exists rrule text;
alter table public.recurring_appointments add column if not exists next_at timestamptz;
alter table public.recurring_appointments add column if not exists until timestamptz;
alter table public.recurring_appointments add column if not exists is_active boolean not null default true;
alter table public.recurring_appointments add column if not exists created_at timestamptz not null default now();

alter table public.appointments add column if not exists recurring_id uuid references public.recurring_appointments(id) on delete set null;
create index if not exists idx_recurring_business on public.recurring_appointments(business_id, next_at) where is_active;
create index if not exists idx_appointments_recurring on public.appointments(recurring_id) where recurring_id is not null;

alter table public.recurring_appointments enable row level security;
drop policy if exists tenant_access_recurring on public.recurring_appointments;
create policy tenant_access_recurring on public.recurring_appointments for all using (business_id in (select public.my_business_ids()));
grant all on table public.recurring_appointments to anon, authenticated;

-- ── tips (071) completeness ─────────────────────────────────────────────────
alter table public.transactions add column if not exists tip_amount integer not null default 0 check (tip_amount >=0);

create table if not exists public.tips (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  amount integer not null check (amount>0),
  method text not null default 'cash' check (method in ('cash','card','transfer','digital')),
  created_at timestamptz not null default now()
);

alter table public.tips add column if not exists business_id uuid references public.businesses(id) on delete cascade;
alter table public.tips add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;
alter table public.tips add column if not exists employee_id uuid references public.employees(id) on delete cascade;
alter table public.tips add column if not exists amount integer;
alter table public.tips add column if not exists method text;
alter table public.tips add column if not exists created_at timestamptz not null default now();

create index if not exists idx_tips_transaction on public.tips(transaction_id);
create index if not exists idx_tips_employee on public.tips(employee_id);
create index if not exists idx_tips_business on public.tips(business_id, created_at desc);

alter table public.tips enable row level security;
drop policy if exists tenant_access_tips on public.tips;
create policy tenant_access_tips on public.tips for all using (business_id in (select public.my_business_ids()));
grant all on table public.tips to anon, authenticated;

-- ── ensure 080 commission tip discount guard already applied (idempotent check) ──
-- transactions.tip_amount check already above; ensure comment exists for Advisors
comment on column public.transactions.tip_amount is 'Propina, no comisionable (US7 T062)';
