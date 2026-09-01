-- Migration 091: Customer 360 — reviews (rating 1-5, tags, comment, unique appointment_id)
-- Spec: FR-C7, User Story 4 Check-in + Reseñas, data-model.md reviews (091)
-- Idempotent: IF NOT EXISTS + DO $$ + tenant_access_reviews + UNIQUE appointment_id + CHECK 1-5 + RLS

create table if not exists public.reviews (
  id             uuid primary key default uuid_generate_v4(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  business_id    uuid not null references public.businesses(id) on delete cascade,
  employee_id    uuid references public.employees(id) on delete set null,
  rating         smallint not null check (rating between 1 and 5),
  tags           text[] not null default '{}',
  comment        text,
  created_at     timestamptz not null default now()
);

-- Ensure columns if table existed partially
alter table public.reviews add column if not exists appointment_id uuid;
alter table public.reviews add column if not exists client_id uuid;
alter table public.reviews add column if not exists business_id uuid;
alter table public.reviews add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.reviews add column if not exists rating smallint;
alter table public.reviews add column if not exists tags text[] not null default '{}';
alter table public.reviews add column if not exists comment text;
alter table public.reviews add column if not exists created_at timestamptz not null default now();

-- Idempotent check constraint guard (if rating column added without constraint)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_check' and conrelid = 'public.reviews'::regclass) then
    begin
      alter table public.reviews add constraint reviews_rating_check check (rating between 1 and 5);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Unique constraint guard for appointment_id (named by Postgres as reviews_appointment_id_key)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_appointment_id_key' and conrelid = 'public.reviews'::regclass) then
    begin
      alter table public.reviews add constraint reviews_appointment_id_key unique (appointment_id);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Unique index fallback (some Postgres versions use index not constraint)
create unique index if not exists unique_reviews_appointment on public.reviews(appointment_id);

-- Indexes
create index if not exists idx_reviews_business on public.reviews(business_id);
create index if not exists idx_reviews_client on public.reviews(client_id);
create index if not exists idx_reviews_employee on public.reviews(employee_id) where employee_id is not null;
create index if not exists idx_reviews_rating on public.reviews(business_id, rating);
create index if not exists idx_reviews_created on public.reviews(created_at desc);

-- Grants
grant all on table public.reviews to anon, authenticated;

-- RLS
alter table public.reviews enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='tenant_access_reviews') then
    create policy "tenant_access_reviews" on public.reviews
      for all using (business_id in (select public.my_business_ids()))
      with check (business_id in (select public.my_business_ids()));
  end if;
end $$;

-- Client self-access: restrict to own client_id via auth.uid() link (056 pattern)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='client_self_reviews') then
    create policy "client_self_reviews" on public.reviews
      for all using (
        client_id in (select id from public.clients where user_id = auth.uid())
        or business_id in (select public.my_business_ids())
      )
      with check (
        client_id in (select id from public.clients where user_id = auth.uid())
        or business_id in (select public.my_business_ids())
      );
  end if;
exception when duplicate_object then null;
end $$;

-- Note: business rule enforcement (only completed appointments) is API guard + advisory lock, not DB trigger,
-- to keep FSM via 039/047 untouched. DB unique prevents double-review race plus pg_advisory_xact_lock in app layer.

comment on table public.reviews is 'Customer 360: 1 per appointment (unique), rating 1-5, tags text[], comment, post-completed only';
comment on column public.reviews.rating is '1-5 stars, check ensures 1..5';
comment on column public.reviews.tags is 'Tags like Atención/Corte/Puntualidad/Ambiente';
