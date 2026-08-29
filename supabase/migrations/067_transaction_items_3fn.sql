-- 3FN: Normalize transactions.items jsonb → transaction_items
create table if not exists public.transaction_items (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  name_snapshot text not null,
  price_snapshot numeric(10,2) not null,
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now()
);
-- Migrate existing jsonb items
insert into public.transaction_items (transaction_id, service_id, name_snapshot, price_snapshot, qty)
select
  t.id,
  (elem->>'service_id')::uuid,
  elem->>'name',
  (elem->>'price')::numeric,
  (elem->>'qty')::int
from public.transactions t, jsonb_array_elements(t.items) as elem
where t.items is not null and jsonb_array_length(t.items) > 0
on conflict do nothing;

alter table transaction_items enable row level security;
drop policy if exists tenant_access_transaction_items on transaction_items;
create policy tenant_access_transaction_items on transaction_items for all using (
  exists (select 1 from transactions where transactions.id = transaction_items.transaction_id and transactions.business_id in (select my_business_ids()))
);
create index if not exists idx_transaction_items_transaction on transaction_items(transaction_id);
create index if not exists idx_transaction_items_service on transaction_items(service_id);
grant all on table transaction_items to anon, authenticated;
-- Keep transactions.items for now as deprecated, will be removed after app migrates to Drizzle
