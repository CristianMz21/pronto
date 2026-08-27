import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getSupabaseUrl } from './getUrl'

// Bypasses RLS — use only server-side for trusted operations
export function createServiceClient() {
  return createSupabaseClient<Database>(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  )
}
