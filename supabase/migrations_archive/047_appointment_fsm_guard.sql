-- Migration 047: FSM guard — enforce valid appointment status transitions
-- Complements 039 CHECK (allowed values) with a BEFORE UPDATE trigger that validates
-- the transition matrix. Terminal states (cancelled, no_show, paid) only allow staying equal.

create or replace function public.check_fsm_transition()
returns trigger
language plpgsql
as $$
declare
  allowed boolean := false;
begin
  -- No status change -> always allowed (including terminal staying equal)
  if new.status = old.status then
    return new;
  end if;

  -- Terminal states cannot transition to another state
  if old.status in ('cancelled', 'no_show', 'paid') then
    raise exception 'invalid_fsm_transition: % -> % (terminal)', old.status, new.status;
  end if;

  case old.status
    when 'pending' then
      allowed := new.status in ('scheduled', 'confirmed', 'cancelled');
    when 'scheduled' then
      allowed := new.status in ('confirmed', 'cancelled');
    when 'confirmed' then
      allowed := new.status in ('checked_in', 'cancelled', 'no_show');
    when 'checked_in' then
      allowed := new.status in ('in_service', 'cancelled', 'no_show');
    when 'in_service' then
      allowed := new.status in ('completed', 'cancelled');
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

drop trigger if exists trg_check_fsm_transition on public.appointments;
create trigger trg_check_fsm_transition
  before update of status on public.appointments
  for each row execute procedure public.check_fsm_transition();
