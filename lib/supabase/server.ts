import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';
import type { Database } from './database.types'
import { getSupabaseUrl } from './getUrl'

// In SaaS mode, cookies must be shared across *.trypronto.app subdomains
// so that a user authenticated on trypronto.app can access their subdomain dashboard.
function cookieDomain(): string | undefined {
  if (
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'saas' &&
    process.env.NEXT_PUBLIC_ROOT_DOMAIN
  ) {
    return `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
  }
  return undefined
}

function getCookieName(): string {
  try {
    // Use ORIGINAL env URL (127.0.0.1) not the Docker-translated one
    // — otherwise browser (sb-127) vs server (sb-host) mismatch → no refresh → 401
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const hostname = new URL(url).hostname
    return `sb-${hostname.split('.')[0]}-auth-token`
  } catch {
    return 'sb-127-auth-token'
  }
}

export async function createClient() {
  const cookieStore = await cookies()
  const domain = cookieDomain()

  return createServerClient<Database>(
    getSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: getCookieName() },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...(domain ? { domain } : {}) })
            )
          } catch {
            // Server Component — cookies set by middleware
          }
        },
      },
    }
  )
}
