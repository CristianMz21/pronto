-- Migration 037: employee_unavailability — vacaciones, descansos, bajas
-- Bloquea disponibilidad en trigger check_barber_availability (038/039)

create table if not exists public.employee_unavailability (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text, -- vacaciones, descanso, baja, otro
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  check (ends_at > starts_at)
);

create index if not exists idx_emp_unavail_business on public.employee_unavailability(business_id);
create index if not exists idx_emp_unavail_employee on public.employee_unavailability(employee_id);
create index if not exists idx_emp_unavail_range on public.employee_unavailability(employee_id, starts_at, ends_at);

grant all on table public.employee_unavailability to anon, authenticated;

alter table public.employee_unavailability enable row level security;

drop policy if exists "tenant_access_employee_unavailability" on public.employee_unavailability;
create policy "tenant_access_employee_unavailability" on public.employee_unavailability
  for all using (business_id in (select public.my_business_ids()));

-- Validar que employee pertenece al business indicado
create or replace function public.check_unavailability_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  emp_biz uuid;
begin
  select business_id into emp_biz from public.employees where id = new.employee_id;
  if emp_biz is null or emp_biz != new.business_id then
    raise exception 'employee does not belong to business';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_unavailability_tenant on public.employee_unavailability;
create trigger trg_check_unavailability_tenant
  before insert or update on public.employee_unavailability
  for each row execute procedure public.check_unavailability_tenant();
