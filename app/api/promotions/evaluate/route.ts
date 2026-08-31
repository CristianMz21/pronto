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

type PromoRow = {
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
}

type ClientData = {
  birthday?: string | null
  tags?: string[]
  last_visit_at?: string | null
  total_visits?: number
} | null

type EvaluateBody = z.infer<typeof BodySchema>

async function fetchClientData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string | null | undefined,
  businessId: string,
): Promise<ClientData> {
  if (!clientId) return null
  const { data: c } = await supabase
    .from('clients')
    .select('birthday, tags, last_visit_at, total_visits')
    .eq('id', clientId)
    .eq('business_id', businessId)
    .maybeSingle()
  return c as ClientData
}

async function findPromoById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  promotionId: string,
  businessId: string,
): Promise<PromoRow | null> {
  const { data } = await supabase
    .from('promotions')
    .select('*')
    .eq('id', promotionId)
    .eq('business_id', businessId)
    .maybeSingle()
  return data as PromoRow | null
}

async function findPromoByCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  promoCode: string,
  businessId: string,
): Promise<PromoRow | null> {
  const { data } = await supabase
    .from('promotions')
    .select('*')
    .eq('business_id', businessId)
    .eq('promo_code', promoCode.toUpperCase())
    .maybeSingle()
  return data as PromoRow | null
}

async function locatePromotion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  b: EvaluateBody,
  businessId: string,
): Promise<PromoRow | null> {
  if (b.promotion_id) return findPromoById(supabase, b.promotion_id, businessId)
  if (b.promo_code) return findPromoByCode(supabase, b.promo_code, businessId)
  return null
}

function evaluateWithContext(promo: PromoRow, b: EvaluateBody, clientData: ClientData) {
  // @ts-expect-error - tsc strict fix for Promotion type mismatch
  return evaluatePromotion(promo as unknown as Parameters<typeof evaluatePromotion>[0], {
    date: b.date ?? undefined,
    serviceIds: b.service_ids ?? undefined,
    client: clientData,
    amount: b.amount ?? 0,
    now: new Date(),
    promoCode: b.promo_code ?? null,
    locationId: b.location_id ?? null,
  })
}

async function findBestPromo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  b: EvaluateBody,
  businessId: string,
): Promise<NextResponse> {
  const { data: all } = await supabase
    .from('promotions')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
  const clientData = await fetchClientData(supabase, b.client_id, businessId)
  let best: PromoRow | null = null
  let bestDiscount = 0
  for (const p of (all as unknown as PromoRow[] | null) ?? []) {
    const ev = evaluateWithContext(p, b, clientData)
    if (!ev.eligible) continue
    const d = calculateDiscount(
      p as unknown as Parameters<typeof calculateDiscount>[0],
      b.amount ?? 0,
    )
    if (d <= bestDiscount) continue
    bestDiscount = d
    best = p
  }
  if (!best) return NextResponse.json({ eligible: false, reason: 'no_promo_eligible', discount: 0 })
  return NextResponse.json({
    eligible: true,
    promotion: best,
    discount: bestDiscount,
    finalAmount: Math.max(0, (b.amount ?? 0) - bestDiscount),
  })
}

async function parseEvaluateBody(
  req: Request,
): Promise<{ data: EvaluateBody } | { error: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { error: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success)
    return {
      error: NextResponse.json(
        { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      ),
    }
  return { data: parsed.data }
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

  const bodyRes = await parseEvaluateBody(req)
  if ('error' in bodyRes) return bodyRes.error
  const b = bodyRes.data
  if (b.already_discounted)
    return NextResponse.json(
      { eligible: false, reason: 'promo_stack_guard', discount: 0 },
      { status: 409 },
    )

  const promo = await locatePromotion(supabase, b, businessId)
  const isBestSearch = !promo && !b.promotion_id && !b.promo_code
  if (isBestSearch) return findBestPromo(supabase, b, businessId)

  if (!promo)
    return NextResponse.json(
      { eligible: false, reason: 'promo_not_found', discount: 0 },
      { status: 404 },
    )

  const clientData = await fetchClientData(supabase, b.client_id, businessId)
  const evalRes = evaluateWithContext(promo, b, clientData)
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
