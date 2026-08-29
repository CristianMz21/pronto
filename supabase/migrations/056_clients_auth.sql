-- Migration 056: clients auth linkage + RLS for client portal
-- Links clients to auth.users for registered client portal, keeps guest compatibility (user_id null)
-- Adds unique indexes per business for user and email, and RLS policies for client self-access

-- 1. Add user_id linkage
alter table public.clients
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Ensure whatsapp_number column exists (migration may have added via other path)
do $$
begin
  begin
    alter table public.clients add column if not exists whatsapp_number text;
  exception when others then null;
  end;
end $$;

-- 2. Unique indexes per business
-- One registered user can have at most one client record per business
create unique index if not exists unique_client_user_per_business
  on public.clients (business_id, user_id)
  where user_id is not null;

-- One email per business (when email present) — prevents duplicate client records
create unique index if not exists unique_client_email_per_business
  on public.clients (business_id, email)
  where email is not null;

-- 3. Index for lookup by user_id
create index if not exists idx_clients_user_id on public.clients (user_id) where user_id is not null;

-- 4. RLS policies for client self-access
-- Allow a logged-in client to read/update only their own client row
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='client_self_select') then
    create policy "client_self_select" on public.clients
      for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='client_self_update') then
    create policy "client_self_update" on public.clients
      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- Appointments: client can see only their own appointments
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='client_self_select_appointments') then
    create policy "client_self_select_appointments" on public.appointments
      for select using (
        client_id in (select id from public.clients where user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='client_self_update_appointments') then
    create policy "client_self_update_appointments" on public.appointments
      for update using (
        client_id in (select id from public.clients where user_id = auth.uid())
      ) with check (
        client_id in (select id from public.clients where user_id = auth.uid())
      );
  end if;
end $$;

-- Transactions: client can see only their own transactions
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='client_self_select_transactions') then
    create policy "client_self_select_transactions" on public.transactions
      for select using (
        client_id in (select id from public.clients where user_id = auth.uid())
      );
  end if;
end $$;

-- Businesses: client can read business where they are a registered client (for portal header)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='businesses' and policyname='client_can_read_own_business') then
    create policy "client_can_read_own_business" on public.businesses
      for select using (
        id in (select business_id from public.clients where user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='services' and policyname='client_can_read_services') then
    create policy "client_can_read_services" on public.services
      for select using (
        business_id in (select business_id from public.clients where user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='employees' and policyname='client_can_read_employees') then
    create policy "client_can_read_employees" on public.employees
      for select using (
        business_id in (select business_id from public.clients where user_id = auth.uid())
      );
  end if;
end $$;

-- Ensure RLS still enabled (already enabled in 001, but ensure)
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.transactions enable row level security;
alter table public.businesses enable row level security;

comment on column public.clients.user_id is 'Linked auth.users id for registered client portal; null = guest (invitado)';
