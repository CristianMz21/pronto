-- Migration 050: PII encryption boundary (vault-aware, RLS-only fallback)
-- Vault local: real pgsodium encryption without breaking `supabase db reset`.
-- If vault not configured, functions return NULL with NOTICE, trigger is no-op.
-- Phone clear text is kept for indexes/searches (dual-write), phone_encrypted is future boundary.
-- View clients_secure exposes decrypt_pii(phone_encrypted) only to authenticated.

-- 1. Ensure pgsodium extension (045 already did, idempotent)
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Ensure encrypted columns exist (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_encrypted bytea;
    ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email_encrypted bytea;
    ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS whatsapp_encrypted bytea;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '050: add encrypted columns failed (%)', SQLERRM;
  END;
END $$;

-- 2. encrypt_pii / decrypt_pii helpers
-- Uses pgsodium.crypto_aead_det_encrypt/decrypt with key stored in pgsodium.key (name pii_escuderia)
-- If vault/key not available, returns NULL with NOTICE (RLS-only mode)

CREATE OR REPLACE FUNCTION public.encrypt_pii(plain text)
RETURNS bytea
LANGUAGE plpgsql
SET search_path = public, pgsodium
AS $$
DECLARE
  key_id uuid;
  result bytea;
BEGIN
  IF plain IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    SELECT id INTO key_id FROM pgsodium.key WHERE name = 'pii_escuderia' AND status IN ('valid','default') LIMIT 1;
    IF key_id IS NULL THEN
      BEGIN
        PERFORM pgsodium.create_key(name := 'pii_escuderia');
        SELECT id INTO key_id FROM pgsodium.key WHERE name = 'pii_escuderia' LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md (create_key failed: %)', SQLERRM;
        RETURN NULL;
      END;
    END IF;
    IF key_id IS NULL THEN
      RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md';
      RETURN NULL;
    END IF;
    -- Deterministic encryption for searchable phone (additional data empty)
    SELECT pgsodium.crypto_aead_det_encrypt(convert_to(plain, 'utf8'), ''::bytea, key_id) INTO result;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md (encrypt failed: %)', SQLERRM;
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_pii(cipher bytea)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pgsodium
AS $$
DECLARE
  key_id uuid;
  plain bytea;
BEGIN
  IF cipher IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    SELECT id INTO key_id FROM pgsodium.key WHERE name = 'pii_escuderia' AND status IN ('valid','default') LIMIT 1;
    IF key_id IS NULL THEN
      RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md';
      RETURN NULL;
    END IF;
    SELECT pgsodium.crypto_aead_det_decrypt(cipher, ''::bytea, key_id) INTO plain;
    RETURN convert_from(plain, 'utf8');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md (decrypt failed: %)', SQLERRM;
    RETURN NULL;
  END;
END;
$$;

-- Grants: allow authenticated/service_role to execute (anon should not decrypt)
REVOKE ALL ON FUNCTION public.encrypt_pii(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_pii(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_pii(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_pii(bytea) TO authenticated, service_role;

-- 3. Trigger: dual-write phone -> phone_encrypted (keep plain for indexes)
CREATE OR REPLACE FUNCTION public.trg_encrypt_phone_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only encrypt when we have plain phone and no encrypted value yet (dual-write, don't delete plain)
  -- phone clear is kept for indexes/searches; phone_encrypted is future boundary
  IF NEW.phone IS NOT NULL AND NEW.phone_encrypted IS NULL THEN
    BEGIN
      NEW.phone_encrypted := public.encrypt_pii(NEW.phone);
      IF NEW.phone_encrypted IS NULL THEN
        RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md (trigger no-op for client %)', NEW.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Vault not configured — using RLS-only mode, see docs/security.md (trigger encrypt failed: %)', SQLERRM;
      -- don't fail INSERT/UPDATE, keep plain phone
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_phone ON public.clients;
CREATE TRIGGER trg_encrypt_phone
  BEFORE INSERT OR UPDATE OF phone ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_encrypt_phone_fn();

-- 4. View clients_secure: exposes decrypted phone only to authenticated
-- Use security_invoker where available (PG15+), fallback to plain view
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
    RAISE NOTICE '050: security_invoker view failed (%), falling back to plain view', SQLERRM;
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

-- Grants for view
REVOKE ALL ON public.clients_secure FROM PUBLIC;
GRANT SELECT ON public.clients_secure TO authenticated;
-- service_role can also read if needed
GRANT SELECT ON public.clients_secure TO service_role;

-- Ensure anon cannot read raw clients (048 already did, re-affirm idempotent)
DO $$
BEGIN
  BEGIN
    REVOKE SELECT ON public.clients FROM anon;
    RAISE NOTICE '050: REVOKE SELECT ON clients FROM anon succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '050: REVOKE SELECT ON clients FROM anon skipped (%)', SQLERRM;
  END;
END $$;

-- Note: phone plain is kept for indexes/searches; encrypted is boundary future.
-- Backfill for existing rows will happen lazily via trigger on next UPDATE or via manual batch if vault configured.
