-- Migration 079: advisory lock helper for membership consume + promo stack guard notes
-- Provides SECURITY DEFINER function that uses pg_advisory_xact_lock to prevent double consume race
-- Idempotent via CREATE OR REPLACE, search_path locked, grants explicit

create or replace function public.consume_membership(p_client_membership_id uuid)
returns public.client_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.client_memberships%rowtype;
begin
  -- Advisory lock on the specific membership row (transaction-scoped)
  perform pg_advisory_xact_lock(hashtext(p_client_membership_id::text));

  update public.client_memberships
    set remaining = remaining - 1
    where id = p_client_membership_id
      and status = 'active'
      and expires_at > now()
      and remaining > 0
    returning * into v_row;

  if not found then
    -- Check reason for better error mapping
    perform 1 from public.client_memberships where id = p_client_membership_id and status <> 'active';
    if found then
      raise exception 'membership_expired' using errcode = '45000';
    end if;
    perform 1 from public.client_memberships where id = p_client_membership_id and expires_at <= now();
    if found then
      raise exception 'membership_expired' using errcode = '45000';
    end if;
    perform 1 from public.client_memberships where id = p_client_membership_id and remaining <= 0;
    if found then
      raise exception 'membership_no_uses_left' using errcode = '45000';
    end if;
    raise exception 'membership_not_found' using errcode = '45000';
  end if;

  -- Auto-expire if remaining hits zero (optional, keep active with 0 remaining until explicitly expired)
  if v_row.remaining = 0 then
    update public.client_memberships set status = 'expired' where id = p_client_membership_id;
    v_row.status := 'expired';
  end if;

  return v_row;
end;
$$;

revoke all on function public.consume_membership(uuid) from public;
grant execute on function public.consume_membership(uuid) to anon, authenticated, service_role;

-- Loyalty helpers: earn/redeem with balance check, also advisory-locked on client_id
create or replace function public.loyalty_redeem(
  p_business_id uuid,
  p_client_id uuid,
  p_points integer,
  p_reference text default null
)
returns public.loyalty_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer;
  v_account public.loyalty_accounts%rowtype;
begin
  if p_points <= 0 then
    raise exception 'invalid_points' using errcode = '45000';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_client_id::text));

  select points into v_points from public.loyalty_accounts where client_id = p_client_id for update;
  if not found then
    raise exception 'insufficient_points' using errcode = '45000';
  end if;
  if v_points < p_points then
    raise exception 'insufficient_points' using errcode = '45000';
  end if;

  update public.loyalty_accounts set points = points - p_points, updated_at = now() where client_id = p_client_id returning * into v_account;
  insert into public.loyalty_movements (business_id, client_id, type, points, reference)
  values (p_business_id, p_client_id, 'redeem', -p_points, p_reference);

  return v_account;
end;
$$;

revoke all on function public.loyalty_redeem(uuid, uuid, integer, text) from public;
grant execute on function public.loyalty_redeem(uuid, uuid, integer, text) to anon, authenticated, service_role;

create or replace function public.loyalty_earn(
  p_business_id uuid,
  p_client_id uuid,
  p_points integer,
  p_reference text default null
)
returns public.loyalty_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.loyalty_accounts%rowtype;
begin
  if p_points <= 0 then
    raise exception 'invalid_points' using errcode = '45000';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_client_id::text));

  insert into public.loyalty_accounts (client_id, business_id, points)
  values (p_client_id, p_business_id, p_points)
  on conflict (client_id) do update set points = loyalty_accounts.points + excluded.points, updated_at = now()
  returning * into v_account;

  insert into public.loyalty_movements (business_id, client_id, type, points, reference)
  values (p_business_id, p_client_id, 'earn', p_points, p_reference);

  return v_account;
end;
$$;

revoke all on function public.loyalty_earn(uuid, uuid, integer, text) from public;
grant execute on function public.loyalty_earn(uuid, uuid, integer, text) to anon, authenticated, service_role;
