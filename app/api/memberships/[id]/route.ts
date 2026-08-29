import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { MembershipSchema } from '@/lib/memberships'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

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

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const ip = getIp(req)
  if (!rateLimit(`memberships-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const id = params.id
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const schema = MembershipSchema.partial()
  const parsed = schema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  const b = parsed.data
  const payload: Record<string, unknown> = {}
  if (b.name !== undefined) payload.name = sanitize(b.name)
  if (b.price !== undefined) payload.price = b.price
  if (b.duration_days !== undefined) payload.duration_days = b.duration_days
  if (b.benefits !== undefined) payload.benefits = b.benefits
  if (b.location_id !== undefined) payload.location_id = b.location_id || null
  if (b.is_active !== undefined) payload.is_active = b.is_active

  if (Object.keys(payload).length === 0)
    return NextResponse.json({ error: 'no_fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('memberships')
    .update(payload as unknown as never)
    .eq('id', id)
    .eq('business_id', businessId)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const id = params.id
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  // soft delete: set is_active false (preserve history for client_memberships FK)
  const { error } = await supabase
    .from('memberships')
    .update({ is_active: false })
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
