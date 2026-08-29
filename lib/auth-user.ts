import { headers } from 'next/headers'
import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

export type AuthUser = { id: string; email: string | null }

// middleware.ts already calls supabase.auth.getUser() once per request (to decide
// redirects) and forwards the validated id/email via x-user-id/x-user-email —
// same mechanism as x-pathname. Reading those headers here avoids every
// dashboard page repeating that round-trip to the Supabase auth server.
// requestHeaders.set() in middleware.ts always overwrites these, so a client
// can't spoof them by sending its own X-User-Id.
//
// Falls back to a real getUser() call if the headers are absent — e.g. a
// request that reaches a Server Component without going through middleware.ts.
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const headersList = await headers()

  if (headersList.has('x-user-id')) {
    const id = headersList.get('x-user-id')
    if (!id) return null
    return { id, email: headersList.get('x-user-email') || null }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { id: user.id, email: user.email ?? null } : null
})
