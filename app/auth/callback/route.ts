import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { getAdminSecretPath } from '@/lib/admin-secret'
import { insertOwnerAsEmployee } from '@/lib/create-business'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'

async function handlePasswordReset(next: string, origin: string): Promise<NextResponse | null> {
  if (next !== '/reset-password') return null
  return NextResponse.redirect(`${origin}/reset-password`)
}

async function findExistingBusiness(
  admin: ReturnType<typeof createAdminClient<Database>>,
  userId: string,
) {
  const { data: existing } = await admin
    .from('businesses')
    .select('id, onboarding_completed')
    .eq('owner_id', userId)
    .maybeSingle()
  return existing as { id: string; onboarding_completed: boolean | null } | null
}

function getBusinessNameFromUser(user: {
  user_metadata?: Record<string, unknown>
  email?: string | null
}): string {
  return (
    (user.user_metadata?.business_name as string) ||
    (user.user_metadata?.full_name as string) ||
    (user.email?.split('@')[0] ?? 'My Business')
  )
}

async function generateUniqueSlug(
  admin: ReturnType<typeof createAdminClient<Database>>,
  baseSlug: string,
): Promise<string> {
  let slug = baseSlug
  let attempt = 0
  while (true) {
    const { data: taken } = await admin
      .from('businesses')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!taken) return slug
    attempt++
    slug = `${baseSlug}-${attempt}`
  }
}

async function createNewBusiness(
  admin: ReturnType<typeof createAdminClient<Database>>,
  user: { id: string; user_metadata?: Record<string, unknown>; email?: string | null },
): Promise<{ id: string } | null> {
  const businessName = getBusinessNameFromUser(user)
  const baseSlug = slugify(businessName)
  const slug = await generateUniqueSlug(admin, baseSlug)
  const { data: newBusiness } = await admin
    .from('businesses')
    .insert({ owner_id: user.id, name: businessName, slug })
    .select('id')
    .single()
  if (!newBusiness) return null
  await insertOwnerAsEmployee(
    admin,
    newBusiness.id,
    user as unknown as Parameters<typeof insertOwnerAsEmployee>[1],
  )
  return newBusiness as { id: string }
}

function resolveNextPath(next: string, secret: string): string {
  if (next.startsWith(secret) || !next.startsWith('/')) return next
  const needsSecret =
    next.startsWith('/dashboard') ||
    next.startsWith('/pos') ||
    next.startsWith('/caja') ||
    next.startsWith('/crm') ||
    next.startsWith('/onboarding') ||
    next.startsWith('/inventory') ||
    next.startsWith('/booking') ||
    next.startsWith('/settings')
  if (!needsSecret) return next
  return `${secret}${next}`
}

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url)
  const origin = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? `${getAdminSecretPath()}/dashboard`

  if (!code)
    return NextResponse.redirect(
      `${origin}${getAdminSecretPath()}/login?error=Authentication+failed`,
    )

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user)
    return NextResponse.redirect(
      `${origin}${getAdminSecretPath()}/login?error=Authentication+failed`,
    )

  const resetRes = await handlePasswordReset(next, origin)
  if (resetRes) return resetRes

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const existing = await findExistingBusiness(admin, data.user.id)

  if (!existing) {
    await createNewBusiness(
      admin,
      data.user as { id: string; user_metadata?: Record<string, unknown>; email?: string | null },
    )
    return NextResponse.redirect(`${origin}${getAdminSecretPath()}/onboarding`)
  }

  if (!existing.onboarding_completed)
    return NextResponse.redirect(`${origin}${getAdminSecretPath()}/onboarding`)

  const resolvedNext = resolveNextPath(next, getAdminSecretPath())
  return NextResponse.redirect(`${origin}${resolvedNext}`)
}
