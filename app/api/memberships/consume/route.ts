import { NextResponse } from 'next/server'
import { z } from 'zod'

import { consumeMembership } from '@/lib/memberships'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const BodySchema = z.object({
  client_membership_id: z.string().uuid(),
})

async function resolveBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase
    .from('employees')
    .select('business_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`memberships-consume:${ip}`, { limit: 120, windowMs: 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  // Verify ownership (tenant guard)
  const { data: cm } = await supabase
    .from('client_memberships')
    .select('id, business_id')
    .eq('id', parsed.data.client_membership_id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!cm) return NextResponse.json({ error: 'membership_not_found' }, { status: 404 })

  try {
    const updated = await consumeMembership(
      supabase as unknown as Parameters<typeof consumeMembership>[0],
      parsed.data.client_membership_id,
    )
    return NextResponse.json(updated)
  } catch (e) {
    const err = e as Error & { code?: string }
    if (err.code === 'no_uses_left')
      return NextResponse.json(
        { error: 'no_uses_left', message: 'Membresía sin usos restantes' },
        { status: 409 },
      )
    if (err.code === 'membership_expired')
      return NextResponse.json(
        { error: 'membership_expired', message: 'Membresía expirada' },
        { status: 409 },
      )
    if (err.code === 'membership_not_found')
      return NextResponse.json({ error: 'membership_not_found' }, { status: 404 })
    return NextResponse.json({ error: err.message ?? 'consume_failed' }, { status: 500 })
  }
}
