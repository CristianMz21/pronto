-- Migration 039: FSM estados cita — Scheduled → Confirmed → Checked-in → In-service → Completed
-- Extiende appointments.status de forma aditiva (compatible con valores legacy)

-- Drop old check
alter table public.appointments drop constraint if exists appointments_status_check;

-- New check: incluye legacy pending/confirmed + nuevos FSM barbería
alter table public.appointments
  add constraint appointments_status_check
  check (status in (
    'pending',      -- legacy: alias de scheduled (pre-barber)
    'scheduled',    -- nuevo: creada, pendiente de confirmación
    'confirmed',    -- confirmada
    'checked_in',   -- cliente llegó
    'in_service',   -- en servicio
    'completed',    -- finalizada
    'cancelled',    -- cancelada
    'no_show',      -- no se presentó
    'paid'          -- pagada (POS)
  ));

-- Índice para reportes por estado
create index if not exists idx_appointments_status on public.appointments(business_id, status);

-- Trigger opcional: normalizar pending→scheduled para nuevos inserts si se crea sin status explícito?
-- No forzamos; dejamos ambos válidos para compatibilidad. La UI nueva usará scheduled.
