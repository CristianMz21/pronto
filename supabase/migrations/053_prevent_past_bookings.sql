-- Prevent booking in the past — synchronized with app/api/book and booking-calendar
-- All layers (client, API, DB) must agree: starts_at must be > now()
-- Lead time (businesses.min_advance_minutes / booking_lead_time_enabled, migration 054) is
-- enforced ONLY at API/client for online bookings; DB only blocks past to allow immediate
-- admin walk-ins from dashboard (BookingCalendar intentionally checks only past, not too_soon).
-- We deliberately do NOT read min_advance_minutes in this trigger: walk-ins and
-- manual admin bookings must remain possible with 0 lead time. Configurable lead
-- time stays at the API layer where business config is known.

create or replace function public.prevent_past_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only check when starts_at is being set/changed
  if TG_OP = 'INSERT' or NEW.starts_at is distinct from OLD.starts_at then
    if NEW.starts_at <= now() then
      raise exception 'in_past: cannot book in the past (starts_at=%, now=%)', NEW.starts_at, now()
        using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_past_booking on public.appointments;
create trigger trg_prevent_past_booking
  before insert or update of starts_at on public.appointments
  for each row execute function public.prevent_past_booking();
