-- Migration 089: Customer 360 — favorites M2M (client ↔ employee/barber)
-- Spec: FR-C8, FR-C11, data-model.md favorites (089), plan.md 089_client_360_favorites.sql
-- Idempotent: IF NOT EXISTS + DO $$ + tenant_access_favorites RLS

create table if not exists public.favorites (
  client_id   uuid not null references public.clients(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (client_id, employee_id)
);

-- Ensure columns exist if table pre-existed with different def (idempotent completeness)
alter table public.favorites add column if not exists client_id uuid;
alter table public.favorites add column if not exists employee_id uuid;
alter table public.favorites add column if not exists created_at timestamptz not null default now();

-- Indexes for quick toggle + nextAvailability calc
create index if not exists idx_favorites_client on public.favorites(client_id);
create index if not exists idx_favorites_employee on public.favorites(employee_id);
create index if not exists idx_favorites_created on public.favorites(client_id, created_at desc);

-- Grants (PostgREST anon/authenticated — Supabase May 2026 requirement)
grant all on table public.favorites to anon, authenticated;

-- RLS
alter table public.favorites enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='favorites' and policyname='tenant_access_favorites') then
    create policy "tenant_access_favorites" on public.favorites
      for all using (
        exists (
          select 1 from public.clients c
          where c.id = favorites.client_id
            and c.business_id in (select public.my_business_ids())
        )
      )
      with check (
        exists (
          select 1 from public.clients c
          where c.id = favorites.client_id
            and c.business_id in (select public.my_business_ids())
        )
      );
  end if;
end $$;

-- Additional client_self policy for performance (optional, not required but follows 056 pattern)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='favorites' and policyname='client_self_favorites') then
    create policy "client_self_favorites" on public.favorites
      for all using (
        client_id in (select id from public.clients where user_id = auth.uid())
      )
      with check (
        client_id in (select id from public.clients where user_id = auth.uid())
      );
  end if;
exception when duplicate_object then null;
end $$;

comment on table public.favorites is 'Customer 360: favorites M2M client→barber, tenant via clients.business_id';
