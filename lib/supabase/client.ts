import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

function getCookieName(): string {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const hostname = new URL(url).hostname
    // Use first label of hostname (supabase-js default) but WITHOUT
    // Docker translation — browser always sees 127.0.0.1, server would
    // see host.docker.internal if translated → mismatch → 401
    return `sb-${hostname.split('.')[0]}-auth-token`
  } catch {
    return 'sb-127-auth-token'
  }
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: getCookieName() },
    }
  )
}
