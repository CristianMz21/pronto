-- Migration 085: Config completeness per T075-T076 — idempotent
-- Extends business_hours per location_id, ensures tax/payment/loyalty/cancel_lead config

-- ── business_hours location_id ────────────────────────────────────────────
alter table public.business_hours add column if not exists location_id uuid references public.locations(id) on delete cascade;
create index if not exists idx_business_hours_location on public.business_hours(business_id, location_id);
create index if not exists idx_business_hours_day on public.business_hours(business_id, location_id, day_of_week);

-- Backfill unique constraint: original was (business_id, day_of_week) but with location_id need (business_id, location_id, day_of_week)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'business_hours_business_id_day_of_week_key' and conrelid='public.business_hours'::regclass) then
    -- keep legacy constraint, add new one for location-aware variant if not exists
    if not exists (select 1 from pg_constraint where conname='business_hours_business_location_day_key') then
      begin
        alter table public.business_hours add constraint business_hours_business_location_day_key unique (business_id, location_id, day_of_week);
      exception when duplicate_object then null;
                    when others then null;
      end;
    end if;
  else
    if not exists (select 1 from pg_constraint where conname='business_hours_business_location_day_key') then
      begin
        alter table public.business_hours add constraint business_hours_business_location_day_key unique (business_id, location_id, day_of_week);
      exception when others then null;
      end;
    end if;
  end if;
end $$;

-- ── businesses config columns (mirror business_settings for single-source reads) ──
alter table public.businesses add column if not exists cancel_lead_time integer not null default 60 check (cancel_lead_time >= 0);
alter table public.businesses add column if not exists tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100);
alter table public.businesses add column if not exists payment_methods text[] not null default array['cash','card','transfer']::text[];
-- loyalty already via 077, ensure exists
alter table public.businesses add column if not exists loyalty_earn_rate integer not null default 1000 check (loyalty_earn_rate > 0);
alter table public.businesses add column if not exists loyalty_redeem_rate integer not null default 100 check (loyalty_redeem_rate > 0);
alter table public.businesses add column if not exists loyalty_redeem_value integer not null default 10000 check (loyalty_redeem_value > 0);
-- also ensure min_advance and require_cash already via 054/055, verify
alter table public.businesses add column if not exists min_advance_minutes integer not null default 30 check (min_advance_minutes >= 0);
alter table public.businesses add column if not exists require_cash_register_for_cash boolean not null default true;
alter table public.businesses add column if not exists allow_guest_bookings boolean not null default true;
alter table public.businesses add column if not exists booking_lead_time_enabled boolean not null default true;

-- ── business_settings sync (ensure 068 columns exist) ─────────────────────
alter table public.business_settings add column if not exists cancel_lead_time integer not null default 60 check (cancel_lead_time >= 0);
alter table public.business_settings add column if not exists tax_rate numeric(5,2) not null default 0 check (tax_rate >=0 and tax_rate <=100);
alter table public.business_settings add column if not exists payment_methods text[] not null default array['cash','card','transfer'];
-- loyalty rates in business_settings (optional)
alter table public.business_settings add column if not exists loyalty_earn_rate integer not null default 1000;
alter table public.business_settings add column if not exists loyalty_redeem_rate integer not null default 100;
alter table public.business_settings add column if not exists loyalty_redeem_value integer not null default 10000;

-- ── grant/rls ─────────────────────────────────────────────────────────────
grant all on table public.business_hours to anon, authenticated;
grant all on table public.business_settings to anon, authenticated;

-- holidays already via 058/083, ensure grants
grant all on table public.holidays to anon, authenticated;
