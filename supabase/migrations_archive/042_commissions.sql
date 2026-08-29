-- Migration 042: commissions — comisiones por barbero
-- Soporta porcentual, fija, por servicio y por producto

create table if not exists public.commissions (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  service_id     uuid references public.services(id) on delete set null,
  amount         numeric(10,2) not null check (amount >= 0),
  rate_snapshot  numeric(5,2), -- ej 50.00 = 50% (snapshot al momento de la venta)
  type           text not null check (type in ('percentage','fixed','per_service','per_product')),
  created_at     timestamptz not null default now()
);

create index if not exists idx_commissions_business on public.commissions(business_id);
create index if not exists idx_commissions_employee on public.commissions(employee_id);
create index if not exists idx_commissions_transaction on public.commissions(transaction_id);
create index if not exists idx_commissions_created_at on public.commissions(business_id, created_at desc);

grant all on table public.commissions to anon, authenticated;
alter table public.commissions enable row level security;
drop policy if exists "tenant_access_commissions" on public.commissions;
create policy "tenant_access_commissions" on public.commissions
  for all using (business_id in (select public.my_business_ids()));

-- Validar que employee y transaction pertenecen al mismo business
create or replace function public.check_commission_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  emp_biz uuid;
  tx_biz  uuid;
begin
  select business_id into emp_biz from public.employees where id = new.employee_id;
  select business_id into tx_biz  from public.transactions where id = new.transaction_id;
  if emp_biz is null or tx_biz is null or emp_biz != tx_biz or emp_biz != new.business_id then
    raise exception 'commission tenant mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_commission_tenant on public.commissions;
create trigger trg_check_commission_tenant
  before insert or update on public.commissions
  for each row execute procedure public.check_commission_tenant();
