import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const BodySchema = z.object({
  actual_cash: z.coerce.number().min(0).max(10_000_000),
  register_id: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`cash-close:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!business) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  // Find open register
  let q = supabase
    .from('cash_registers')
    .select('id, opening_cash, opened_at')
    .eq('business_id', business.id)
    .eq('status', 'open')
  if (parsed.data.register_id) q = q.eq('id', parsed.data.register_id)
  const { data: register } = await q.maybeSingle()
  if (!register)
    return NextResponse.json(
      { error: 'no_open_register', message: 'No hay caja abierta' },
      { status: 404 },
    )

  // Calculate expected
  const { data: txs } = await supabase
    .from('transactions')
    .select('amount')
    .eq('business_id', business.id)
    .eq('payment_method', 'cash')
    .eq('status', 'completed')
    .gte('created_at', register.opened_at)
  const { data: moves } = await supabase
    .from('cash_movements')
    .select('type, amount')
    .eq('register_id', register.id)
  const txSum = (txs ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const inSum = (moves ?? [])
    .filter((m) => m.type === 'in')
    .reduce((s, r) => s + Number(r.amount), 0)
  const outSum = (moves ?? [])
    .filter((m) => m.type === 'out')
    .reduce((s, r) => s + Number(r.amount), 0)
  const expected = Math.round((Number(register.opening_cash) + txSum + inSum - outSum) * 100) / 100

  const { data, error } = await supabase
    .from('cash_registers')
    .update({
      actual_cash: parsed.data.actual_cash,
      expected_cash: expected,
      status: 'closed',
      closed_at: new Date().toISOString(),
    })
    .eq('id', register.id)
    .select(
      'id, opening_cash, expected_cash, actual_cash, difference, status, opened_at, closed_at',
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, txSum, inSum, outSum, expected })
}
