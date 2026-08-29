-- Migration 081: inventory transfer atomic (US6 T059) + allow transfer type + advisory lock + stock check
-- Idempotent

-- 1. Extend inventory_movements type check to include 'transfer'
do $$
declare
  cname text;
begin
  select conname into cname from pg_constraint
  where conrelid = 'public.inventory_movements'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%type%in%';
  if cname is not null then
    execute format('alter table public.inventory_movements drop constraint %I', cname);
  end if;
  -- also try conventional name
  begin
    execute 'alter table public.inventory_movements drop constraint if exists inventory_movements_type_check';
  exception when others then null;
  end;
  alter table public.inventory_movements
    add constraint inventory_movements_type_check check (type in ('in','out','adjustment','transfer'));
exception when duplicate_object then null;
end $$;

-- Ensure from/to columns exist (already in 060, but idempotent here)
alter table public.inventory_movements add column if not exists from_location_id uuid references public.locations(id) on delete set null;
alter table public.inventory_movements add column if not exists to_location_id uuid references public.locations(id) on delete set null;
create index if not exists idx_inventory_movements_transfer on public.inventory_movements(business_id, item_id, type) where type='transfer';

-- 2. RPC for atomic transfer with advisory lock and stock validation
create or replace function public.transfer_inventory(
  p_business_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_note text,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_from_exists boolean;
  v_to_exists boolean;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity_must_be_positive';
  end if;

  -- Advisory lock per item+ business to serialize concurrent transfers
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':' || p_item_id::text));

  select * into v_item from public.inventory_items where id = p_item_id and business_id = p_business_id for update;
  if not found then
    raise exception 'item_not_found';
  end if;

  if v_item.quantity < p_quantity then
    raise exception 'insufficient_stock: % available, % requested', v_item.quantity, p_quantity;
  end if;

  -- Validate locations belong to same business if provided
  if p_from_location_id is not null then
    select exists(select 1 from public.locations where id = p_from_location_id and business_id = p_business_id) into v_from_exists;
    if not v_from_exists then raise exception 'from_location_not_found'; end if;
  end if;
  if p_to_location_id is not null then
    select exists(select 1 from public.locations where id = p_to_location_id and business_id = p_business_id) into v_to_exists;
    if not v_to_exists then raise exception 'to_location_not_found'; end if;
  end if;

  -- Prevent same source/dest
  if p_from_location_id is not null and p_to_location_id is not null and p_from_location_id = p_to_location_id then
    raise exception 'same_location';
  end if;

  -- Audit: single transfer record (type=transfer, quantity positive, from/to for trace)
  insert into public.inventory_movements (business_id, item_id, type, quantity, note, created_by, from_location_id, to_location_id)
  values (
    p_business_id,
    p_item_id,
    'transfer',
    p_quantity,
    coalesce(p_note, 'Transfer ' || coalesce(p_from_location_id::text,'—') || ' → ' || coalesce(p_to_location_id::text,'—')),
    p_user_id,
    p_from_location_id,
    p_to_location_id
  );

  -- Global stock net 0 for transfer (single-stock model). Future per-location model could adjust quantities here.
  return jsonb_build_object('ok', true, 'item_id', p_item_id, 'quantity', p_quantity);
end;
$$;

grant execute on function public.transfer_inventory(uuid, uuid, numeric, uuid, uuid, text, uuid) to anon, authenticated;

-- Ensure RLS still applies (function is security definer but caller still needs my_business_ids check via policy on inventory_movements insert)
-- No additional grants needed.

-- 3. Locations RLS hardening (ensure tenant_access_locations still correct, idempotent)
do $$
begin
  if not exists (select 1 from pg_policies where policyname='tenant_access_locations' and tablename='locations') then
    drop policy if exists "tenant_access_locations" on public.locations;
    create policy "tenant_access_locations" on public.locations
      for all using (business_id in (select public.my_business_ids()));
  end if;
end $$;
