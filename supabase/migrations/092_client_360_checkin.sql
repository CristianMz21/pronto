-- Migration 092: Customer 360 — appointments check-in + payment stub + guest_name
-- Spec: FR-C6 (check-in), FR-C18 (guest_name), FR-C21 (payment_status/deposit_amount), data-model.md appointments (092)
-- Covers: checkin_code (nanoid 8 for QR), payment_status, deposit_amount, guest_name
-- Idempotent: IF NOT EXISTS + DO $$ + UNIQUE index + CHECKs

-- 1. checkin_code text UNIQUE (QR content)
alter table public.appointments add column if not exists checkin_code text;

-- Ensure unique constraint/index idempotently
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'idx_appointments_checkin' and tablename='appointments') then
    begin
      create unique index idx_appointments_checkin on public.appointments(checkin_code) where checkin_code is not null;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Additional plain index for lookup (if unique partial not enough, keep non-unique fallback)
create index if not exists idx_appointments_checkin_lookup on public.appointments(checkin_code) where checkin_code is not null;

-- 2. payment_status stub for deposit/online flow (V1 no PSP)
alter table public.appointments add column if not exists payment_status text not null default 'unpaid';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_payment_status_check' and conrelid = 'public.appointments'::regclass) then
    begin
      alter table public.appointments add constraint appointments_payment_status_check
        check (payment_status in ('unpaid','deposit_paid','paid','failed'));
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Backfill nulls to 'unpaid' if column existed nullable before
do $$
begin
  update public.appointments set payment_status = 'unpaid' where payment_status is null;
exception when others then null;
end $$;

-- 3. deposit_amount integer COP (cents? spec says integer weight COP, 0 default, >=0)
alter table public.appointments add column if not exists deposit_amount integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_deposit_amount_check' and conrelid = 'public.appointments'::regclass) then
    begin
      alter table public.appointments add constraint appointments_deposit_amount_check check (deposit_amount >= 0);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Ensure not null + default 0 for existing nullable rows
do $$
begin
  update public.appointments set deposit_amount = 0 where deposit_amount is null;
exception when others then null;
end $$;

-- 4. guest_name for "Reservar para otra persona" (Yo/Mi hijo/Otra)
alter table public.appointments add column if not exists guest_name text;

-- Optional index for guest searches (low cardinality but useful for CRM filter)
create index if not exists idx_appointments_guest on public.appointments(business_id, guest_name) where guest_name is not null;

-- Ensure RLS still enabled (already via 056, but idempotent)
alter table public.appointments enable row level security;

-- Grants already exist; ensure columns comment for transparency (idempotent)
do $$ begin comment on column public.appointments.checkin_code is 'Customer 360: nanoid(8) unique for QR check-in, null until booking creates'; exception when others then null; end $$;
do $$ begin comment on column public.appointments.payment_status is 'Customer 360: unpaid|deposit_paid|paid|failed — stub V1, PSP V2 (Bold/Wompi/Stripe)'; exception when others then null; end $$;
do $$ begin comment on column public.appointments.deposit_amount is 'Customer 360: anticipo COP integer >=0, es-CO locale'; exception when others then null; end $$;
do $$ begin comment on column public.appointments.guest_name is 'Customer 360: Para quién? Yo/Mi hijo/Otra — nullable'; exception when others then null; end $$;

-- No new RLS policy needed; tenant_access_appointments + client_self_* already cover new columns
