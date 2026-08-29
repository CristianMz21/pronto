import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const QuerySchema = z.object({}).passthrough()

export async function GET(req?: Request) {
  const r = (req ?? new Request('http://localhost')) as Request
  const ip = getIp(r)
  if (!rateLimit(`cash-current:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const url = new URL(r.url)
  const qp = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!qp.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
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

  const { data: register } = await supabase
    .from('cash_registers')
    .select(
      'id, opening_cash, expected_cash, actual_cash, difference, status, opened_at, closed_at, notes',
    )
    .eq('business_id', business.id)
    .eq('status', 'open')
    .maybeSingle()

  if (!register) return NextResponse.json({ register: null })

  // Calculate expected cash: opening + sum(transactions cash) + sum(movements in) - sum(movements out) since opened_at
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
    .eq('business_id', business.id)
    .eq('register_id', register.id)

  const txSum = (txs ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const inSum = (moves ?? [])
    .filter((m) => m.type === 'in')
    .reduce((s, r) => s + Number(r.amount), 0)
  const outSum = (moves ?? [])
    .filter((m) => m.type === 'out')
    .reduce((s, r) => s + Number(r.amount), 0)
  const expected = Math.round((Number(register.opening_cash) + txSum + inSum - outSum) * 100) / 100

  return NextResponse.json({
    register: { ...register, expected_cash: expected, txSum, inSum, outSum },
  })
}
