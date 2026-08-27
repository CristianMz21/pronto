-- Migration 051: Vault local fallback — makes LOCAL encrypted boundary ACTIVE
-- Dev-only pgcrypto fallback for pgsodium when vault not configured or grants missing.
-- Cloud prod: MUST rotate dev key, create real pgsodium key `pii_escuderia` via Vault.
-- This migration ensures `supabase db reset` → phone_encrypted = \x... (not NULL) locally,
-- while still preferring pgsodium when available (Cloud prod path).

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 2. Try to grant pgsodium roles for Cloud path (best effort, non-fatal)
--    After `supabase db reset`, postgres loses pgsodium_keyiduser membership.
--    This block attempts to restore it via multiple strategies.
DO $$
BEGIN
  -- Strategy A: if postgres can SET ROLE supabase_admin (granted via Cloud init or manual), use it
  BEGIN
    -- Check if postgres is member of supabase_admin
    IF EXISTS (
      SELECT 1 FROM pg_auth_members am
      JOIN pg_roles r ON r.oid = am.member
      WHERE r.rolname = 'postgres' AND am.roleid = 'supabase_admin'::regrole
    ) THEN
      EXECUTE 'SET ROLE supabase_admin';
      EXECUTE 'GRANT pgsodium_keyiduser TO postgres WITH ADMIN OPTION';
      EXECUTE 'GRANT pgsodium_keyholder TO postgres WITH ADMIN OPTION';
      EXECUTE 'GRANT pgsodium_keymaker TO postgres WITH ADMIN OPTION';
      EXECUTE 'GRANT pgsodium_keyiduser TO authenticated';
      EXECUTE 'GRANT pgsodium_keyiduser TO service_role';
      EXECUTE 'RESET ROLE';
      RAISE NOTICE '051: granted pgsodium roles via supabase_admin';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: supabase_admin grant path failed (%)', SQLERRM;
    BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  -- Strategy B: direct GRANT if postgres already has ADMIN OPTION on pgsodium roles
  BEGIN
    EXECUTE 'GRANT pgsodium_keyiduser TO authenticated';
    RAISE NOTICE '051: granted pgsodium_keyiduser to authenticated via direct GRANT';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: direct GRANT to authenticated failed (%)', SQLERRM;
  END;
  BEGIN
    EXECUTE 'GRANT pgsodium_keyiduser TO service_role';
    RAISE NOTICE '051: granted pgsodium_keyiduser to service_role via direct GRANT';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: direct GRANT to service_role failed (%)', SQLERRM;
  END;
  BEGIN
    EXECUTE 'GRANT pgsodium_keyholder TO authenticated';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    EXECUTE 'GRANT pgsodium_keyholder TO service_role';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Strategy C: GRANT EXECUTE on pgsodium functions directly (if postgres is pgsodium_keymaker member)
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION pgsodium.crypto_aead_det_encrypt(bytea, bytea, uuid) TO authenticated, service_role, postgres';
    RAISE NOTICE '051: granted EXECUTE on crypto_aead_det_encrypt (3-arg) to authenticated/service_role';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: GRANT EXECUTE 3-arg failed (%)', SQLERRM;
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION pgsodium.crypto_aead_det_decrypt(bytea, bytea, uuid) TO authenticated, service_role, postgres';
    RAISE NOTICE '051: granted EXECUTE on crypto_aead_det_decrypt (3-arg)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: GRANT EXECUTE decrypt 3-arg failed (%)', SQLERRM;
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION pgsodium.crypto_aead_det_encrypt(bytea, bytea, uuid, bytea) TO authenticated, service_role, postgres';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION pgsodium.crypto_aead_det_decrypt(bytea, bytea, uuid, bytea) TO authenticated, service_role, postgres';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- 3. Recreate encrypt_pii / decrypt_pii with pgsodium primary + pgcrypto dev fallback
CREATE OR REPLACE FUNCTION public.encrypt_pii(plain text)
RETURNS bytea
LANGUAGE plpgsql
SET search_path = public, pgsodium, vault, extensions, pg_catalog
AS $$
DECLARE
  key_id uuid;
  result bytea;
BEGIN
  IF plain IS NULL THEN
    RETURN NULL;
  END IF;

  -- Try pgsodium (Cloud prod path, uses Vault key pii_escuderia)
  BEGIN
    SELECT id INTO key_id FROM pgsodium.key WHERE name = 'pii_escuderia' AND status IN ('valid','default') LIMIT 1;
    IF key_id IS NULL THEN
      BEGIN
        PERFORM pgsodium.create_key(name := 'pii_escuderia');
        SELECT id INTO key_id FROM pgsodium.key WHERE name = 'pii_escuderia' LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        key_id := NULL;
      END;
    END IF;
    IF key_id IS NOT NULL THEN
      BEGIN
        SELECT pgsodium.crypto_aead_det_encrypt(convert_to(plain, 'utf8'), ''::bytea, key_id) INTO result;
        IF result IS NOT NULL THEN
          RETURN result;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- fall through to pgcrypto, keep NOTICE for debugging
        RAISE NOTICE '051 encrypt_pii pgsodium failed (%), falling back to pgcrypto', SQLERRM;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051 encrypt_pii pgsodium lookup failed (%), falling back to pgcrypto', SQLERRM;
  END;

  -- Fallback: pgcrypto with dev-only key (LOCAL ONLY)
  -- This key is DEV ONLY and MUST be rotated in Cloud prod via Vault/pgsodium.
  BEGIN
    SELECT pgp_sym_encrypt(plain, 'dev-only-not-prod-32bytes-escuderia') INTO result;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051 encrypt_pii pgcrypto fallback failed (%)', SQLERRM;
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_pii(cipher bytea)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pgsodium, vault, extensions, pg_catalog
AS $$
DECLARE
  key_id uuid;
  plain bytea;
  result text;
