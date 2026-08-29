alter table transactions add column if not exists tip_amount integer not null default 0 check (tip_amount >=0);

create table if not exists public.tips (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  amount integer not null check (amount>0),
  method text not null default 'cash' check (method in ('cash','card','transfer','digital')),
  created_at timestamptz not null default now()
);
alter table tips enable row level security;
drop policy if exists tenant_access_tips on tips;
create policy tenant_access_tips on tips for all using (business_id in (select my_business_ids()));
create index if not exists idx_tips_transaction on tips(transaction_id);
create index if not exists idx_tips_employee on tips(employee_id);
grant all on table tips to anon, authenticated;
