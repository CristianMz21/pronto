# Data Model: Barbería SaaS Integral — Escudería (006)

**Branch**: `006-barberia-saas-integral` | **Date**: 2026-08-28 | **Spec**: `spec.md` | **Plan**: `plan.md`

## ERD (textual)

```
businesses 1──N locations 1──N employees (location_id nullable)
                 │           1──N employee_services ──N services (location_id nullable)
                 │           1──N employee_unavailability
                 │           1──N business_hours (+ holidays)
                 │
                 ├──N services (location_id)
                 ├──N service_combos
                 ├──N clients (preferred_barber_id, location_id)
                 │     ├──N loyalty_accounts / loyalty_movements
                 │     └──N client_memberships ──1 memberships
                 │
                 ├──N appointments (client, employee?, service, location, recurring_id, status FSM)
                 │     ├──N recurring_appointments 1──N appointments
                 │     └──N waitlist (client, service, employee?, location, desired_at)
                 │
                 ├──N transactions (appointment?, client, employee?, location, items jsonb, discount, tax, tip)
                 │     ├──N commissions (employee, transaction)
                 │     └──N tips (employee, transaction) [o tip_amount en transactions]
                 │
                 ├──N inventory_items (location_id, sku unique per business, barcode)
                 │     └──N inventory_movements (in/out/adjustment/transfer + from/to_location)
                 │
                 ├──N cash_registers (location_id, opened_by, closed_by)
                 ├──N promotions (location_id?, rules jsonb)
                 ├──N campaigns (segment, channel, stats) 1──N campaign_recipients
                 └──N notification_log (appointment?, campaign?, channel)
```

## Migraciones (059..069) — orden idempotente

### 059_locations_rls_hardening.sql

- `holidays` no existe → se crea en 068; aquí solo `REVOKE` + `my_business_ids()` polish para `locations`.
- `DROP POLICY IF EXISTS tenant_access_locations; CREATE POLICY ... business_id IN my_business_ids()`.

### 060_waitlist.sql

```sql
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
  unique (business_id, client_id, desired_at) -- evita duplicado mismo deseo
);
alter table waitlist enable row level security;
create policy tenant_access_waitlist on waitlist for all using (business_id in (select my_business_ids()));
create index if not exists idx_waitlist_desired on waitlist(business_id, location_id, desired_at) where status='waiting';
grant all on table waitlist to anon, authenticated;
```

### 061_recurring_appointments.sql

```sql
create table if not exists public.recurring_appointments (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  rrule text not null, -- RFC 5545
  next_at timestamptz not null,
  until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table recurring_appointments enable row level security;
create policy tenant_access_recurring on recurring_appointments for all using (business_id in (select my_business_ids()));
alter table appointments add column if not exists recurring_id uuid references recurring_appointments(id) on delete set null;
create index if not exists idx_recurring_business on recurring_appointments(business_id, next_at) where is_active;
```

### 062_tips.sql

```sql
alter table transactions add column if not exists tip_amount integer not null default 0 check (tip_amount >=0);
-- Opcional tabla normalizada si se quiere reportar independiente:
create table if not exists public.tips (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  amount integer not null check (amount>0),
  method text not null default 'cash' check (method in ('cash','card','transfer','digital')),
  created_at timestamptz not null default now()
);
alter table tips enable row level security;
create policy tenant_access_tips on tips for all using (business_id in (select my_business_ids()));
```

### 063_memberships.sql

```sql
create table if not exists public.memberships (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null, price integer not null check (price>=0),
  duration_days integer not null check (duration_days>0),
  benefits jsonb not null default '{}'::jsonb, -- {cuts:4, services:[...]}
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
-- RLS + índices + trigger advisory lock para consume
```

### 064_promotions.sql

```sql
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
  rules jsonb not null default '{}'::jsonb, -- {day_of_week:[2], service_ids:[...], client_segment:'birthday'}
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, promo_code)
);
```

### 065_loyalty.sql

```sql
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
  reference text, -- transaction_id o campaign_id
  created_at timestamptz not null default now()
);
```

### 066_campaigns.sql

```sql
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null,
  segment text not null check (segment in ('inactive_30','inactive_42','inactive_60','birthday_7','vip','new','all')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email','telegram')),
  template text not null,
  status text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  stats jsonb not null default '{"sent":0,"delivered":0,"rebooked":0}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.campaign_recipients (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','delivered','rebooked','failed')),
  primary key (campaign_id, client_id)
);
```

### 067_service_combos.sql

```sql
create table if not exists public.service_combos (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null, service_ids uuid[] not null,
  price integer not null, duration_min integer not null,
  is_active boolean not null default true
);
```

### 068_holidays.sql

```sql
create table if not exists public.holidays (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  date date not null,
  reason text,
  is_open boolean not null default false,
  unique (business_id, location_id, date)
);
```

### 069_inventory_location_transfer.sql

- `alter table inventory_movements add column if not exists from_location_id uuid, to_location_id uuid;`
- Trigger `check_transfer` para `type='transfer'` atómico `out/in`.

## Constraints & Triggers a extender

- `check_slot_availability()` (032): añadir `holidays` check + `location_id` lock si `employee_id` + `location_id`.
- `enforce_fsm` (039/047): añadir `waitlist.status`, `client_memberships.status`.
- `client_stats` (008): recalcular `total_visits` incluyendo `membership` usages si aplica (opcional).
- `commission_trigger` (043/046): incluir `tip_amount` no comisionable; comisión solo sobre `amount - tip - tax`.

## RLS Summary

Toda tabla nueva `FOR ALL USING (business_id IN (SELECT my_business_ids()))`. `my_location_ids()` futuro no bloquea V1. `REVOKE` anon de `campaigns.stats` sensible? No, stats es agregado; no PII. `holidays` y `service_combos` públicos por `business_id` ok.

## Validation (Zod) — server

- `waitlist`: `desired_at > now() + business_lead_time`
- `recurring.rrule`: parse `RRule.fromString`, `until > next_at`, `count <= 52`
- `tips.tip_amount`: `>=0 && <= amount*0.5` salvo `role=manager` override
- `memberships.remaining`: `>0 && expires_at>now()` antes de `apply`
- `promotions`: `valid_from < valid_to`, `value <= 100` si `percent`

