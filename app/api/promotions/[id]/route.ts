import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { PromotionSchema } from '@/lib/promotions'
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

function buildPromotionPayload(b: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (b.name !== undefined) payload.name = sanitize(b.name as string)
  if (b.type !== undefined) payload.type = b.type as string
  if (b.value !== undefined) payload.value = b.value as number
  if (b.promo_code !== undefined)
    payload.promo_code = b.promo_code ? (b.promo_code as string).toUpperCase() : null
  if (b.valid_from !== undefined) payload.valid_from = (b.valid_from as string) || null
  if (b.valid_to !== undefined) payload.valid_to = (b.valid_to as string) || null
  if (b.rules !== undefined) payload.rules = b.rules as Record<string, unknown>
  if (b.location_id !== undefined) payload.location_id = (b.location_id as string) || null
  if (b.is_active !== undefined) payload.is_active = b.is_active as boolean
  return payload
}

function validatePercentValue(b: Record<string, unknown>): NextResponse | null {
  if (b.type === 'percent' && b.value != null && Number(b.value as number) > 100)
    return NextResponse.json(
      { error: 'validation_failed', details: { value: ['percent max 100'] } },
      { status: 422 },
    )
  return null
}

async function parsePromoBody(req: Request): Promise<{ raw: unknown } | { error: NextResponse }> {
  try {
    return { raw: (await req.json()) as unknown }
  } catch {
    return { error: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const ip = getIp(req)
  if (!rateLimit(`promotions-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
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

  const body = await parsePromoBody(req)
  if ('error' in body) return body.error

  const schema = PromotionSchema.partial()
  const parsed = schema.safeParse(body.raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const percentError = validatePercentValue(parsed.data as Record<string, unknown>)
  if (percentError) return percentError

  const payload = buildPromotionPayload(parsed.data as Record<string, unknown>)
  if (Object.keys(payload).length === 0)
    return NextResponse.json({ error: 'no_fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('promotions')
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
  const { error } = await supabase
    .from('promotions')
    .update({ is_active: false })
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
