alter table public.businesses add column if not exists accent_color text default '#C5A059' not null;
alter table public.businesses add column if not exists hero_title text;
alter table public.businesses add column if not exists hero_subtitle text;
alter table public.businesses add column if not exists hero_image_url text;
alter table public.businesses add column if not exists gallery_urls text[] default '{}' not null;
alter table public.businesses add column if not exists locale text default 'es' not null;

-- ensure landing can resolve via slug publicly (anon)
do $$ begin
  if not exists (select 1 from pg_policies where policyname='public_read_businesses_by_slug' and tablename='businesses') then
    create policy public_read_businesses_by_slug on public.businesses for select to anon, authenticated using (true);
  end if;
end $$;
