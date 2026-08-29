-- Migration 048: RLS audit hardening + businesses_public view (fixes 045 partial)
-- 1. RLS audit must run independently of pgsodium and fail reset if any core table lacks RLS.
-- 2. Expose safe view for anon without secrets; revoke direct businesses access from anon.

-- 1. RLS audit — always runs, raises EXCEPTION if missing (blocks supabase db reset)
do $$
declare
  tbl text;
  missing text[] := '{}';
  has_rls boolean;
begin
  for tbl in select unnest(array['businesses','employees','services','clients','appointments','transactions','inventory_items','inventory_movements','business_hours','locations','employee_services','employee_unavailability','cash_registers','cash_movements','commissions'])
  loop
    select c.relrowsecurity into has_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = tbl;

    if has_rls is null then
      missing := array_append(missing, tbl || '(not found)');
    elsif has_rls = false then
      missing := array_append(missing, tbl);
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception '048: RLS missing on % — failing migration to protect multi-tenant isolation', missing;
  else
    raise notice '048: RLS OK on all tenant tables (independent audit passed)';
  end if;
end $$;

-- 2. View businesses_public — only columns needed for public booking/landing, no secrets
-- Secrets excluded: smtp_pass, smtp_user, smtp_host, smtp_from, resend_api_key,
-- telegram_bot_token, viber_bot_token, telegram_chat_id, viber_chat_id, ls_*,
-- meta_whatsapp_access_token, meta_whatsapp_phone_number_id, wa_template_*, email_provider
drop view if exists public.businesses_public cascade;
create view public.businesses_public as
select
  id,
  name,
  slug,
  type,
  phone,
  address,
  timezone,
  currency,
  brand_color,
  enabled_modules,
  notification_language
from public.businesses;

-- Grants: anon and authenticated can read public view
grant select on public.businesses_public to anon, authenticated;

-- Revoke direct anon access to businesses table (contains secrets)
-- App uses service_role for /escuderia and /book (no anon direct), and authenticated via RLS for dashboard.
-- If this breaks anon booking that relied on RLS, use view instead.
revoke select on public.businesses from anon;

-- Attempt column-level revoke for defense in depth where supported;
-- Postgres allows REVOKE SELECT (col) but Supabase roles may not have it granted explicitly.
-- We use DO block to avoid failing migration if column revoke not supported in this context.
do $$
begin
  begin
    revoke select (smtp_pass, resend_api_key, telegram_bot_token, viber_bot_token, meta_whatsapp_access_token) on public.businesses from anon;
    raise notice '048: column-level REVOKE on secrets succeeded';
  exception when others then
    raise notice '048: column-level REVOKE not applied (%), view + table revoke still protects', SQLERRM;
  end;
  begin
    revoke select (smtp_pass, resend_api_key, telegram_bot_token, viber_bot_token, meta_whatsapp_access_token) on public.businesses from authenticated;
    -- re-grant authenticated via RLS is still needed, but secrets should not be selectable;
    -- since authenticated needs some business fields for dashboard, we keep table grant but
    -- rely on view + RLS + app not selecting secrets. Re-grant to keep authenticated working.
    grant select on public.businesses to authenticated;
    raise notice '048: attempted column revoke for authenticated (fallback to view for anon)';
  exception when others then
    raise notice '048: authenticated column revoke skipped (%)', SQLERRM;
  end;
end $$;

-- Note: pgsodium remains PARTIAL — columns phone_encrypted etc exist (045),
-- but real crypto_aead_encrypt requires vault key (Supabase Cloud).
-- See docs/security.md and specs/004-escuderia-security/spec.md SC-002.
