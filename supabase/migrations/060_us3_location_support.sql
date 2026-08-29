-- Migration 060: location support for inventory and caja (US3 T037-T038)
-- Adds nullable location_id to inventory_items and cash_registers, idempotent

alter table public.inventory_items add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.cash_registers add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists idx_inventory_items_location on public.inventory_items(business_id, location_id);
create index if not exists idx_cash_registers_location on public.cash_registers(business_id, location_id);

-- Extend inventory_movements for transfer (069 partial)
alter table public.inventory_movements add column if not exists from_location_id uuid references public.locations(id) on delete set null;
alter table public.inventory_movements add column if not exists to_location_id uuid references public.locations(id) on delete set null;

-- RLS polish: ensure new columns don't break existing policies (they filter by business_id already)
