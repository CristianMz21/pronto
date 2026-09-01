import { type NextRequest, NextResponse } from 'next/server'

import {
  checkSlotWithHolidays,
  computeEffectiveHours,
  DEFAULT_LEAD_MINUTES,
  dayOfWeekFromDateString,
  isPastInTz,
  isTooSoonInTz,
  parseDateTimeInTz,
} from '@/lib/booking-availability'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isRecord } from '@/lib/validation/guard'

function getStringField(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'string' ? v : undefined
}

async function fetchBusinessConfig(
  supabase: ReturnType<typeof createServiceClient>,
  businessId: string,
) {
  try {
    const { data: biz } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: unknown,
            ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
          }
        }
      }
    )
      .from('businesses')
      .select('timezone, min_advance_minutes, booking_lead_time_enabled, cancel_lead_time')
      .eq('id', businessId)
      .maybeSingle()
    const tz = (biz as { timezone?: string } | null)?.timezone ?? 'UTC'
    const minAdvance =
      (biz as { min_advance_minutes?: number | null } | null)?.min_advance_minutes ??
      DEFAULT_LEAD_MINUTES
    const leadEnabled =
      (biz as { booking_lead_time_enabled?: boolean | null } | null)?.booking_lead_time_enabled ??
      true
    const cancelLead = (biz as { cancel_lead_time?: number | null } | null)?.cancel_lead_time ?? 120
    try {
      const { data: settings } = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              eq: (
                c: string,
                v: unknown,
              ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
            }
          }
        }
      )
        .from('business_settings')
        .select('cancel_lead_time')
        .eq('business_id', businessId)
        .maybeSingle()
      const sCancel = (settings as { cancel_lead_time?: number } | null)?.cancel_lead_time
      if (typeof sCancel === 'number' && sCancel > 0)
        return { timezone: tz, minAdvance, leadEnabled, cancelLead: sCancel }
    } catch {}
    return { timezone: tz, minAdvance, leadEnabled, cancelLead }
  } catch {
    return { timezone: 'UTC', minAdvance: DEFAULT_LEAD_MINUTES, leadEnabled: true, cancelLead: 120 }
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const ip = getIp(req)
  if (!rateLimit(`client-cancel:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  // Verify ownership and fetch appt
  const { data: appt } = await supabase
    .from('appointments')
    .select(
      'id, client_id, starts_at, ends_at, status, business_id, service_id, location_id, employee_id',
    )
    .eq('id', id)
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

  const starts = new Date((appt as { starts_at: string }).starts_at)
  const now = new Date()
  if (isPastInTz(starts, now)) {
    return NextResponse.json(
      { error: 'in_past', message: 'No se puede cancelar una cita pasada' },
      { status: 400 },
    )
  }

  const body: unknown = await req.json().catch(() => ({}) as unknown)
  if (getStringField(body, 'action') !== 'cancel') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  }

  // FSM guard: only allow cancel from non-terminal
  const status = (appt as { status: string }).status
  if (['cancelled', 'no_show', 'paid', 'completed'].includes(status)) {
    return NextResponse.json(
      { error: 'fsm_guard', message: `No se puede cancelar desde ${status}` },
      { status: 409 },
    )
  }

  // cancel_lead_time check 2h
  const { cancelLead } = await fetchBusinessConfig(
    supabase,
    (appt as { business_id: string }).business_id,
  )
  const isLate = isTooSoonInTz(starts, now, cancelLead, true)
  const cancelledLate = isLate

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' } as never)
    .eq('id', id)
  if (error) {
    const msg = String((error as { message?: string }).message ?? '')
    if (msg.includes('invalid_fsm_transition')) {
      return NextResponse.json({ error: 'fsm_guard', message: msg }, { status: 409 })
    }
    return NextResponse.json({ error: 'update_failed', message: msg }, { status: 500 })
  }

  // Trigger waitlist.notifyNext async (fire-and-forget but await for test determinism)
  try {
    const { notifyNext } = await import('@/lib/waitlist')
    await notifyNext(supabase as unknown as Parameters<typeof notifyNext>[0], {
      business_id: (appt as { business_id: string }).business_id,
      desired_at: (appt as { starts_at: string }).starts_at,
      location_id: (appt as { location_id: string | null }).location_id ?? null,
      service_id: (appt as { service_id: string | null }).service_id ?? null,
      employee_id: (appt as { employee_id: string | null }).employee_id ?? null,
    })
  } catch {}

  return NextResponse.json({
    ok: true,
    cancelled_late: cancelledLate,
    charge: cancelledLate ? 10000 : 0,
    message: cancelledLate
      ? 'Cancelada con posible cargo $10.000 (dentro de 2h)'
      : 'Cancelada sin cargo',
  })
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const ip = getIp(req)
  if (!rateLimit(`client-reprogram:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let date: string, time: string
  try {
    const body: unknown = (await req.json()) as unknown
    const rawDate = getStringField(body, 'date')
    const rawTime = getStringField(body, 'time')
    if (rawDate === undefined || rawTime === undefined) {
      return NextResponse.json(
        { error: 'validation_failed', message: 'Invalid date or time' },
        { status: 422 },
      )
    }
    date = rawDate
    time = rawTime
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
    .select(
      'id, client_id, starts_at, status, business_id, service_id, location_id, employee_id, services(duration_min)',
    )
    .eq('id', id)
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

  if (isPastInTz(new Date((appt as { starts_at: string }).starts_at), new Date())) {
    return NextResponse.json(
      { error: 'in_past', message: 'No se puede reprogramar una cita pasada' },
      { status: 400 },
    )
  }

  const businessId = (appt as { business_id: string }).business_id
  const { timezone, minAdvance, leadEnabled } = await fetchBusinessConfig(supabase, businessId)

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

  // Validate slot within business hours + holidays + break
  try {
    const [{ data: bhRows }, { data: holidayRows }] = await Promise.all([
      supabase
        .from('business_hours')
        .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
        .eq('business_id', businessId),
      supabase
        .from('holidays')
        .select('date, is_open, location_id')
        .eq('business_id', businessId)
        .eq('date', date),
    ])
    const effective = computeEffectiveHours(
      (
        (bhRows as Array<{
          day_of_week: number
          is_open: boolean
          open_time: string
          close_time: string
          break_start: string | null
          break_end: string | null
        }>) ?? []
      ).map((h) => ({
        day_of_week: h.day_of_week,
        is_open: h.is_open,
        open_time: h.open_time,
        close_time: h.close_time,
        break_start: h.break_start,
        break_end: h.break_end,
      })),
    )
    const dow = dayOfWeekFromDateString(date)
    const dayHours = effective.find((h) => h.day_of_week === dow)
    const holidaysMapped = (
      (holidayRows as Array<{ date: string; is_open: boolean; location_id: string | null }>) ?? []
    ).map((h) => ({
      date: typeof h.date === 'string' ? h.date.slice(0, 10) : String(h.date),
      is_open: h.is_open,
      location_id: h.location_id,
    }))
    const svc = (appt as { services: { duration_min: number } | null }).services
    const duration = svc?.duration_min ?? 60
    const check = checkSlotWithHolidays(
      dayHours,
      time,
      duration,
      date,
      holidaysMapped as unknown as import('@/lib/booking-availability').HolidayCheck[],
    )
    if (!check.ok) {
      const messages: Record<string, string> = {
        closed: 'Negocio cerrado ese día',
        outside_hours: 'Fuera de horario',
        break: 'En break del negocio',
        holiday: 'Feriado cerrado',
      }
      return NextResponse.json(
        {
          error: 'outside_availability',
          reason: check.reason,
          message: messages[check.reason] ?? 'No disponible',
        },
        { status: 400 },
      )
    }
  } catch {}

  // Compute ends_at
  const svc = (appt as { services: { duration_min: number } | null }).services
  const duration = svc?.duration_min ?? 60
  const newEnds = new Date(newStarts.getTime() + duration * 60_000)

  const { error: updErr } = await supabase
    .from('appointments')
    .update({
      starts_at: newStarts.toISOString(),
      ends_at: newEnds.toISOString(),
      status: 'confirmed',
    } as never)
    .eq('id', id)

  if (updErr) {
    const msg = String((updErr as { message?: string }).message ?? '')
    if (msg.includes('slot_already_booked') || msg.includes('slot_taken')) {
      return NextResponse.json(
        { error: 'slot_taken', message: 'Ese horario ya está ocupado' },
        { status: 409 },
      )
    }
    if (msg.includes('outside_availability')) {
      return NextResponse.json({ error: 'outside_availability', message: msg }, { status: 400 })
    }
    if (msg.includes('invalid_fsm_transition')) {
      return NextResponse.json({ error: 'fsm_guard', message: msg }, { status: 409 })
    }
    return NextResponse.json({ error: 'update_failed', message: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
