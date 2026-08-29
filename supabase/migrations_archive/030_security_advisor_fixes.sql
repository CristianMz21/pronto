-- Fix SECURITY DEFINER cross-tenant leak (mirrors SaaS migration 040) + harden search_path
CREATE OR REPLACE FUNCTION get_tx_ids_by_item_name(p_business_id uuid, p_query text)
RETURNS TABLE(id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  SELECT t.id FROM transactions t
  WHERE t.business_id = p_business_id AND t.status = 'completed'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.items) AS elem
                WHERE elem->>'name' ILIKE '%' || p_query || '%')
$$;

ALTER FUNCTION check_slot_availability() SET search_path = public;
ALTER FUNCTION update_client_stats() SET search_path = public;

-- Conditional: handle_new_user() only exists on installs where migration 005 found
-- a pre-existing function to patch. Guard against failing fresh installs where it
-- was never created.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
