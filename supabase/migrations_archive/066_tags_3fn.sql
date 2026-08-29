-- 3FN: Normalize clients.tags text[] → tags + client_tags
create table if not exists public.tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.client_tags (
  client_id uuid not null references clients(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, tag_id)
);
-- Migrate existing tags
insert into public.tags (name)
select distinct unnest(tags) from public.clients where tags is not null and tags <> '{}'
on conflict (name) do nothing;
insert into public.client_tags (client_id, tag_id)
select c.id, t.id from public.clients c, unnest(c.tags) as tag_name
join public.tags t on t.name = tag_name
on conflict do nothing;

alter table client_tags enable row level security;
drop policy if exists tenant_access_client_tags on client_tags;
create policy tenant_access_client_tags on client_tags for all using (
  exists (select 1 from clients where clients.id = client_tags.client_id and clients.business_id in (select my_business_ids()))
);
grant all on table tags to anon, authenticated;
grant all on table client_tags to anon, authenticated;
create index if not exists idx_client_tags_tag on client_tags(tag_id);
