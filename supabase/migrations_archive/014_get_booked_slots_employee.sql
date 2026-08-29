-- Миграция 014: фильтрация занятых слотов по сотруднику
--
-- Добавляет опциональный параметр p_employee_id в get_booked_slots().
-- Когда параметр передан — возвращаются только слоты конкретного сотрудника,
-- что позволяет публичной странице бронирования показывать независимое
-- расписание каждого специалиста.
-- Когда NULL — прежнее поведение (все слоты бизнеса).

create or replace function public.get_booked_slots(
  p_business_id uuid,
  p_date        date,
  p_employee_id uuid default null
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select a.starts_at, a.ends_at
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  where a.business_id = p_business_id
    and (a.starts_at at time zone coalesce(b.timezone, 'UTC'))::date = p_date
    and a.status not in ('cancelled', 'no_show')
    and (p_employee_id is null or a.employee_id = p_employee_id)
$$;
