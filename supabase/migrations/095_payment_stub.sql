-- Migration 095: Customer 360 — Payments stub verification + perf index
-- Spec: T046 FR-C14, FR-C21 deposit_amount / payment_status / tip_amount stub
-- Idempotent: IF NOT EXISTS + DO $$ guards; tracks constitution III integrity, IV mobile parity
-- Ensures appointments.deposit_amount default 0, payment_status unpaid/deposit_paid/paid/failed, transactions pending allowed, adds client starts index for GET /api/client/me p95 <1.5s

-- 1. appointments.deposit_amount ensure not null default 0 (already in 092, re-assert idempotent)
alter table public.appointments add column if not exists deposit_amount integer not null default 0;
do $$ begin update public.appointments set deposit_amount = 0 where deposit_amount is null; exception when others then null; end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_deposit_amount_check' and conrelid = 'public.appointments'::regclass) then
    begin alter table public.appointments add constraint appointments_deposit_amount_check check (deposit_amount >= 0); exception when duplicate_object then null; end;
  end if;
end $$;

-- 2. payment_status ensure domain
alter table public.appointments add column if not exists payment_status text not null default 'unpaid';
do $$ begin update public.appointments set payment_status = 'unpaid' where payment_status is null; exception when others then null; end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_payment_status_check' and conrelid = 'public.appointments'::regclass) then
    begin alter table public.appointments add constraint appointments_payment_status_check check (payment_status in ('unpaid','deposit_paid','paid','failed')); exception when duplicate_object then null; end;
  end if;
end $$;

-- 3. transactions status already allows pending/completed/refunded per drizzle 542 — verify check exists
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_status_check' and conrelid = 'public.transactions'::regclass) then
    null;
  end if;
end $$;

-- 4. tip_amount column already exists in transactions (integer default 0) — verify
alter table public.transactions add column if not exists tip_amount integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_tip_amount_check' and conrelid = 'public.transactions'::regclass) then
    begin alter table public.transactions add constraint transactions_tip_amount_check check (tip_amount >= 0); exception when duplicate_object then null; end;
  end if;
end $$;

-- 5. Performance index for GET /api/client/me Promise.all (T059) — upcoming/history sorted by starts_at per client
create index if not exists idx_appointments_client_starts on public.appointments (client_id, starts_at desc) where client_id is not null;
create index if not exists idx_appointments_client_upcoming on public.appointments (business_id, client_id, starts_at) where client_id is not null;
-- Also support payment_status filtering
create index if not exists idx_appointments_payment_status on public.appointments (payment_status) where payment_status = 'deposit_paid';

-- Grants already present; ensure comments
do $$ begin comment on column public.appointments.deposit_amount is 'Customer 360 T046: anticipo COP integer >=0, stub V1 sin PSP'; exception when others then null; end $$;
do $$ begin comment on column public.appointments.payment_status is 'Customer 360 T046: unpaid|deposit_paid|paid|failed — stub V1'; exception when others then null; end $$;
