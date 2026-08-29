import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  calculateRedeemValue,
  DEFAULT_REDEEM_RATE,
  DEFAULT_REDEEM_VALUE,
  earnPoints,
  getBalance,
  redeemPoints,
} from '@/lib/loyalty'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const QuerySchema = z.object({
  client_id: z.string().uuid(),
})

const BodySchema = z.object({
  action: z.enum(['earn', 'redeem', 'balance']),
  client_id: z.string().uuid(),
  amount: z.coerce.number().min(0).max(100_000_000).optional(),
  points: z.coerce.number().int().min(1).max(1_000_000).optional(),
  transaction_id: z.string().uuid().optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
})

async function resolveBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_value')
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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('client_id')
  const parsed = QuerySchema.safeParse({ client_id: clientId })
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Verify client belongs to business
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', parsed.data.client_id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const balance = await getBalance(
    supabase as unknown as Parameters<typeof getBalance>[0],
    parsed.data.client_id,
  )
  return NextResponse.json({
    client_id: parsed.data.client_id,
    points: balance,
    redeem_value: calculateRedeemValue(balance),
  })
}

export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`loyalty:${ip}`, { limit: 60, windowMs: 60 * 1000 }))
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

  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', b.client_id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  // Fetch business loyalty config for rates
  const { data: biz } = await supabase
    .from('businesses')
    .select('loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_value')
    .eq('id', businessId)
    .maybeSingle()
  const earnRate = (biz as { loyalty_earn_rate?: number } | null)?.loyalty_earn_rate ?? 1000
  const redeemRate =
    (biz as { loyalty_redeem_rate?: number } | null)?.loyalty_redeem_rate ?? DEFAULT_REDEEM_RATE
  const redeemValue =
    (biz as { loyalty_redeem_value?: number } | null)?.loyalty_redeem_value ?? DEFAULT_REDEEM_VALUE

  if (b.action === 'balance') {
    const balance = await getBalance(
      supabase as unknown as Parameters<typeof getBalance>[0],
      b.client_id,
    )
    return NextResponse.json({
      client_id: b.client_id,
      points: balance,
      redeem_value: calculateRedeemValue(balance, redeemRate, redeemValue),
    })
  }

  if (b.action === 'earn') {
    if (b.amount == null) return NextResponse.json({ error: 'amount_required' }, { status: 400 })
    try {
      const res = await earnPoints(supabase as unknown as Parameters<typeof earnPoints>[0], {
        business_id: businessId,
        client_id: b.client_id,
        amount: b.amount,
        transaction_id: b.transaction_id ?? null,
        earn_rate: earnRate,
      })
      return NextResponse.json(res)
    } catch (e) {
      return NextResponse.json({ error: String((e as Error).message) }, { status: 500 })
    }
  }

  if (b.action === 'redeem') {
    if (b.points == null) return NextResponse.json({ error: 'points_required' }, { status: 400 })
    try {
      const res = await redeemPoints(
        supabase as unknown as Parameters<typeof redeemPoints>[0],
        {
          business_id: businessId,
          client_id: b.client_id,
          points: b.points,
          redeem_rate: redeemRate,
          redeem_value: redeemValue,
          reference: b.reference ?? b.transaction_id ?? null,
        } as unknown as Parameters<typeof redeemPoints>[1],
      )
      return NextResponse.json(res)
    } catch (e) {
      const err = e as Error & { code?: string; balance?: number }
      if (err.code === 'insufficient_points')
        return NextResponse.json(
          { error: 'insufficient_points', balance: err.balance ?? 0 },
          { status: 409 },
        )
      return NextResponse.json({ error: err.message ?? 'redeem_failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
}
