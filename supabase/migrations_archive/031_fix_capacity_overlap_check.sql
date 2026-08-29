-- Migration 031: Restore capacity-aware overlap check in check_slot_availability()
--
-- Ports SaaS migration 051 to the self-hosted repo. This repo is still on the
-- version from migration 019 (exact-overlap check + capacity counting), while the
-- SaaS repo went through an extra migration (041) that fixed a real overlap-check
-- bug (exact starts_at equality missed overlapping-but-not-identical intervals,
-- and NULL ends_at on legacy rows wasn't handled) but accidentally dropped the
-- capacity counting logic in the process. This migration merges both fixes:
-- the 041 interval-overlap logic (with the NULL-safe ends_at fallback) combined
-- with the 019 capacity counting.
--
-- SET search_path = public is kept inline (hardened for this repo in migration 030)
-- since CREATE OR REPLACE FUNCTION resets proconfig unless respecified.

CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_count    integer;
BEGIN
  -- Only enforce when a specific employee is assigned.
  -- NULL employee_id = walk-ins / unassigned → allow freely.
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the capacity of the booked service (defaults to 1 if not set)
  SELECT COALESCE(capacity, 1) INTO v_capacity
  FROM services
  WHERE id = NEW.service_id;

  -- Count existing non-cancelled/non-no_show appointments for this employee
  -- that overlap with the new booking's time interval.
  -- ends_at may be NULL for legacy rows; fall back to starts_at + 1s so the
  -- interval comparison still behaves like the old equality check.
  SELECT COUNT(*) INTO v_count
  FROM appointments
  WHERE business_id = NEW.business_id
    AND employee_id = NEW.employee_id
    AND status      NOT IN ('cancelled', 'no_show')
    AND id          != NEW.id
    AND starts_at   <  COALESCE(NEW.ends_at, NEW.starts_at + interval '1 second')
    AND COALESCE(ends_at, starts_at + interval '1 second') > NEW.starts_at;

  -- Block only when the slot is already at capacity
  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists from migration 017; CREATE OR REPLACE on the function is sufficient.
-- Re-create trigger defensively in case it was dropped.
DROP TRIGGER IF EXISTS prevent_double_booking ON appointments;

CREATE TRIGGER prevent_double_booking
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_slot_availability();
