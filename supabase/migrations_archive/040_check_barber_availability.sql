-- Migration 040: check_barber_availability — valida horario, vacaciones y especialidades
-- Se ejecuta BEFORE INSERT/UPDATE en appointments, después de check_slot_availability (032) en orden alfabético,
-- pero maneja employee_id NULL como skip (032 se encarga de auto-assign para "Anyone").

create or replace function public.check_barber_availability()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tz            text;
  v_local_date    date;
  v_local_time    text;
  v_local_end_time text;
  v_dow           int;
  v_hours         record;
  v_is_open       boolean;
  v_open          text;
  v_close         text;
  v_break_start   text;
  v_break_end     text;
  v_has_services  boolean;
  v_unavail       int;
  v_is_active     boolean;
begin
  -- Skip si no hay empleado asignado (Anyone) — 032 lo auto-asigna; si sigue null tras 032, es unassign manual y se permite
  if new.employee_id is null then
    return new;
  end if;

  -- 1. Validar empleado activo
  select is_active into v_is_active from public.employees where id = new.employee_id;
  if v_is_active is null or v_is_active = false then
    raise exception 'barber_inactive';
  end if;

  -- 2. Validar especialidad: si el negocio usa employee_services, el barbero debe estar vinculado al servicio
  -- Si no hay ningún vínculo para ese servicio, se asume que todos pueden (compatibilidad hacia atrás)
  select exists(select 1 from public.employee_services where service_id = new.service_id) into v_has_services;
  if v_has_services then
    if not exists(select 1 from public.employee_services where employee_id = new.employee_id and service_id = new.service_id) then
      raise exception 'barber_not_qualified';
    end if;
  end if;

  -- 3. Validar vacaciones/descansos (overlap)
  select count(*) into v_unavail
  from public.employee_unavailability
  where employee_id = new.employee_id
    and new.starts_at < ends_at
    and new.ends_at > starts_at;
  if v_unavail > 0 then
    raise exception 'barber_unavailable';
  end if;

  -- 4. Validar business_hours (incl. break) — convierte UTC a zona del negocio
  select timezone into v_tz from public.businesses where id = new.business_id;
  if v_tz is null then v_tz := 'UTC'; end if;

  -- Convertir starts_at/ends_at a fecha/hora local del negocio
  -- starts_at AT TIME ZONE v_tz => timestamp sin tz en zona local
  v_local_date := (new.starts_at at time zone v_tz)::date;
  -- dow: 0=Dom ..6=Sáb (igual que business_hours)
  v_dow := extract(dow from (new.starts_at at time zone v_tz))::int;
  v_local_time := to_char((new.starts_at at time zone v_tz), 'HH24:MI');
  v_local_end_time := to_char((new.ends_at at time zone v_tz), 'HH24:MI');

  -- Buscar business_hours para ese día
  select is_open, open_time, close_time, break_start, break_end
    into v_is_open, v_open, v_close, v_break_start, v_break_end
  from public.business_hours
  where business_id = new.business_id and day_of_week = v_dow;

  -- Si no hay fila, usar DEFAULT_HOURS: Lun-Vie 09:00-20:00, Sáb-Dom según migraciones anteriores (pero default local es 09-20 Lun-Sáb)
  if not found then
    if v_dow between 1 and 5 then
      v_is_open := true; v_open := '09:00'; v_close := '20:00';
    elsif v_dow = 6 then
      v_is_open := true; v_open := '09:00'; v_close := '20:00';
    else
      v_is_open := false; v_open := '09:00'; v_close := '20:00';
    end if;
    v_break_start := null; v_break_end := null;
  end if;

  if v_is_open = false then
    raise exception 'outside_availability: closed';
  end if;

  -- Debe estar completamente dentro de open..close
  if v_local_time < v_open or v_local_end_time > v_close then
    raise exception 'outside_availability: outside_hours';
  end if;

  -- No debe solapar break
  if v_break_start is not null and v_break_end is not null then
    if v_local_time < v_break_end and v_local_end_time > v_break_start then
      raise exception 'outside_availability: break';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists check_barber_availability on public.appointments;
create trigger check_barber_availability
  before insert or update on public.appointments
  for each row execute procedure public.check_barber_availability();
