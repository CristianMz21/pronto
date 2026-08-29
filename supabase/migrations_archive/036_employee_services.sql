-- Migration 036: employee_services — qué barbero puede hacer qué servicio
-- Requerido para barbería: especialidades por barbero, filtrado en booking y POS

create table if not exists public.employee_services (
  employee_id uuid not null references public.employees(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (employee_id, service_id)
);

-- Índices para lookups
create index if not exists idx_employee_services_employee on public.employee_services(employee_id);
create index if not exists idx_employee_services_service  on public.employee_services(service_id);

-- Grants (igual que 001 pattern)
grant all on table public.employee_services to anon, authenticated;

-- RLS
alter table public.employee_services enable row level security;

drop policy if exists "tenant_access_employee_services" on public.employee_services;
create policy "tenant_access_employee_services" on public.employee_services
  for all using (
    exists (
      select 1 from public.employees e
      where e.id = employee_services.employee_id
        and e.business_id in (select public.my_business_ids())
    )
  );

-- Helper: validar que ambos lados pertenecen al mismo business (defensa en profundidad)
-- El trigger 032 ya valida capacidad/overlap, este solo asegura consistencia de tenant
create or replace function public.check_employee_service_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  emp_biz uuid;
  svc_biz uuid;
begin
  select business_id into emp_biz from public.employees where id = new.employee_id;
  select business_id into svc_biz  from public.services  where id = new.service_id;
  if emp_biz is null or svc_biz is null or emp_biz != svc_biz then
    raise exception 'employee and service must belong to same business';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_employee_service_tenant on public.employee_services;
create trigger trg_check_employee_service_tenant
  before insert or update on public.employee_services
  for each row execute procedure public.check_employee_service_tenant();
