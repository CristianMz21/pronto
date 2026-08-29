-- Migration 032: Atomic double-booking protection
--
-- Ports SaaS migration 061 to this self-hosted repo. Same two confirmed bugs
-- in check_slot_availability() (live concurrency-tested in the SaaS repo,
-- 5/5 races reproduced pre-fix, 5/5 blocked post-fix, including a two-employee
-- "Anyone" scenario):
--
-- 1. employee_id NOT NULL: the capacity check is a plain SELECT COUNT
--    compared against capacity, not atomic under READ COMMITTED — two
--    parallel transactions can both see "room available" before either
--    commits, so both pass. Fixed with pg_advisory_xact_lock keyed on
--    (business_id, employee_id): serializes concurrent attempts for the
--    same employee so the second transaction's COUNT reflects the first
--    transaction's committed row.
--
-- 2. employee_id IS NULL ("Anyone" / unassigned — same UI pattern as SaaS,
--    confirmed present in this repo's booking-calendar.tsx "Unassigned"
--    badge and PATCH /api/appointments/[id] unassign action): the old code
--    did `IF NEW.employee_id IS NULL THEN RETURN NEW; END IF` — capacity was
--    never checked at all, not a race, a total gap. Fixed by atomically
--    finding a specific free employee and assigning them
--    (NEW.employee_id := v_assigned_employee) instead of leaving the row
--    unassigned. pg_advisory_xact_lock keyed on (business_id, service_id)
--    serializes concurrent "Anyone" allocation attempts for the same
--    service so two clients can't both be handed the same employee's last
--    open slot.
--
--    No employee<->service link table exists in this repo's schema either
--    (confirmed by inspecting 001_initial_schema.sql and every subsequent
--    migration — no employee_services table, no employee_ids-style column):
--    any active employee can perform any service, so the candidate search
--    only filters on business_id + is_active + capacity.
--
--    No employees.location_id in this repo (no locations/multi-location
--    feature here) — nothing to consider, unlike the SaaS repo's known
--    Agency-tier limitation.
--
--    Manual "unassign" carve-out: this repo has the identical dashboard
--    feature (PATCH /api/appointments/[id] with employee_id: null →
--    "employee_id: empty string or null → unassign"), so the same carve-out
--    is required. TG_OP = 'UPDATE' with OLD.employee_id NOT NULL and
--    NEW.employee_id NULL is treated as a deliberate unassign and skips the
--    check/assign, same as before. Every other NEW.employee_id IS NULL case
--    — INSERT with "Anyone", or UPDATE that reschedules an already-
--    unassigned booking (OLD.employee_id NULL, NEW.employee_id still NULL,
--    e.g. starts_at changes) — goes through auto-assignment.
--
--    OLD is not assigned for INSERT-triggers in PL/pgSQL — referencing
--    OLD.employee_id during INSERT raises "record OLD is not assigned
--    yet" even inside a short-circuited AND condition. So the TG_OP check
--    is a separate outer IF, not combined into one AND expression.
--
-- Side effect (intentional, not a bug, matches SaaS 061): appointments that
-- used to sit at employee_id = NULL now get a real employee_id. Email
-- templates (lib/email.ts) already conditionally render an "Employee" row
-- when employeeName is present, and the dashboard calendar
-- (booking-calendar.tsx) will show the assigned employee's color instead of
-- the neutral "Unassigned" badge.
--
-- employees.is_active (not "active") — same column name as SaaS, confirmed
-- against 001_initial_schema.sql in this repo.
--
-- SET search_path = public was already present inline in this function
-- since migration 031 (this repo never had the SaaS 049/051/053 proconfig-
-- drift issue — hardened correctly from the start) — kept here too.

CREATE OR REPLACE FUNCTION check_slot_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_capacity           integer;
  v_count              integer;
  v_assigned_employee  uuid;
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

-- Trigger already exists from migration 017; CREATE OR REPLACE on the
-- function is sufficient. Re-create trigger defensively in case it was
-- ever dropped.
DROP TRIGGER IF EXISTS prevent_double_booking ON appointments;

CREATE TRIGGER prevent_double_booking
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_slot_availability();
