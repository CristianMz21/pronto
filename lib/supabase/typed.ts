import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types'
import { getSupabaseUrl } from './getUrl'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// Aliases matching task spec naming
export type Insert<T extends keyof Database['public']['Tables']> = TablesInsert<T>
export type Update<T extends keyof Database['public']['Tables']> = TablesUpdate<T>

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

export type TypedSupabaseClient = SupabaseClient<Database>

/**
 * Typed service client helper (bypasses RLS).
 * Reuses lib/supabase/service.ts logic but keeps Database generic explicit
 * for border validation and tests.
 */
export function createTypedServiceClient(): TypedSupabaseClient {
  const url = getSupabaseUrl()
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
  return createSupabaseClient<Database>(url, key, {
    global: {
      fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
