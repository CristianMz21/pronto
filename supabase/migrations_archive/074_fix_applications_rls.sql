-- Fix RLS for barbershop_applications: anon must be able to INSERT pending, super_admin to manage
drop policy if exists super_admin_all_applications on barbershop_applications;

-- Allow anon and authenticated to insert pending applications (public apply form)
drop policy if exists allow_anon_insert_pending on barbershop_applications;
create policy allow_anon_insert_pending on barbershop_applications for insert
  with check (status = 'pending');

-- Super admin can do everything (select/update/delete) via JWT claims, no direct auth.users select
drop policy if exists super_admin_all on barbershop_applications;
create policy super_admin_all on barbershop_applications for all
  using (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    or auth.email() = any(string_to_array(coalesce(current_setting('app.super_admins', true), ''), ','))
  )
  with check (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    or auth.email() = any(string_to_array(coalesce(current_setting('app.super_admins', true), ''), ','))
  );

-- Ensure anon can insert
grant insert on table barbershop_applications to anon, authenticated;
grant select, update, delete on table barbershop_applications to authenticated;
-- service_role bypasses RLS anyway
