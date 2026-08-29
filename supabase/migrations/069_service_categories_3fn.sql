-- 3FN: Normalize services.category text -> service_categories
create table if not exists public.service_categories (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);
-- Migrate existing categories
insert into public.service_categories (business_id, name)
select distinct business_id, category from public.services where category is not null and category <> ''
on conflict do nothing;

-- Add FK column (nullable for now, will backfill)
alter table services add column if not exists category_id uuid references service_categories(id) on delete set null;
-- Backfill
update public.services s set category_id = c.id from public.service_categories c where s.business_id = c.business_id and s.category = c.name and s.category_id is null;

alter table service_categories enable row level security;
drop policy if exists tenant_access_service_categories on service_categories;
create policy tenant_access_service_categories on service_categories for all using (business_id in (select my_business_ids()));
grant all on table service_categories to anon, authenticated;
create index if not exists idx_service_categories_business on service_categories(business_id);
create index if not exists idx_services_category_id on services(category_id);
