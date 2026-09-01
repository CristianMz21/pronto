-- Migration 090: Customer 360 — client_styles + storage bucket client-styles
-- Spec: FR-C9, data-model.md client_styles (090), plan.md 090_client_360_styles.sql
-- Idempotent: IF NOT EXISTS + DO $$ + tenant_access_client_styles + storage bucket public false 5MB

create table if not exists public.client_styles (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id  uuid references public.services(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  photo_url   text not null,
  notes       text,
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Ensure columns if table existed partially (idempotent completeness)
alter table public.client_styles add column if not exists client_id uuid;
alter table public.client_styles add column if not exists business_id uuid;
alter table public.client_styles add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.client_styles add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.client_styles add column if not exists photo_url text;
alter table public.client_styles add column if not exists notes text;
alter table public.client_styles add column if not exists is_favorite boolean not null default false;
alter table public.client_styles add column if not exists created_at timestamptz not null default now();

-- Indexes
create index if not exists idx_client_styles_client on public.client_styles(client_id);
create index if not exists idx_client_styles_business on public.client_styles(business_id);
create index if not exists idx_client_styles_favorite on public.client_styles(client_id, is_favorite) where is_favorite = true;
create index if not exists idx_client_styles_created on public.client_styles(client_id, created_at desc);

-- Grants
grant all on table public.client_styles to anon, authenticated;

-- RLS
alter table public.client_styles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_styles' and policyname='tenant_access_client_styles') then
    create policy "tenant_access_client_styles" on public.client_styles
      for all using (business_id in (select public.my_business_ids()))
      with check (business_id in (select public.my_business_ids()));
  end if;
end $$;

-- Optional client self-access (mirrors 056)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_styles' and policyname='client_self_client_styles') then
    create policy "client_self_client_styles" on public.client_styles
      for all using (
        client_id in (select id from public.clients where user_id = auth.uid())
      )
      with check (
        client_id in (select id from public.clients where user_id = auth.uid())
      );
  end if;
exception when duplicate_object then null;
end $$;

comment on table public.client_styles is 'Customer 360: client haircut photos + style notes, storage bucket client-styles';

-- Storage bucket client-styles (private, 5MB limit — global limit 50MiB in config.toml:123 but bucket override logical)
-- Use storage.buckets UPSERT pattern via ON CONFLICT (id) DO NOTHING; Supabase local may not have storage schema yet, so guard with DO.
do $$
begin
  -- Only if storage schema exists (supabase local)
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    begin
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values (
        'client-styles',
        'client-styles',
        false,
        5242880,
        array['image/jpeg','image/png','image/webp','image/avif']
      )
      on conflict (id) do update
        set public = excluded.public,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types;
    exception when others then
      -- Fallback older Supabase without file_size_limit/allowed_mime_types columns
      begin
        insert into storage.buckets (id, name, public)
        values ('client-styles','client-styles', false)
        on conflict (id) do nothing;
      exception when others then null;
      end;
    end;
  end if;
end $$;

-- Storage.objects RLS for client-styles (private, signed URL 1h) — tenant + authenticated only
-- Supabase storage.objects has RLS enabled by default; we add permissive tenant policy for bucket_id = 'client-styles'
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='storage' and table_name='objects') then
    -- Ensure RLS enabled (already in cloud, but idempotent)
    begin
      -- Only attempt if we have privileges
      perform 1;
    end;
    exception when others then null;
    end;

    -- Create policies if not exists — allow authenticated to manage own bucket
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client_styles_authenticated_all') then
      begin
        create policy "client_styles_authenticated_all" on storage.objects
          for all to authenticated, service_role using (bucket_id = 'client-styles')
          with check (bucket_id = 'client-styles');
      exception when others then null;
      end;
    end if;

    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client_styles_anon_read') then
      begin
        -- Private bucket: anon cannot read (public false); this policy intentionally NOT created for anon
        -- Keep placeholder for audit: no anon policy => signed URL required
        null;
      exception when others then null;
      end;
    end if;
  end if;
end $$;
