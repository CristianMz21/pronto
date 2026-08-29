-- Migration 038: barber extra — color, specialties, commission, cost
-- Extiende employees y services para barbería sin romper compatibilidad

-- Employees
alter table public.employees
  add column if not exists color text, -- hex e.g. #2563EB para calendario
  add column if not exists specialties text[] not null default '{}',
  add column if not exists commission_rate numeric(5,2), -- ej 50.00 = 50%
  add column if not exists commission_fixed numeric(10,2),
  add column if not exists bio text;

-- Validar color hex si se provee
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_color_hex') then
    alter table public.employees
      add constraint employees_color_hex
      check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_commission_rate_range') then
    alter table public.employees
      add constraint employees_commission_rate_range
      check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100));
  end if;
end
$$;

-- Services
alter table public.services
  add column if not exists cost numeric(10,2), -- costo interno
  add column if not exists color text,
  add column if not exists is_featured boolean not null default false;

-- Índices para filtros
create index if not exists idx_employees_business_active on public.employees(business_id, is_active);
create index if not exists idx_services_business_active on public.services(business_id, is_active);

-- Backfill: specialties vacías quedan como '{}', commission_rate null (hereda default futuro)
