-- Migration 019: Group booking capacity + interval overlap fix
--
-- 1. Adds `capacity` column to services (default 1 = individual, >1 = group class)
-- 2. Fixes the double-booking trigger to use interval overlap (not exact start time)
-- 3. Allows multiple bookings up to the service capacity for the same slot

-- ── 1. Capacity column ────────────────────────────────────────────────────────
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1
  CONSTRAINT capacity_positive CHECK (capacity >= 1);

-- ── 2. Updated trigger function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER AS $$
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

  -- Count existing non-cancelled appointments for this employee
  -- that overlap with the new booking's time interval
  SELECT COUNT(*) INTO v_count
  FROM appointments
  WHERE business_id = NEW.business_id
    AND employee_id = NEW.employee_id
    AND status      NOT IN ('cancelled', 'no_show')
    AND id          != NEW.id
    AND NEW.starts_at < ends_at
    AND NEW.ends_at   > starts_at;

  -- Block only when the slot is already at capacity
  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from migration 017 — no need to recreate it.
-- The function replacement above takes effect immediately.
