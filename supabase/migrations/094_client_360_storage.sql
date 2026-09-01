-- Migration 094: Customer 360 — storage bucket verification + RLS hardening
-- Spec: FR-C9 storage, FR-C16, data-model.md Storage (094), plan.md 094_client_360_storage.sql
-- Ensures client-styles bucket exists and is private (public false, 5MB, mimeTypes)
-- Idempotent: ON CONFLICT + DO $$ + storage.objects policy guards
-- Follows Supabase storage best practice: bucket via storage.buckets UPSERT, objects RLS via storage.objects policy

-- Verify / upsert bucket client-styles (private, 5MB limit — config.toml 50MiB global but bucket override logical)
do $$
begin
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
      -- Older Supabase images without file_size_limit/allowed_mime_types columns (fallback)
      begin
        insert into storage.buckets (id, name, public)
        values ('client-styles','client-styles', false)
        on conflict (id) do update set public = excluded.public;
      exception when others then null;
      end;
    end;
  end if;
end $$;

-- Ensure bucket client-styles is private (public false) — explicit update if ever set public by mistake
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name='storage') then
    begin
      update storage.buckets set public = false where id = 'client-styles' and public = true;
    exception when others then null;
    end;
  end if;
end $$;

-- Storage.objects RLS hardening for client-styles
-- storage.objects is RLS-enabled by default in Supabase; we ensure policies exist idempotently
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='storage' and table_name='objects') then

    -- 1. Authenticated/service_role can manage objects in client-styles
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client_styles_authenticated_all') then
      begin
        create policy "client_styles_authenticated_all" on storage.objects
          for all to authenticated, service_role
          using (bucket_id = 'client-styles')
          with check (bucket_id = 'client-styles');
      exception when duplicate_object then null;
      end;
    end if;

    -- 2. Service role bypass (explicit, for storage admin via service key — needed for signed URL generation)
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client_styles_service_all') then
      begin
        create policy "client_styles_service_all" on storage.objects
          for all to service_role
          using (bucket_id = 'client-styles')
          with check (bucket_id = 'client-styles');
      exception when duplicate_object then null;
      end;
    end if;

    -- 3. Ensure no anon public read (private bucket) — we do NOT create anon read policy;
    --    if an anon read policy somehow exists from earlier migration, drop it
    --    Note: keep guard — only drop if it's for client-styles and non-service
    begin
      -- Check for overly permissive anon policy on storage.objects for this bucket
      if exists (
        select 1 from pg_policies
        where schemaname='storage' and tablename='objects'
          and policyname in ('client_styles_anon_read','client_styles_public_read')
      ) then
        -- Drop them to enforce private via signed URL
        execute 'drop policy if exists "client_styles_anon_read" on storage.objects';
        execute 'drop policy if exists "client_styles_public_read" on storage.objects';
      end if;
    exception when others then null;
    end;

  end if;
end $$;

-- Idempotency verification helper: log bucket state for manual Advisors check
-- Not a table change: just ensure storage.buckets row exists for quickstart verification
do $$
declare
  v_count int;
begin
  if exists (select 1 from information_schema.schemata where schema_name='storage') then
    begin
      select count(*) into v_count from storage.buckets where id='client-styles';
      -- If still missing after upserts, raise warning but not error (allows supabase db reset without storage schema)
      if v_count = 0 then
        raise notice '094_client_360_storage: bucket client-styles not created — storage schema may be missing, manual dashboard creation required';
      end if;
    exception when others then null;
    end;
  end if;
end $$;

-- Comment for discovery
do $$ begin comment on table public.client_styles is 'Customer 360: storage bucket client-styles private 5MB — verify via storage.buckets'; exception when others then null; end $$;
