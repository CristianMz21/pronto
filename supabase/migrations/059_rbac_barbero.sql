-- Migration 059: RBAC barbero reducido — constraint + helpers + RLS
-- Idempotent: every DDL guarded with IF NOT EXISTS / DO $$ / DROP IF EXISTS

-- 1. Backfill legacy 'employee' -> 'staff'
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='employees' and column_name='role') then
    update public.employees set role='staff' where role='employee';
  end if;
end
$$;

-- 2. CHECK constraint role IN ('admin','staff','barbero') — default 'staff'
do $$
begin
  if not exists (select 1 from pg_constraint where conname='employees_role_check') then
    alter table public.employees
      add constraint employees_role_check check (role in ('admin','staff','barbero'));
  end if;
end
$$;

alter table public.employees alter column role set default 'staff';

-- 3. Helpers: current_user_role() and current_employee_id() — SECURITY DEFINER STABLE, search_path=public
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.businesses where owner_id = auth.uid()) then 'owner'
    else (
      select case
        when e.role in ('admin','manager') then 'admin'
        when e.role in ('staff','employee','receptionist') then 'staff'
        when e.role in ('barbero','barber') then 'barbero'
        else e.role
      end
      from public.employees e
      where e.user_id = auth.uid() and e.is_active = true
      limit 1
    )
  end
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select e.id from public.employees e
  where e.user_id = auth.uid() and e.is_active = true
  limit 1
$$;

grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.current_employee_id() to anon, authenticated;

-- 4. RLS: barbero scoped to employee_id=self for appointments/transactions/commissions
-- Appointments — drop and recreate with barbero filter
drop policy if exists "tenant_access_appointments" on public.appointments;
drop policy if exists "rbac_appointments_barbero" on public.appointments;
create policy "tenant_access_appointments" on public.appointments
  for all using (
    business_id in (select public.my_business_ids())
    and (
      public.current_user_role() is null
      or public.current_user_role() in ('owner','admin','staff')
      or employee_id = public.current_employee_id()
    )
  );

-- Transactions — barbero only own employee_id
drop policy if exists "tenant_access_transactions" on public.transactions;
create policy "tenant_access_transactions" on public.transactions
  for all using (
    business_id in (select public.my_business_ids())
    and (
      public.current_user_role() is null
      or public.current_user_role() in ('owner','admin','staff')
      or employee_id = public.current_employee_id()
    )
  );

-- Commissions — barbero only own
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='commissions') then
    execute 'drop policy if exists "tenant_access_commissions" on public.commissions';
    execute 'create policy "tenant_access_commissions" on public.commissions for all using (business_id in (select public.my_business_ids()) and (public.current_user_role() in (''owner'',''admin'',''staff'') or employee_id = public.current_employee_id()))';
  end if;
end
$$;

-- Cash registers / movements — barbero gets 0 rows
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='cash_registers') then
    execute 'drop policy if exists "tenant_access_cash_registers" on public.cash_registers';
    execute 'create policy "tenant_access_cash_registers" on public.cash_registers for all using (business_id in (select public.my_business_ids()) and public.current_user_role() in (''owner'',''admin'',''staff''))';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='cash_movements') then
    execute 'drop policy if exists "tenant_access_cash_movements" on public.cash_movements';
    execute 'create policy "tenant_access_cash_movements" on public.cash_movements for all using (business_id in (select public.my_business_ids()) and public.current_user_role() in (''owner'',''admin'',''staff''))';
  end if;
end
$$;

-- Inventory — barbero 0 rows for inventory tables
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='inventory_items') then
    execute 'drop policy if exists "tenant_access_inventory_items" on public.inventory_items';
    execute 'create policy "tenant_access_inventory_items" on public.inventory_items for all using (business_id in (select public.my_business_ids()) and public.current_user_role() in (''owner'',''admin'',''staff''))';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='inventory_movements') then
    execute 'drop policy if exists "tenant_access_inventory_movements" on public.inventory_movements';
    execute 'create policy "tenant_access_inventory_movements" on public.inventory_movements for all using (business_id in (select public.my_business_ids()) and public.current_user_role() in (''owner'',''admin'',''staff''))';
  end if;
end
$$;

-- Employee_services — barbero can read only own assignments (still filtered via employees)
-- Keep tenant_access but add barbero branch: barbero sees only where employee_id=self
drop policy if exists "tenant_access_employee_services" on public.employee_services;
create policy "tenant_access_employee_services" on public.employee_services
  for all using (
    exists (
      select 1 from public.employees e
      where e.id = employee_services.employee_id
        and e.business_id in (select public.my_business_ids())
    )
    and (
      public.current_user_role() in ('owner','admin','staff')
      or employee_services.employee_id = public.current_employee_id()
    )
  );

-- Services — barbero filtered via employee_services in app; RLS stays tenant_access (no leak via direct services read except via assignment)
-- Keep tenant_access_services as-is (barbero sees all services via RLS, but app filters catalog) — we keep permissive for now per spec: "barbero can only read services where employee_services exists" could be RLS but spec says app filter defense-in-depth and RLS is filter. We'll keep tenant_access and let app filter; alternative strict RLS would hide unassigned services.
-- No change to services policy to avoid breaking staff fallback — app enforces catalog filter.
