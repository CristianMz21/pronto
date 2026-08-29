-- Migration 017: Prevent double-booking at the database level
--
-- Uses a BEFORE INSERT OR UPDATE trigger instead of a partial unique index
-- because the conflict rule is conditional: uniqueness is only enforced
-- when a specific employee is assigned (employee_id IS NOT NULL).
--
-- When employee_id IS NULL the booking is not employee-bound, so multiple
-- simultaneous bookings are allowed — this covers cafes, fitness classes,
-- walk-in counters, and any business that doesn't track per-employee slots.
--
-- The trigger raises a named exception ('slot_already_booked') that the
-- application layer catches and converts to a user-facing error message.

CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enforce uniqueness when a specific employee is assigned.
  -- If employee_id is NULL, the slot is not employee-bound
  -- and multiple bookings at the same time are allowed
  -- (e.g. cafes, fitness classes, walk-in businesses).
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   appointments
    WHERE  business_id  = NEW.business_id
      AND  employee_id  = NEW.employee_id
      AND  starts_at    = NEW.starts_at
      AND  status      != 'cancelled'
      AND  id          != NEW.id
  ) THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop first so re-running the migration is safe
DROP TRIGGER IF EXISTS prevent_double_booking ON appointments;

CREATE TRIGGER prevent_double_booking
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_slot_availability();
