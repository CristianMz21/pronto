import { NextRequest, NextResponse } from 'next/server'

import {
  isPastInTz,
  isTooSoonInTz,
  parseDateTimeInTz,
  DEFAULT_LEAD_MINUTES,
} from '@/lib/booking-availability'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  // Verify ownership
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, client_id, starts_at, status, business_id, clients!inner(user_id)')
    .eq('id', id)
    .maybeSingle()

  if (!appt) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Check that client belongs to this user
  const { data: client } = await supabase
    .from('clients')
    .select('id, user_id')
    .eq('id', appt.client_id ?? '')
    .maybeSingle()

  if (!client || client.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Past validation
  const starts = new Date(appt.starts_at)
  if (isPastInTz(starts, new Date())) {
    return NextResponse.json(
      { error: 'in_past', message: 'No se puede cancelar una cita pasada' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({}))
  if (body.action !== 'cancel') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  }

  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
  if (error)
    return NextResponse.json({ error: 'update_failed', message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let date: string, time: string
  try {
    const body = await req.json()
    date = body.date
    time = body.time
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json(
        { error: 'validation_failed', message: 'Invalid date or time' },
        { status: 422 },
      )
    }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, client_id, starts_at, status, business_id, service_id, services(duration_min)')
    .eq('id', id)
    .maybeSingle()

  if (!appt) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: client } = await supabase
    .from('clients')
    .select('id, user_id')
    .eq('id', appt.client_id ?? '')
    .maybeSingle()

  if (!client || client.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Past check for original
  if (isPastInTz(new Date(appt.starts_at), new Date())) {
    return NextResponse.json(
      { error: 'in_past', message: 'No se puede reprogramar una cita pasada' },
      { status: 400 },
    )
  }

  // Fetch business config for lead time validation
  const { data: biz } = await supabase
    .from('businesses')
    .select('timezone, min_advance_minutes, booking_lead_time_enabled')
    .eq('id', appt.business_id)
    .maybeSingle()

  const timezone = biz?.timezone ?? 'UTC'
  const minAdvance =
    (biz as { min_advance_minutes?: number | null } | null)?.min_advance_minutes ??
    DEFAULT_LEAD_MINUTES
  const leadEnabled =
    (biz as { booking_lead_time_enabled?: boolean | null } | null)?.booking_lead_time_enabled ??
    true

  const newStarts = parseDateTimeInTz(date, time, timezone)
  const now = new Date()
  if (isPastInTz(newStarts, now)) {
    return NextResponse.json(
      { error: 'in_past', message: 'No se puede reprogramar en el pasado' },
      { status: 400 },
    )
  }
  if (isTooSoonInTz(newStarts, now, minAdvance, leadEnabled)) {
    return NextResponse.json(
      { error: 'too_soon', message: `Reservá con al menos ${minAdvance} minutos de anticipación.` },
      { status: 400 },
    )
  }

  // Compute ends_at
  const svc = appt.services as unknown as { duration_min: number } | null
  const duration = svc?.duration_min ?? 60
  const newEnds = new Date(newStarts.getTime() + duration * 60_000)

  const { error: updErr } = await supabase
    .from('appointments')
    .update({
      starts_at: newStarts.toISOString(),
      ends_at: newEnds.toISOString(),
      status: 'confirmed',
    })
    .eq('id', id)

  if (updErr) {
    if (updErr.message.includes('slot_already_booked')) {
      return NextResponse.json(
        { error: 'slot_taken', message: 'Ese horario ya está ocupado' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'update_failed', message: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
