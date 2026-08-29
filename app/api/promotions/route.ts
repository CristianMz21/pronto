import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'

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

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data, error } = await supabase
    .from('promotions')
    .select(
      'id, business_id, location_id, name, type, value, promo_code, valid_from, valid_to, rules, is_active, created_at',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`promotions-create:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
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
  const parsed = PromotionSchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const b = parsed.data

  // Additional guard: percent <=100
  if (b.type === 'percent' && Number(b.value) > 100)
    return NextResponse.json(
      { error: 'validation_failed', details: { value: ['percent max 100'] } },
      { status: 422 },
    )
  if (b.valid_from && b.valid_to) {
    const from = new Date(b.valid_from as string)
    const to = new Date(b.valid_to as string)
    if (
      !Number.isNaN(from.getTime()) &&
      !Number.isNaN(to.getTime()) &&
      from.getTime() >= to.getTime()
    ) {
      return NextResponse.json(
        { error: 'validation_failed', details: { valid_to: ['must be after valid_from'] } },
        { status: 422 },
      )
    }
  }

  const payload = {
    business_id: businessId,
    location_id: b.location_id || null,
    name: sanitize(b.name),
    type: b.type,
    value: b.value,
    promo_code: b.promo_code ? b.promo_code.toUpperCase() : null,
    valid_from: b.valid_from || new Date().toISOString(),
    valid_to: b.valid_to || null,
    rules: (b.rules ?? {}) as unknown as import('@/lib/supabase/database.types').Json,
    is_active: b.is_active ?? true,
  }

  const { data, error } = await supabase
    .from('promotions')
    .insert(payload as unknown as never)
    .select('id')
    .single()
  if (error) {
    if (String(error.message).includes('duplicate') || String(error.message).includes('unique'))
      return NextResponse.json({ error: 'promo_code_duplicate' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
