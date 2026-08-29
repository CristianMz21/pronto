-- Migration 052: Allow POS direct transition to paid (confirmed/scheduled/pending -> paid)
-- POS checkout for bookings should mark appointment as paid directly, without requiring
-- full check_in -> in_service -> completed chain. This complements 047.

create or replace function public.check_fsm_transition()
returns trigger
language plpgsql
as $$
declare
  allowed boolean := false;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('cancelled', 'no_show', 'paid') then
    raise exception 'invalid_fsm_transition: % -> % (terminal)', old.status, new.status;
  end if;

  case old.status
    when 'pending' then
      allowed := new.status in ('scheduled', 'confirmed', 'cancelled', 'paid');
    when 'scheduled' then
      allowed := new.status in ('confirmed', 'cancelled', 'paid');
    when 'confirmed' then
      allowed := new.status in ('checked_in', 'cancelled', 'no_show', 'paid');
    when 'checked_in' then
      allowed := new.status in ('in_service', 'cancelled', 'no_show', 'paid');
    when 'in_service' then
      allowed := new.status in ('completed', 'cancelled', 'paid');
    when 'completed' then
      allowed := new.status = 'paid';
    else
      allowed := false;
  end case;

  if not allowed then
    raise exception 'invalid_fsm_transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

-- Recreate trigger (same name, updated function)
drop trigger if exists trg_check_fsm_transition on public.appointments;
create trigger trg_check_fsm_transition
  before update of status on public.appointments
  for each row execute procedure public.check_fsm_transition();
