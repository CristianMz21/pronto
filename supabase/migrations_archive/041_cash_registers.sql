-- Migration 041: cash_registers + cash_movements — caja barbería
-- Apertura, ingresos/egresos, ventas, cierre con efectivo esperado vs real

create table if not exists public.cash_registers (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  opened_by     uuid not null references auth.users(id),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  opening_cash  numeric(10,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(10,2),
  actual_cash   numeric(10,2) check (actual_cash is null or actual_cash >= 0),
  difference    numeric(10,2) generated always as (actual_cash - expected_cash) stored,
  status        text not null default 'open' check (status in ('open','closed')),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cash_registers_business_status on public.cash_registers(business_id, status);
create index if not exists idx_cash_registers_opened_at on public.cash_registers(business_id, opened_at desc);

grant all on table public.cash_registers to anon, authenticated;
alter table public.cash_registers enable row level security;
drop policy if exists "tenant_access_cash_registers" on public.cash_registers;
create policy "tenant_access_cash_registers" on public.cash_registers
  for all using (business_id in (select public.my_business_ids()));

-- Movimientos manuales (ingreso/egreso fuera de ventas)
create table if not exists public.cash_movements (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  register_id uuid not null references public.cash_registers(id) on delete cascade,
  type        text not null check (type in ('in','out')),
  amount      numeric(10,2) not null check (amount > 0),
  reason      text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_cash_movements_register on public.cash_movements(register_id);
create index if not exists idx_cash_movements_business on public.cash_movements(business_id);

grant all on table public.cash_movements to anon, authenticated;
alter table public.cash_movements enable row level security;
drop policy if exists "tenant_access_cash_movements" on public.cash_movements;
create policy "tenant_access_cash_movements" on public.cash_movements
  for all using (business_id in (select public.my_business_ids()));

-- Solo una caja abierta por negocio
create unique index if not exists unique_open_register_per_business
  on public.cash_registers(business_id) where status = 'open';
