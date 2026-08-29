create table if not exists public.barbershop_applications (
  id uuid primary key default uuid_generate_v4(),
  business_name text not null,
  owner_name text not null,
  email text not null,
  phone text,
  nit text,
  city text,
  requested_plan text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  license_key uuid unique,
  created_at timestamptz not null default now()
);
alter table businesses add column if not exists license_key uuid unique;
alter table businesses add column if not exists license_status text not null default 'pending' check (license_status in ('pending','active','suspended','revoked'));
alter table businesses add column if not exists license_expires_at timestamptz;

alter table barbershop_applications enable row level security;
drop policy if exists super_admin_all_applications on barbershop_applications;
create policy super_admin_all_applications on barbershop_applications for all using (
  exists (select 1 from auth.users where auth.users.id = auth.uid() and auth.users.raw_user_meta_data->>'role' = 'super_admin')
  or auth.email() in (select unnest(string_to_array(current_setting('app.super_admins', true), ',')))
);
-- Fallback: allow service_role to manage via API (bypass RLS)
grant all on table barbershop_applications to anon, authenticated;
create index if not exists idx_applications_status on barbershop_applications(status) where status='pending';
