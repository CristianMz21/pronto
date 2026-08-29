-- Migration 082: remaining location_id propagation for multi-sede (US6 T060)
-- Ensures transactions, cash_registers per-location uniqueness, and indexes

-- 1. transactions.location_id (nullable, single-sede default)
alter table public.transactions add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists idx_transactions_location on public.transactions(business_id, location_id);
create index if not exists idx_transactions_location_created on public.transactions(business_id, location_id, created_at desc) where status='completed';

-- 2. cash_registers: ensure location_id exists (already in 060 but idempotent)
alter table public.cash_registers add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists idx_cash_registers_location on public.cash_registers(business_id, location_id) where status='open';

-- 3. Adjust unique open register constraint to be per (business_id, location_id) instead of just business_id
-- Drop old index if exists, recreate per location (allows one open per sede)
do $$
begin
  if exists (select 1 from pg_indexes where indexname='unique_open_register_per_business') then
    drop index if exists public.unique_open_register_per_business;
  end if;
  if not exists (select 1 from pg_indexes where indexname='unique_open_register_per_business_location') then
    create unique index unique_open_register_per_business_location
      on public.cash_registers(business_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
      where status='open';
  end if;
exception when others then null;
end $$;

-- 4. clients.location_id already via drizzle? Ensure exists for filtering
alter table public.clients add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists idx_clients_location on public.clients(business_id, location_id);

-- 5. Ensure appointments.location_id index already exists (044), but add composite for dashboard
create index if not exists idx_appointments_business_location_starts on public.appointments(business_id, location_id, starts_at);

-- 6. Ensure inventory_items location already, add business+location composite
create index if not exists idx_inventory_items_business_location on public.inventory_items(business_id, location_id);

-- 7. RLS polish: tenant_access_* already via business_id, no need for location filter in V1 (my_business_ids)
-- Future my_location_ids() V2 will add location filter; for now keep tenant only.

-- No data migration needed; existing rows keep location_id null (single-sede)
