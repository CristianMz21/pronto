-- Migration 034: Distinguish "no staff available" from a real time conflict
--
-- Ports SaaS migration 068 to this self-hosted repo. Root cause (found via a
-- real support ticket on the SaaS side): a business with 0 active employees
-- had every "Anyone" (auto-assign) booking attempt fail with
-- 'slot_already_booked' — a real exception, but a misleading one. The
-- capacity was never the problem; there was nobody to assign at all.
--
-- check_slot_availability()'s auto-assign branch now checks whether *any*
-- active employee exists for the business before searching for a free one.
-- If none exist, it raises 'no_staff_available' instead of
-- 'slot_already_booked' — a distinct exception the app layer can map to an
-- honest message. Every other case (employees exist but are all busy, or a
-- specific employee was requested and is double-booked) keeps raising
-- 'slot_already_booked' exactly as before.
--
-- No employees.location_id in this repo (no locations/multi-location
-- feature here, unlike the SaaS repo) — so unlike SaaS migration 068, there
-- is no location filter to carry over; the "any employee exists" check is
-- scoped to business_id only.

CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_capacity           integer;
  v_count              integer;
  v_assigned_employee  uuid;
  v_any_employee       boolean;
BEGIN
  -- Manual unassign via dashboard must not be overridden by auto-assignment.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.employee_id IS NOT NULL AND NEW.employee_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Capacity of the booked service (defaults to 1 if not set) — needed by
  -- both branches below.
  SELECT COALESCE(capacity, 1) INTO v_capacity
  FROM services
  WHERE id = NEW.service_id;

  IF NEW.employee_id IS NULL THEN
    -- "Anyone" booking, or reschedule of an already-unassigned booking:
    -- atomically find and assign a specific free employee.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.business_id::text || ':' || NEW.service_id::text || ':alloc', 0)
    );

    SELECT EXISTS (
      SELECT 1 FROM employees e
      WHERE e.business_id = NEW.business_id
        AND e.is_active = true
    ) INTO v_any_employee;

    IF NOT v_any_employee THEN
      RAISE EXCEPTION 'no_staff_available';
    END IF;

    SELECT e.id INTO v_assigned_employee
    FROM employees e
    WHERE e.business_id = NEW.business_id
      AND e.is_active = true
      AND (
        SELECT COUNT(*) FROM appointments a
        WHERE a.employee_id = e.id
          AND a.status    NOT IN ('cancelled', 'no_show')
          AND a.id        != NEW.id
          AND a.starts_at <  COALESCE(NEW.ends_at, NEW.starts_at + interval '1 second')
          AND NEW.starts_at < COALESCE(a.ends_at, a.starts_at + interval '1 second')
      ) < v_capacity
    ORDER BY e.id
    LIMIT 1;

    IF v_assigned_employee IS NULL THEN
      RAISE EXCEPTION 'slot_already_booked';
    END IF;

    NEW.employee_id := v_assigned_employee;
    RETURN NEW;
  END IF;

  -- Specific employee requested: serialize concurrent attempts for this
  -- employee so the capacity COUNT below reflects committed bookings only.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.business_id::text || ':' || NEW.employee_id::text, 0)
  );

  SELECT COUNT(*) INTO v_count
  FROM appointments
  WHERE business_id = NEW.business_id
    AND employee_id = NEW.employee_id
    AND status      NOT IN ('cancelled', 'no_show')
    AND id          != NEW.id
    AND starts_at   <  COALESCE(NEW.ends_at, NEW.starts_at + interval '1 second')
    AND COALESCE(ends_at, starts_at + interval '1 second') > NEW.starts_at;

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  RETURN NEW;
END;
$$;
