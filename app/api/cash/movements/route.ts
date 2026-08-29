import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const BodySchema = z.object({
  type: z.enum(['in', 'out']),
  amount: z.coerce.number().min(0.01).max(1_000_000),
  reason: z.string().max(500).optional().nullable(),
})

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`cash-mov:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
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

  const { data: register } = await supabase
    .from('cash_registers')
    .select('id')
    .eq('business_id', business.id)
    .eq('status', 'open')
    .maybeSingle()
  if (!register)
    return NextResponse.json(
      { error: 'no_open_register', message: 'Abre caja primero' },
      { status: 404 },
    )

  const { data, error } = await supabase
    .from('cash_movements')
    .insert({
      business_id: business.id,
      register_id: register.id,
      type: parsed.data.type,
      amount: parsed.data.amount,
      reason: parsed.data.reason ? sanitize(parsed.data.reason) : null,
      created_by: user.id,
    })
    .select('id, type, amount, reason, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
