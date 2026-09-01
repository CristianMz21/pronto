-- Migration 088: Customer 360 — client preferences + status + preferred barber + notification prefs
-- Slice: Foundational — Block all stories until complete
-- Idempotent: IF NOT EXISTS + DO $$ EXCEPTION; follows 044_locations.sql style
-- spec: specs/009-customer-360/spec.md FR-C8, data-model.md Alter: clients (088)

-- 1. preferences jsonb (style details: cut, length, clipper, beard, barber_id, notes)
alter table public.clients add column if not exists preferences jsonb not null default '{}'::jsonb;

-- 2. status (active/inactive/VIP) — sales/retention segmentation
alter table public.clients add column if not exists status text not null default 'active';

-- Idempotent check constraint: status in ('active','inactive','VIP')
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_status_check' and conrelid = 'public.clients'::regclass
  ) then
    begin
      alter table public.clients add constraint clients_status_check
        check (status in ('active','inactive','VIP'));
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 3. preferred_barber_id FK → employees (nullable, single-sede default null)
alter table public.clients add column if not exists preferred_barber_id uuid references public.employees(id) on delete set null;

-- 4. notification_prefs jsonb (whatsapp/email/push toggles)
alter table public.clients add column if not exists notification_prefs jsonb not null default '{"whatsapp":true,"email":true,"push":true}'::jsonb;

-- Indexes
create index if not exists idx_clients_preferred_barber on public.clients(preferred_barber_id) where preferred_barber_id is not null;
create index if not exists idx_clients_status on public.clients(business_id, status);

-- RLS: clients already enabled; ensure policies intact (044/056). No new policy needed — tenant_access_clients covers prefs.
-- Emulate IF NOT EXISTS for comment (idempotent)
do $$
begin
  comment on column public.clients.preferences is 'Customer 360: style/jsonb {cut,length,clipper,beard,barber_id,notes} — es-CO/COP neutral, not PII';
exception when others then null;
end $$;

do $$
begin
  comment on column public.clients.status is 'Customer 360: active|inactive|VIP segmentation';
exception when others then null;
end $$;

do $$
begin
  comment on column public.clients.preferred_barber_id is 'Customer 360: FK employees.id, pre-select on booking';
exception when others then null;
end $$;

do $$
begin
  comment on column public.clients.notification_prefs is 'Customer 360: {whatsapp,email,push} booleans — defaults true, respects campaign 1/week';
exception when others then null;
end $$;