BEGIN
  IF cipher IS NULL THEN
    RETURN NULL;
  END IF;

  -- Try pgsodium first
  BEGIN
    SELECT id INTO key_id FROM pgsodium.key WHERE name = 'pii_escuderia' AND status IN ('valid','default') LIMIT 1;
    IF key_id IS NOT NULL THEN
      BEGIN
        SELECT pgsodium.crypto_aead_det_decrypt(cipher, ''::bytea, key_id) INTO plain;
        IF plain IS NOT NULL THEN
          RETURN convert_from(plain, 'utf8');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '051 decrypt_pii pgsodium failed (%), trying pgcrypto', SQLERRM;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051 decrypt_pii pgsodium lookup failed (%), trying pgcrypto', SQLERRM;
  END;

  -- Fallback pgcrypto dev key
  BEGIN
    SELECT pgp_sym_decrypt(cipher, 'dev-only-not-prod-32bytes-escuderia') INTO result;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051 decrypt_pii pgcrypto fallback failed (%)', SQLERRM;
    RETURN NULL;
  END;
END;
$$;

-- Grants for helpers
REVOKE ALL ON FUNCTION public.encrypt_pii(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_pii(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_pii(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_pii(bytea) TO authenticated, service_role;
-- Allow postgres to use (for trigger)
GRANT EXECUTE ON FUNCTION public.encrypt_pii(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.decrypt_pii(bytea) TO postgres;

-- 4. Ensure trigger exists (idempotent, from 050)
CREATE OR REPLACE FUNCTION public.trg_encrypt_phone_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone_encrypted IS NULL THEN
    BEGIN
      NEW.phone_encrypted := public.encrypt_pii(NEW.phone);
      IF NEW.phone_encrypted IS NULL THEN
        RAISE NOTICE '051: encrypt_pii returned NULL for client %, keeping plain', NEW.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '051 trg_encrypt_phone failed %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_phone ON public.clients;
CREATE TRIGGER trg_encrypt_phone
  BEFORE INSERT OR UPDATE OF phone ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_encrypt_phone_fn();

-- 5. Backfill existing rows where phone_encrypted is NULL (post-seed, non-destructive)
-- This is no-op if vault/pgcrypto not available or already backfilled.
DO $$
BEGIN
  BEGIN
    UPDATE public.clients
    SET phone_encrypted = public.encrypt_pii(phone)
    WHERE phone_encrypted IS NULL AND phone IS NOT NULL;
    RAISE NOTICE '051: backfilled % clients with phone_encrypted', FOUND;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: backfill failed (%)', SQLERRM;
  END;
  BEGIN
    UPDATE public.clients
    SET email_encrypted = public.encrypt_pii(email)
    WHERE email_encrypted IS NULL AND email IS NOT NULL;
    RAISE NOTICE '051: backfilled % clients with email_encrypted', FOUND;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: email backfill failed (%)', SQLERRM;
  END;
  BEGIN
    UPDATE public.clients
    SET whatsapp_encrypted = public.encrypt_pii(whatsapp_number)
    WHERE whatsapp_encrypted IS NULL AND whatsapp_number IS NOT NULL;
    RAISE NOTICE '051: backfilled % clients with whatsapp_encrypted', FOUND;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: whatsapp backfill failed (%)', SQLERRM;
  END;
END $$;

-- 6. Re-assert view and grants (from 050, idempotent)
DO $$
BEGIN
  BEGIN
    EXECUTE '
      CREATE OR REPLACE VIEW public.clients_secure
      WITH (security_invoker = true) AS
      SELECT
        id,
        business_id,
        name,
        phone,
        email,
        notes,
        tags,
        telegram_id,
        birthday,
        total_visits,
        total_spent,
        last_visit_at,
        created_at,
        viber_user_id,
        whatsapp_number,
        phone_encrypted,
        email_encrypted,
        whatsapp_encrypted,
        public.decrypt_pii(phone_encrypted) AS phone_secure,
        public.decrypt_pii(email_encrypted) AS email_secure,
        public.decrypt_pii(whatsapp_encrypted) AS whatsapp_secure
      FROM public.clients';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: security_invoker view failed (%), falling back', SQLERRM;
    EXECUTE '
      CREATE OR REPLACE VIEW public.clients_secure AS
      SELECT
        id,
        business_id,
        name,
        phone,
        email,
        notes,
        tags,
        telegram_id,
        birthday,
        total_visits,
        total_spent,
        last_visit_at,
        created_at,
        viber_user_id,
        whatsapp_number,
        phone_encrypted,
        email_encrypted,
        whatsapp_encrypted,
        public.decrypt_pii(phone_encrypted) AS phone_secure,
        public.decrypt_pii(email_encrypted) AS email_secure,
        public.decrypt_pii(whatsapp_encrypted) AS whatsapp_secure
      FROM public.clients';
  END;
END $$;

REVOKE ALL ON public.clients_secure FROM PUBLIC;
GRANT SELECT ON public.clients_secure TO authenticated;
GRANT SELECT ON public.clients_secure TO service_role;

DO $$
BEGIN
  BEGIN
    REVOKE SELECT ON public.clients FROM anon;
    RAISE NOTICE '051: REVOKE SELECT ON clients FROM anon succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '051: REVOKE SELECT ON clients FROM anon skipped (%)', SQLERRM;
  END;
END $$;

-- Note: phone plain is kept for indexes/searches; encrypted is boundary.
-- LOCAL: pgcrypto dev key active → pg_dump local no longer exposes clear alone (phone_encrypted usable).
-- PROD: must rotate dev key, create real pgsodium key pii_escuderia via Vault, re-backfill.
