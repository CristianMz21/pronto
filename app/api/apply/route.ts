import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { getSupabaseUrl } from '@/lib/supabase/getUrl'

const ApplySchema = z.object({
  business_name: z.string().min(2).max(100),
  owner_name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  nit: z.string().max(30).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  requested_plan: z.string().max(50).optional().nullable(),
  turnstile_token: z.string().optional().nullable(),
})

async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // In dev, allow without Turnstile with warning
    console.warn('[apply] TURNSTILE_SECRET_KEY not set, skipping verification (dev only)')
    return true
  }
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    })
    const data = await res.json()
    return !!data.success
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`apply:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Demasiadas solicitudes, intenta en una hora' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = ApplySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { turnstile_token, ...data } = parsed.data

  const turnstileOk = await verifyTurnstile(turnstile_token)
  if (!turnstileOk) {
    return NextResponse.json(
      { error: 'turnstile_failed', message: 'Verificación CAPTCHA fallida' },
      { status: 400 },
    )
  }

  // Use service_role to bypass RLS (public form must work for anon)
  const supabase = createAdminClient(getSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: existing } = await supabase
    .from('barbershop_applications')
    .select('id, status')
    .eq('email', data.email)
    .maybeSingle()
  if (existing && (existing as { status: string }).status === 'pending') {
    return NextResponse.json(
      { error: 'already_pending', message: 'Ya tienes una solicitud pendiente' },
      { status: 409 },
    )
  }

  const { data: inserted, error } = await supabase
    .from('barbershop_applications')
    .insert({
      business_name: data.business_name,
      owner_name: data.owner_name,
      email: data.email,
      phone: data.phone ?? null,
      nit: data.nit ?? null,
      city: data.city ?? null,
      requested_plan: data.requested_plan ?? null,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error || !inserted) {
    return NextResponse.json(
      { error: 'insert_failed', message: error?.message ?? 'Error' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { id: (inserted as { id: string }).id, message: 'Solicitud recibida, te contactaremos pronto' },
    { status: 201 },
  )
}
