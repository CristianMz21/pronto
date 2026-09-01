import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { generateCheckinCode, toDataURL } from '@/lib/qrcode'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const PostSchema = z.object({
  appointment_id: z.string().uuid(),
  checkin_code: z.string().length(8).optional().nullable(),
})

const GetQuerySchema = z.object({
  appointment_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`checkin:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )

  const { appointment_id } = parsed.data
  const supabase = createServiceClient()

  // Verify ownership + status
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, client_id, business_id, status, starts_at, checkin_code')
    .eq('id', appointment_id)
    .maybeSingle()
  if (!appt) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: client } = await supabase
    .from('clients')
    .select('id, user_id')
    .eq('id', (appt as { client_id: string | null }).client_id ?? '')
    .maybeSingle()
  if (!client || (client as { user_id: string | null }).user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const status = (appt as { status: string }).status
  // FSM guard: only confirmed -> checked_in allowed for client (039/047)
  if (status !== 'confirmed') {
    return NextResponse.json(
      { error: 'fsm_guard', message: `Check-in solo desde confirmed, actual ${status}` },
      { status: 409 },
    )
  }

  // Window ±2h
  const starts = new Date((appt as { starts_at: string }).starts_at)
  const now = new Date()
  const diffMs = starts.getTime() - now.getTime()
  const diffHours = Math.abs(diffMs) / 3600000
  // Allow check-in from 2h before to 2h after? Spec says a 10min before, but we allow ±2h
  if (diffMs < -2 * 3600000 || diffMs > 2 * 3600000) {
    // Still allow if within 2h before or slight after, but not far
    // If exactly far, we block? We'll enforce 2h window as spec "starts_at ±2h"
    // If outside, return 400
    if (diffHours > 2) {
      return NextResponse.json(
        {
          error: 'outside_checkin_window',
          message: 'Check-in permitido 2h antes/después de la cita',
        },
        { status: 400 },
      )
    }
  }

  // Ensure checkin_code exists; generate if null
  let code = (appt as { checkin_code: string | null }).checkin_code
  if (!code) {
    code = generateCheckinCode()
    await supabase
      .from('appointments')
      .update({ checkin_code: code } as never)
      .eq('id', appointment_id)
  }

  // Update status to checked_in — relies on DB trigger check_fsm_transition 047
  const { error: updErr } = await supabase
    .from('appointments')
    .update({ status: 'checked_in' } as never)
    .eq('id', appointment_id)
  if (updErr) {
    const msg = String((updErr as { message?: string }).message ?? '')
    if (msg.includes('invalid_fsm_transition')) {
      return NextResponse.json({ error: 'fsm_guard', message: msg }, { status: 409 })
    }
    return NextResponse.json({ error: 'update_failed', message: msg }, { status: 500 })
  }

  // Generate QR dataURL for response (optional)
  let dataURL: string | null = null
  try {
    dataURL = await toDataURL(code)
  } catch {}

  return NextResponse.json({ ok: true, status: 'checked_in', checkin_code: code, dataURL })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const parsed = GetQuerySchema.safeParse({
    appointment_id: url.searchParams.get('appointment_id'),
  })
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )

  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { appointment_id } = parsed.data

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, client_id, business_id, status, checkin_code')
    .eq('id', appointment_id)
    .maybeSingle()
  if (!appt) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: client } = await supabase
    .from('clients')
    .select('id, user_id')
    .eq('id', (appt as { client_id: string | null }).client_id ?? '')
    .maybeSingle()
  if (!client || (client as { user_id: string | null }).user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let code = (appt as { checkin_code: string | null }).checkin_code
  if (!code) {
    code = generateCheckinCode()
    await supabase
      .from('appointments')
      .update({ checkin_code: code } as never)
      .eq('id', appointment_id)
  }

  const dataURL = await toDataURL(code)
  return NextResponse.json({
    checkin_code: code,
    dataURL,
    status: (appt as { status: string }).status,
  })
}
