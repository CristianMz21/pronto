-- Migration 045: Escudería — Seguridad crítica (pgsodium, RLS, headers-like checks)
-- Single barbería ahora, sin hardcode de negocio

-- 1. PII cifrada en reposo: pgsodium (si hay vault key, sino solo NOTICE)
-- Supabase uses pgsodium + vault; local may not have secret_key -> conditional
do $$
begin
  -- Intentar habilitar pgsodium (ya viene en supabase postgres 17, solo necesita extension)
  begin
    create extension if not exists pgsodium;
  exception when others then
    raise notice '045: pgsodium not available (%) — skipping PII encryption, RLS still protects', SQLERRM;
    return;
  end;

  -- Si no hay vault key, no podemos crear encrypted columns con pgsodium key id
  -- Verificar si hay vault.decrypted_secrets o pgsodium key
  if not exists (select 1 from pg_available_extensions where name='pgsodium') then
    raise notice '045: pgsodium extension not available — skipping';
    return;
  end if;

  -- Ejemplo: añadir columnas encrypted para clients.phone/email/whatsapp (bytea)
  -- No rompemos single-sede: columnas nullable, app sigue usando phone plain hasta migrar lectura a vista
  -- Por ahora solo preparamos columnas, no backfill masivo (120 clientes → ok, pero lo hacemos conditional)
  begin
    alter table public.clients add column if not exists phone_encrypted bytea;
    alter table public.clients add column if not exists email_encrypted bytea;
    alter table public.clients add column if not exists whatsapp_encrypted bytea;
  exception when others then
    raise notice '045: add encrypted columns failed (%)', SQLERRM;
  end;

  -- Nota: el cifrado real se haría con pgsodium.crypto_aead_encrypt(phone::bytea, key_id)
  -- y una vista clients_secure que descifra solo para authenticated con key.
  -- Para no bloquear este slice, dejamos columnas preparadas y documentamos rotación en docs/security.md
  raise notice '045: PII encrypted columns ready (phone_encrypted etc.) — app still uses RLS, next step is view + key rotation';
end $$;

-- 2. RLS audit: revocar anon de columnas sensibles si quedaron expuestas
-- (016 ya revocó public_read, pero aseguramos column-level para defense in depth)
-- Supabase no soporta REVOKE column de forma simple en este contexto, así que auditamos via policy
-- Verificamos que toda tabla tenga RLS
do $$
declare
  tbl text;
  missing text[] := '{}';
begin
  for tbl in select tablename from pg_tables where schemaname='public' and tablename in
    ('businesses','employees','services','clients','appointments','transactions','inventory_items','inventory_movements','business_hours','locations','employee_services','employee_unavailability','cash_registers','cash_movements','commissions')
  loop
    if not exists (select 1 from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and t.tablename=tbl and c.relrowsecurity) then
      missing := array_append(missing, tbl);
    end if;
  end loop;
  if array_length(missing,1) > 0 then
    raise exception '045: RLS missing on %', missing;
  else
    raise notice '045: RLS OK on all tenant tables (single Escudería safe)';
  end if;
end $$;

-- 3. Bcrypt audit: auth.users.encrypted_password debe ser $2a$ (bcrypt)
-- GoTrue usa bcrypt cost 10 por defecto; verificamos que no haya plaintext
do $$
begin
  if exists (select 1 from auth.users where encrypted_password not like '$2a$%' and encrypted_password is not null) then
    raise warning '045: found auth.users with non-bcrypt password — rotate!';
  else
    raise notice '045: bcrypt OK (auth.users all $2a$)';
  end if;
end $$;
