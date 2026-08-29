import { NextResponse } from 'next/server'
import { z } from 'zod'

import { calculateDiscount, evaluatePromotion } from '@/lib/promotions'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const BodySchema = z.object({
  promo_code: z.string().min(1).max(50).optional().nullable(),
  promotion_id: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().min(0).max(100_000_000).optional().default(0),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  service_ids: z.array(z.string().uuid()).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  already_discounted: z.boolean().optional().default(false),
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
  if (!rateLimit(`promotions-evaluate:${ip}`, { limit: 120, windowMs: 60 * 1000 }))
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
  const b = parsed.data

  if (b.already_discounted)
    return NextResponse.json(
      { eligible: false, reason: 'promo_stack_guard', discount: 0 },
      { status: 409 },
    )

  // Locate promotion: by promo_code or promotion_id or evaluate all
  let promo: {
    id: string
    business_id: string
    location_id: string | null
    name: string
    type: string
    value: number
    promo_code: string | null
    valid_from: string
    valid_to: string | null
    rules: Record<string, unknown>
    is_active: boolean
  } | null = null

  if (b.promotion_id) {
    const { data } = await supabase
      .from('promotions')
      .select('*')
      .eq('id', b.promotion_id)
      .eq('business_id', businessId)
      .maybeSingle()
    promo = data as typeof promo
  } else if (b.promo_code) {
    const { data } = await supabase
      .from('promotions')
      .select('*')
      .eq('business_id', businessId)
      .eq('promo_code', b.promo_code.toUpperCase())
      .maybeSingle()
    promo = data as typeof promo
  }

  // If no specific promo, evaluate best among active
  if (!promo && !b.promotion_id && !b.promo_code) {
    // fetch all and find best
    const { data: all } = await supabase
      .from('promotions')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
    let best: typeof promo = null
    let bestDiscount = 0
    let clientData: {
      birthday?: string | null
      tags?: string[]
      last_visit_at?: string | null
      total_visits?: number
    } | null = null
    if (b.client_id) {
      const { data: c } = await supabase
        .from('clients')
        .select('birthday, tags, last_visit_at, total_visits')
        .eq('id', b.client_id)
        .eq('business_id', businessId)
        .maybeSingle()
      clientData = c as typeof clientData
    }
    for (const p of (all as unknown as (typeof promo)[] | null) ?? []) {
      // @ts-expect-error - tsc strict fix
      const ev = evaluatePromotion(p as unknown as Parameters<typeof evaluatePromotion>[0], {
        date: b.date ?? undefined,
        serviceIds: b.service_ids ?? undefined,
        client: clientData,
        amount: b.amount ?? 0,
        now: new Date(),
        promoCode: b.promo_code ?? null,
        locationId: b.location_id ?? null,
      })
      if (!ev.eligible) continue
      const d = calculateDiscount(
        p as unknown as Parameters<typeof calculateDiscount>[0],
        b.amount ?? 0,
      )
      if (d > bestDiscount) {
        bestDiscount = d
        best = p
      }
    }
    if (!best)
      return NextResponse.json({ eligible: false, reason: 'no_promo_eligible', discount: 0 })
    return NextResponse.json({
      eligible: true,
      promotion: best,
      discount: bestDiscount,
      finalAmount: Math.max(0, (b.amount ?? 0) - bestDiscount),
    })
  }

  if (!promo)
    return NextResponse.json(
      { eligible: false, reason: 'promo_not_found', discount: 0 },
      { status: 404 },
    )

  // Fetch client for segment evaluation if needed
  let clientData: {
    birthday?: string | null
    tags?: string[]
    last_visit_at?: string | null
    total_visits?: number
  } | null = null
  if (b.client_id) {
    const { data: c } = await supabase
      .from('clients')
      .select('birthday, tags, last_visit_at, total_visits')
      .eq('id', b.client_id)
      .eq('business_id', businessId)
      .maybeSingle()
    clientData = c as typeof clientData
  }
  // @ts-expect-error - tsc strict fix
  const evalRes = evaluatePromotion(promo as unknown as Parameters<typeof evaluatePromotion>[0], {
    date: b.date ?? undefined,
    serviceIds: b.service_ids ?? undefined,
    client: clientData,
    amount: b.amount ?? 0,
    now: new Date(),
    promoCode: b.promo_code ?? null,
    locationId: b.location_id ?? null,
  })

  if (!evalRes.eligible)
    return NextResponse.json({ eligible: false, reason: evalRes.reason, discount: 0 })
  const discount = calculateDiscount(
    promo as unknown as Parameters<typeof calculateDiscount>[0],
    b.amount ?? 0,
  )
  return NextResponse.json({
    eligible: true,
    promotion: promo,
    discount,
    finalAmount: Math.max(0, (b.amount ?? 0) - discount),
  })
}
