import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const codeCharset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function genCode(len = 10): string {
  let s = ''
  const alphabetLen = codeCharset.length
  // crypto if available
  const c =
    typeof globalThis !== 'undefined'
      ? (globalThis as unknown as { crypto?: Crypto }).crypto
      : undefined
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(len)
    c.getRandomValues(bytes)
    for (let i = 0; i < len; i++) s += codeCharset[(bytes[i] ?? 0) % alphabetLen]
    return s
  }
  for (let i = 0; i < len; i++) s += codeCharset[Math.floor(Math.random() * alphabetLen)]
  return s
}

const PostSchema = z.object({
  amount: z.coerce.number().int().min(1000).max(2_000_000),
  recipient_name: z.string().trim().min(1).max(80).optional().nullable(),
  recipient_email: z.string().email().optional().nullable().or(z.literal('')),
  business_id: z.string().uuid().optional().nullable(),
  business_slug: z.string().min(2).max(64).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
})

const GetQuerySchema = z.object({
  code: z.string().trim().min(4).max(20).optional().nullable(),
  business_id: z.string().uuid().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`gift-get:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const url = new URL(req.url)
  const parsed = GetQuerySchema.safeParse({
    code: url.searchParams.get('code'),
    business_id: url.searchParams.get('business_id'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  if (!parsed.data.code) {
    return NextResponse.json({ error: 'code_required' }, { status: 400 })
  }
  const service = createServiceClient()
  const normalized = parsed.data.code.toUpperCase()
  const { data, error } = await service
    .from('gift_cards')
    .select('id, business_id, code, amount, balance, recipient_name, expires_at, created_at')
    .eq('code', normalized)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // Check expiry
  const row = data as {
    id: string
    business_id: string
    code: string
    amount: number
    balance: number
    recipient_name: string | null
    expires_at: string | null
    created_at: string
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ...row, expired: true }, { status: 200 })
  }
  return NextResponse.json({ ...row, expired: false })
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`gift-post:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const service = createServiceClient()

  let businessId = parsed.data.business_id ?? null
  if (!businessId && parsed.data.business_slug) {
    const { data: biz } = await service
      .from('businesses')
      .select('id')
      .eq('slug', parsed.data.business_slug)
      .maybeSingle()
    if (biz) businessId = (biz as { id: string }).id
  }
  if (!businessId) {
    if (user) {
      const { data: linked } = await service
        .from('clients')
        .select('business_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (linked) businessId = (linked as { business_id: string }).business_id
      else {
        const { data: owned } = await service
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()
        if (owned) businessId = (owned as { id: string }).id
      }
    }
  }
  if (!businessId) {
    const { data: esc } = await service
      .from('businesses')
      .select('id')
      .eq('slug', 'escuderia')
      .maybeSingle()
    if (esc) businessId = (esc as { id: string }).id
  }
  if (!businessId) return NextResponse.json({ error: 'business_not_found' }, { status: 404 })

  let purchaserClientId: string | null = null
  if (user) {
    const { data: client } = await service
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', businessId)
      .maybeSingle()
    if (client) purchaserClientId = (client as { id: string }).id
  }

  // Generate unique code retry 3x
  let code = genCode(10)
  for (let i = 0; i < 3; i++) {
    const { data: exists } = await service
      .from('gift_cards')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!exists) break
    code = genCode(10)
  }

  const amount = parsed.data.amount
  const payload = {
    business_id: businessId,
    code,
    amount,
    balance: amount,
    purchaser_client_id: purchaserClientId,
    recipient_name: parsed.data.recipient_name?.trim()
      ? parsed.data.recipient_name.trim().slice(0, 80)
      : null,
    recipient_email: parsed.data.recipient_email?.trim()
      ? parsed.data.recipient_email.trim().slice(0, 120)
      : null,
    expires_at: parsed.data.expires_at ?? null,
  }

  const { data, error } = await service
    .from('gift_cards')
    .insert(payload as never)
    .select('id, code, amount, balance, recipient_name, expires_at, created_at')
    .single()
  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'code_collision', message: 'reintente' }, { status: 409 })
    }
    return NextResponse.json({ error: 'insert_failed', message: msg }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
