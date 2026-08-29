import { randomUUID } from 'crypto'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { isSuperAdmin } from '@/lib/auth/roles'
import { getSupabaseUrl } from '@/lib/supabase/getUrl'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (
    !user ||
    !isSuperAdmin(
      user as unknown as { email?: string | null; user_metadata?: Record<string, unknown> | null },
    )
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient(getSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: app } = await admin
    .from('barbershop_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!app || (app as { status: string }).status !== 'pending') {
    return NextResponse.json({ error: 'not_pending' }, { status: 400 })
  }

  const licenseKey = randomUUID()
  const { error: updErr } = await admin
    .from('barbershop_applications')
    .update({ status: 'approved', license_key: licenseKey })
    .eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const email = (app as { email: string; business_name: string; requested_plan?: string | null })
    .email
  const businessName = (app as { business_name: string }).business_name
  const requestedPlan = ((app as { requested_plan?: string | null }).requested_plan ??
    'starter') as string
  const allowedPlans = new Set(['free', 'starter', 'pro', 'agency'])
  const plan = allowedPlans.has(requestedPlan) ? requestedPlan : 'starter'

  // Try to find or create auth user for owner
  let ownerId: string | null = null
  try {
    // List users to find by email (service_role)
    const { data: list } = await admin.auth.admin.listUsers()
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) {
      ownerId = found.id
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { business_name: businessName, requested_plan: plan },
      })
      if (!createErr && created?.user) ownerId = created.user.id
      else if (createErr) console.warn('[approve] createUser failed', createErr.message)
    }
  } catch (e) {
    console.warn('[approve] auth lookup failed', e)
  }

  if (ownerId) {
    // Generate unique slug
    const baseSlug =
      businessName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'barberia'
    let slug = baseSlug
    let attempt = 0
    while (true) {
      const { data: existing } = await admin
        .from('businesses')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!existing) break
      attempt++
      slug = `${baseSlug}-${attempt}`
    }
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30d trial
    const { data: biz, error: bizErr } = await admin
      .from('businesses')
      .insert({
        owner_id: ownerId,
        name: businessName,
        slug,
        plan,
        license_key: licenseKey,
        license_status: 'active',
        license_expires_at: expiresAt,
      })
      .select('id')
      .single()
    if (bizErr) {
      console.warn('[approve] business insert failed', bizErr.message)
      return NextResponse.json(
        { license_key: licenseKey, warning: bizErr.message },
        { status: 201 },
      )
    }
    if (biz) {
      try {
        const { insertOwnerAsEmployee } = await import('@/lib/create-business')
        await insertOwnerAsEmployee(
          admin as unknown as Parameters<typeof insertOwnerAsEmployee>[0],
          (biz as { id: string }).id,
          { email } as unknown as Parameters<typeof insertOwnerAsEmployee>[2],
        )
      } catch {}
      // Send magic link for password set
      try {
        await admin.auth.admin.generateLink({ type: 'magiclink', email })
      } catch {}
    }
  }

  return NextResponse.json({ license_key: licenseKey, message: 'Aprobado' })
}
