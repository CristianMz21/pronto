import { randomUUID } from 'node:crypto'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

import { isSuperAdmin } from '@/lib/auth/roles'
import type { Database } from '@/lib/supabase/database.types'
import { getSupabaseUrl } from '@/lib/supabase/getUrl'
import { createClient } from '@/lib/supabase/server'

async function ensureSuperAdmin(): Promise<
  { user: { email?: string | null } } | { error: NextResponse }
> {
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
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { user }
}

async function fetchPendingApp(admin: ReturnType<typeof createAdminClient<Database>>, id: string) {
  const { data: app } = await admin
    .from('barbershop_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!app || app.status !== 'pending') return null
  return app
}

function resolvePlan(requestedPlan: string | null | undefined): string {
  const allowed = new Set(['free', 'starter', 'pro', 'agency'])
  const plan = requestedPlan ?? 'starter'
  return allowed.has(plan) ? plan : 'starter'
}

async function findOrCreateOwner(
  admin: ReturnType<typeof createAdminClient<Database>>,
  email: string,
  businessName: string,
  plan: string,
): Promise<string | null> {
  try {
    const { data: list } = await admin.auth.admin.listUsers()
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { business_name: businessName, requested_plan: plan },
    })
    if (!createErr && created?.user) return created.user.id
    if (createErr) {
      // eslint-disable-next-line no-console
      console.error('[approve] createUser failed', createErr.message)
    }
  } catch {}
  return null
}

function buildBaseSlug(businessName: string): string {
  return (
    businessName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'barberia'
  )
}

async function generateUniqueSlug(
  admin: ReturnType<typeof createAdminClient<Database>>,
  baseSlug: string,
): Promise<string> {
  let slug = baseSlug
  let attempt = 0
  while (true) {
    const { data: existing } = await admin
      .from('businesses')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!existing) return slug
    attempt++
    slug = `${baseSlug}-${attempt}`
  }
}

async function createBusinessForOwner(
  admin: ReturnType<typeof createAdminClient<Database>>,
  ownerId: string,
  businessName: string,
  slug: string,
  plan: string,
  licenseKey: string,
): Promise<{ biz: { id: string } | null; error?: string }> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
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
  if (bizErr) return { biz: null, error: bizErr.message }
  return { biz: biz as { id: string } | null }
}

async function finalizeBusinessSetup(
  admin: ReturnType<typeof createAdminClient<Database>>,
  bizId: string,
  email: string,
): Promise<void> {
  try {
    const { insertOwnerAsEmployee } = await import('@/lib/create-business')
    await insertOwnerAsEmployee(
      admin as unknown as Parameters<typeof insertOwnerAsEmployee>[0],
      bizId,
      { email } as unknown as Parameters<typeof insertOwnerAsEmployee>[2],
    )
  } catch {}
  try {
    await admin.auth.admin.generateLink({ type: 'magiclink', email })
  } catch {}
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await ensureSuperAdmin()
  if ('error' in auth) return auth.error

  const admin = createAdminClient<Database>(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const app = await fetchPendingApp(admin, id)
  if (!app) return NextResponse.json({ error: 'not_pending' }, { status: 400 })

  const licenseKey = randomUUID()
  const { error: updErr } = await admin
    .from('barbershop_applications')
    .update({ status: 'approved', license_key: licenseKey })
    .eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const email = app.email as string
  const businessName = app.business_name as string
  const plan = resolvePlan(app.requested_plan as string | null)
  const ownerId = await findOrCreateOwner(admin, email, businessName, plan)
  if (!ownerId) return NextResponse.json({ license_key: licenseKey, message: 'Aprobado' })

  const baseSlug = buildBaseSlug(businessName)
  const slug = await generateUniqueSlug(admin, baseSlug)
  const { biz, error: bizErrMsg } = await createBusinessForOwner(
    admin,
    ownerId,
    businessName,
    slug,
    plan,
    licenseKey,
  )
  if (!biz) {
    if (bizErrMsg)
      return NextResponse.json({ license_key: licenseKey, warning: bizErrMsg }, { status: 201 })
    return NextResponse.json({ license_key: licenseKey, message: 'Aprobado' })
  }
  await finalizeBusinessSetup(admin, biz.id, email)
  return NextResponse.json({ license_key: licenseKey, message: 'Aprobado' })
}
