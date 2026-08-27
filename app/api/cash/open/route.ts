import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimit, getIp } from '@/lib/rate-limit'

const BodySchema = z.object({ opening_cash: z.coerce.number().min(0).max(1_000_000).default(0), notes: z.string().max(500).optional().nullable() })

export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`cash-open:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_id', user.id).maybeSingle()
  if (!business) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })

  // Check no open register exists (unique partial index will also enforce)
  const { data: existing } = await supabase.from('cash_registers').select('id').eq('business_id', business.id).eq('status', 'open').maybeSingle()
  if (existing) return NextResponse.json({ error: 'already_open', message: 'Caja ya está abierta' }, { status: 409 })

  const { data, error } = await supabase.from('cash_registers').insert({
    business_id: business.id,
    opened_by: user.id,
    opening_cash: parsed.data.opening_cash,
    notes: parsed.data.notes ?? null,
    status: 'open',
  }).select('id, opening_cash, opened_at, status').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
