/**
 * POST /api/book
 * Server-side booking submission with Zod validation and rate limiting.
 * Replaces direct Supabase client calls from booking-form.tsx.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { rateLimit, getIp } from '@/lib/rate-limit'
import {
  computeEffectiveHours,
  checkSlotWithinHours,
  dayOfWeekFromDateString,
  parseDateTimeInTz,
  isPastInTz,
  isTooSoonInTz,
  DEFAULT_LEAD_MINUTES,
} from '@/lib/booking-availability'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

const BookingSchema = z.object({
  businessId: z.string().uuid(),
  serviceId:  z.string().uuid(),
  employeeId: z.string().uuid().nullable().optional(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  time:       z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  name:       z.string().min(1).max(100),
  phone:      z.string().max(30).optional().nullable(),
  email:      z.string().email().optional().nullable().or(z.literal('')),
  // US5 loyalty extensions (validated via libs, stack guard enforced)
  membership_id: z.string().uuid().optional().nullable(),
  promo_code: z.string().max(50).optional().nullable(),
  loyalty_redeem_points: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  // CRM campaigns attribution (T073)
  source: z.enum(['online','manual','campaign','campaign_auto','walk-in']).optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
})

export async function POST(req: NextRequest) {
  // Rate limit: 5 booking attempts per IP per 10 minutes
  const ip = getIp(req)
  if (!rateLimit(ip, { limit: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // Parse + validate input
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = BookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { businessId, serviceId, employeeId, date, time, phone, email, membership_id, promo_code, loyalty_redeem_points } = parsed.data
  const location_id = (parsed.data as { location_id?: string | null }).location_id ?? null
  const source = (parsed.data as { source?: string | null }).source ?? 'online'
  const campaign_id = (parsed.data as { campaign_id?: string | null }).campaign_id ?? null
  const name = sanitize(parsed.data.name)

  // US5 stack guard: only one promo/membership/loyalty discount at a time
  const discountCount = [membership_id, promo_code, loyalty_redeem_points ? String(loyalty_redeem_points) : null].filter(Boolean).length
  if (discountCount > 1) {
    return NextResponse.json({ error: 'promo_stack_guard', message: 'Solo un beneficio por reserva (membresía, promo o puntos)' }, { status: 409 })
  }

  if (!phone && !email) {
    return NextResponse.json(
      { error: 'contact_required', message: 'At least a phone number or email is required' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // Verify the business exists and the service belongs to it; also fetch timezone + lead time config (054) + guest config (057)
  const [{ data: service }, { data: biz }] = await Promise.all([
    supabase
      .from('services')
      .select('id, duration_min, price')
      .eq('id', serviceId)
      .eq('business_id', businessId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('timezone, min_advance_minutes, booking_lead_time_enabled, allow_guest_bookings')
      .eq('id', businessId)
      .maybeSingle(),
  ])

  if (!service) {
    return NextResponse.json({ error: 'service_not_found' }, { status: 404 })
  }

  const timezone = biz?.timezone ?? 'UTC'
  const minAdvance = (biz as { min_advance_minutes?: number | null } | null)?.min_advance_minutes ?? DEFAULT_LEAD_MINUTES
  const leadEnabled = (biz as { booking_lead_time_enabled?: boolean | null } | null)?.booking_lead_time_enabled ?? true
  const allowGuest = (biz as { allow_guest_bookings?: boolean | null } | null)?.allow_guest_bookings ?? true

  // Guest guard (057): if business disallows guests, require authenticated user
  let authUser: { id: string; email?: string | null } | null = null
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (user) authUser = { id: user.id, email: user.email }
  } catch {
    // ignore — treat as guest if getUser fails
  }
  if (!allowGuest && !authUser) {
    return NextResponse.json({ error: 'guest_not_allowed', message: 'Debes registrarte para reservar en este negocio' }, { status: 401 })
  }

  // Multi-sede: validate location_id belongs to business if provided (nullable default for single-sede)
  if (location_id) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', location_id)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!loc) {
      return NextResponse.json({ error: 'location_not_found', message: 'Sucursal no encontrada en este negocio' }, { status: 404 })
    }
    // Optionally validate service/employee location compatibility (if service has location_id, must match)
    const { data: svcLoc } = await supabase
      .from('services')
      .select('location_id')
      .eq('id', serviceId)
      .eq('business_id', businessId)
      .maybeSingle()
    if ((svcLoc as { location_id: string | null } | null)?.location_id && (svcLoc as { location_id: string | null }).location_id !== location_id) {
      return NextResponse.json({ error: 'service_location_mismatch', message: 'Servicio no disponible en esta sucursal' }, { status: 409 })
    }
    if (employeeId) {
      const { data: empLoc } = await supabase
        .from('employees')
        .select('location_id')
        .eq('id', employeeId)
        .eq('business_id', businessId)
        .maybeSingle()
      if ((empLoc as { location_id: string | null } | null)?.location_id && (empLoc as { location_id: string | null }).location_id !== location_id) {
        return NextResponse.json({ error: 'employee_location_mismatch', message: 'Barbero no disponible en esta sucursal' }, { status: 409 })
      }
    }
  }

  // Server-side availability check — the client (booking-form.tsx) already
  // restricts the slot picker to open hours / outside break, but that's UI
  // convenience only. Nothing before this point stopped a direct POST from
  // requesting a time the business is actually closed for, so repeat the
  // same check here using the same shared logic (lib/booking-availability.ts)
  // the client uses to build effectiveHours in the first place.
  const { data: businessHours } = await supabase
    .from('business_hours')
    .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
    .eq('business_id', businessId)

  const effectiveHours = computeEffectiveHours(businessHours ?? [])
  const dow = dayOfWeekFromDateString(date)
  const dayHours = effectiveHours.find((h) => h.day_of_week === dow)
  // Holiday check (US7) — block bookings on business or location-specific holidays where is_open=false
  let holidays: { date: string; is_open: boolean; location_id: string | null }[] = []
  try {
    const { data: hol } = await supabase
      .from('holidays')
      .select('date, is_open, location_id')
      .eq('business_id', businessId)
      .eq('date', date)
    holidays = ((hol ?? []) as unknown as { date: string; is_open: boolean; location_id: string | null }[]).map((h) => ({
      date: typeof h.date === 'string' ? h.date.slice(0, 10) : String(h.date),
      is_open: h.is_open as boolean,
      location_id: h.location_id as string | null,
    }))
  } catch {}
  const { checkSlotWithHolidays } = await import('@/lib/booking-availability')
  const slotCheck = checkSlotWithHolidays(dayHours, time, service.duration_min, date, holidays as unknown as import('@/lib/booking-availability').HolidayCheck[])

  // Also enforce location-specific holiday filtering explicitly (if location_id provided, business-wide holiday still blocks)
  const locationHoliday = holidays.some((h) => h.date === date && h.is_open === false && (!h.location_id || !location_id || h.location_id === location_id))
  if (locationHoliday) {
    return NextResponse.json(
      { error: 'outside_availability', reason: 'holiday', message: 'Este día es festivo / cierre por mantenimiento. Elegí otra fecha.' },
      { status: 400 }
    )
  }

  if (!slotCheck.ok) {
    const messages: Record<typeof slotCheck.reason, string> = {
      closed: 'This business is closed at the selected date. Please choose another day.',
      outside_hours: 'This time is outside business hours. Please choose another time.',
      break: 'This time falls during a break. Please choose another time.',
      holiday: 'Este día es festivo y la barbería está cerrada. Elegí otra fecha.',
    }
    return NextResponse.json(
      { error: 'outside_availability', reason: slotCheck.reason, message: messages[slotCheck.reason] },
      { status: 400 }
    )
  }

  // Upsert client — with guest/registered claim logic (056+057)
  let clientId: string | null = null
  let hasTelegram = false
  let hasViber = false
  if (phone || email) {
    if (authUser) {
      // 1) Try to find existing client linked to this auth user
      const { data: linked } = await supabase
        .from('clients')
        .select('id, name, email, telegram_id, viber_user_id, user_id')
        .eq('business_id', businessId)
        .eq('user_id', authUser.id)
        .limit(1)
        .maybeSingle()

      if (linked) {
        clientId = linked.id
        hasTelegram = !!linked.telegram_id
        hasViber = !!linked.viber_user_id
        const updates: Record<string, unknown> = {}
        if (name && name !== linked.name) updates.name = name
        if (phone) updates.phone = phone
        if (email && email !== linked.email) updates.email = email
        if (Object.keys(updates).length > 0) {
          await supabase.from('clients').update(updates).eq('id', linked.id)
        }
      } else {
        // 2) No linked client — try to claim by phone/email if guest record exists
        const orParts: string[] = []
        if (phone) orParts.push(`phone.eq.${phone}`)
        if (email) orParts.push(`email.eq.${email}`)

        let claimCandidate: { id: string; name: string; email: string | null; telegram_id: string | null; viber_user_id: string | null; user_id: string | null } | null = null
        if (orParts.length > 0) {
          const { data: matches } = await supabase
            .from('clients')
            .select('id, name, email, telegram_id, viber_user_id, user_id')
            .eq('business_id', businessId)
            .or(orParts.join(','))
            .limit(1)
          claimCandidate = (matches?.[0] as typeof claimCandidate) ?? null
        }

        if (claimCandidate && claimCandidate.user_id === null) {
          // Claim guest history
          await supabase.from('clients').update({ user_id: authUser.id, name: name || claimCandidate.name }).eq('id', claimCandidate.id)
          clientId = claimCandidate.id
          hasTelegram = !!claimCandidate.telegram_id
          hasViber = !!claimCandidate.viber_user_id
        } else if (claimCandidate && claimCandidate.user_id !== null) {
          // Email/phone belongs to another registered user — create new linked record with unique email handling
          // Try to create with user_id; if unique email conflict, fallback to using the candidate (already registered)
          const { data: newClient, error: insertErr } = await supabase
            .from('clients')
            .insert({
              business_id: businessId,
              name,
              phone: phone || null,
              email: email || null,
              user_id: authUser.id,
            })
            .select('id')
            .single()
          if (!insertErr && newClient) {
            clientId = newClient.id
          } else {
            // If insert failed due to unique constraint, use existing linked or fallback
            console.error('[api/book] client claim insert error:', insertErr?.message)
            // Fallback: try to fetch again by user_id
            const { data: fallback } = await supabase
              .from('clients')
              .select('id, telegram_id, viber_user_id')
              .eq('business_id', businessId)
              .eq('user_id', authUser.id)
              .limit(1)
              .maybeSingle()
            if (fallback) {
              clientId = fallback.id
              hasTelegram = !!fallback.telegram_id
              hasViber = !!fallback.viber_user_id
            } else {
              return NextResponse.json({ error: 'client_creation_failed' }, { status: 500 })
            }
          }
        } else {
          // 3) No match — create new registered client
          const { data: newClient, error: insertErr } = await supabase
            .from('clients')
            .insert({
              business_id: businessId,
              name,
              phone: phone || null,
              email: email || null,
              user_id: authUser.id,
            })
            .select('id')
            .single()
          if (insertErr || !newClient) {
            console.error('[api/book] client insert error:', insertErr?.message)
            return NextResponse.json({ error: 'client_creation_failed' }, { status: 500 })
          }
          clientId = newClient.id
        }
      }
    } else {
      // Guest flow (allow_guest true guaranteed here)
      const orParts: string[] = []
      if (phone) orParts.push(`phone.eq.${phone}`)
      if (email) orParts.push(`email.eq.${email}`)

      const { data: matches } = await supabase
        .from('clients')
        .select('id, name, email, telegram_id, viber_user_id')
        .eq('business_id', businessId)
        .or(orParts.join(','))
        .limit(1)

      const existing = matches?.[0] ?? null

      if (existing) {
        clientId = existing.id
        hasTelegram = !!existing.telegram_id
        hasViber = !!existing.viber_user_id
        const updates: { name?: string; email?: string } = {}
        if (name && name !== existing.name) updates.name = name
        if (email && email !== existing.email) updates.email = email
        if (Object.keys(updates).length > 0) {
          await supabase.from('clients').update(updates).eq('id', existing.id)
        }
      } else {
        const { data: newClient, error: insertErr } = await supabase
          .from('clients')
          .insert({
            business_id: businessId,
            name,
            phone: phone || null,
            email: email || null,
          })
          .select('id')
          .single()
        if (insertErr || !newClient) {
          console.error('[api/book] client insert error:', insertErr?.message)
          return NextResponse.json({ error: 'client_creation_failed' }, { status: 500 })
        }
        clientId = newClient.id
      }
    }
  }

  // --- US5 loyalty validation (membership / promo / points) ---
  // Note: booking is net price; if membership valid we will consume one use after appointment insert (advisory lock via lib)
  // For promo/loyalty we validate eligibility but apply discount at POS stage; booking just validates not to block slot
  if (clientId && membership_id) {
    try {
      const { isEligible } = await import('@/lib/memberships')
      const { data: cm } = await supabase.from('client_memberships').select('remaining, expires_at, status').eq('id', membership_id).eq('client_id', clientId).eq('business_id', businessId).maybeSingle()
      if (!cm) return NextResponse.json({ error: 'membership_not_found' }, { status: 404 })
      if (!isEligible(cm as { remaining: number; expires_at: string; status: string })) {
        const r = (cm as { remaining: number }).remaining <= 0 ? 'no_uses_left' : 'membership_expired'
        return NextResponse.json({ error: r, message: r === 'no_uses_left' ? 'Membresía sin usos' : 'Membresía expirada' }, { status: 409 })
      }
    } catch (e) {
      console.error('[api/book] membership check error', e)
      return NextResponse.json({ error: 'membership_check_failed' }, { status: 500 })
    }
  }
  if (promo_code && clientId) {
    try {
      const { evaluatePromotion } = await import('@/lib/promotions')
      const { data: promo } = await supabase.from('promotions').select('id, type, value, promo_code, valid_from, valid_to, rules, is_active, business_id, location_id').eq('business_id', businessId).eq('promo_code', promo_code.toUpperCase()).maybeSingle()
      if (!promo) return NextResponse.json({ error: 'promo_not_found' }, { status: 404 })
      // Fetch client for segment
      const { data: c } = await supabase.from('clients').select('birthday, tags, last_visit_at, total_visits').eq('id', clientId).maybeSingle()
      const evalRes = evaluatePromotion(
        promo as unknown as Parameters<typeof evaluatePromotion>[0],
        {
          date,
          serviceIds: [serviceId],
          client: c as unknown as Parameters<typeof evaluatePromotion>[1]['client'],
          amount: Number(service.price),
          now: new Date(),
          promoCode: promo_code,
        }
      )
      if (!evalRes.eligible) return NextResponse.json({ error: 'promo_not_eligible', reason: evalRes.reason }, { status: 409 })
    } catch (e) {
      console.error('[api/book] promo check error', e)
      return NextResponse.json({ error: 'promo_check_failed' }, { status: 500 })
    }
  }
  if (loyalty_redeem_points && loyalty_redeem_points > 0 && clientId) {
    try {
      const { getBalance, canRedeem } = await import('@/lib/loyalty')
      const bal = await getBalance(supabase as unknown as Parameters<typeof getBalance>[0], clientId)
      if (!canRedeem(bal, Number(loyalty_redeem_points))) return NextResponse.json({ error: 'insufficient_points', balance: bal }, { status: 409 })
    } catch (e) {
      const err = e as Error & { code?: string }
      if (String(err.message).includes('insufficient')) return NextResponse.json({ error: 'insufficient_points' }, { status: 409 })
      console.error('[api/book] loyalty check error', e)
      return NextResponse.json({ error: 'loyalty_check_failed' }, { status: 500 })
    }
  }

  // Create appointment — parse wall-clock time in the business timezone
  const startsAt = parseDateTimeInTz(date, time, timezone)
  const endsAt   = new Date(startsAt.getTime() + service.duration_min * 60_000)

  // Past / lead-time validation — synchronized with booking-form.tsx and booking-calendar.tsx
  // All comparisons in UTC (startsAt is UTC, now is UTC) so business.timezone is already accounted for
  // Lead time is configurable per business (054); when booking_lead_time_enabled false, only past is blocked
  const now = new Date()
  if (isPastInTz(startsAt, now)) {
    return NextResponse.json({ error: 'in_past', message: 'No se puede reservar en el pasado. Elegí una fecha y hora futuras.' }, { status: 400 })
  }
  if (isTooSoonInTz(startsAt, now, minAdvance, leadEnabled)) {
    return NextResponse.json({ error: 'too_soon', message: `Reservá con al menos ${minAdvance} minutos de anticipación.` }, { status: 400 })
  }

  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      business_id: businessId,
      location_id: location_id ?? null,
      client_id:   clientId,
      employee_id: employeeId ?? null,
      service_id:  serviceId,
      starts_at:   startsAt.toISOString(),
      ends_at:     endsAt.toISOString(),
      price:       service.price,
      status:      'confirmed',
      source:      campaign_id ? 'campaign' : source ?? 'online',
      campaign_id: campaign_id ?? null,
    } as unknown as never)
    .select('id')
    .single()

  if (apptErr || !appt) {
    // Trigger 034: no active employee exists to assign this booking to —
    // distinct from a real time conflict, so it gets an honest message
    // instead of "slot already booked".
    if (apptErr?.message?.includes('no_staff_available')) {
      return NextResponse.json(
        { error: 'no_staff_available', message: 'This business has no staff available to take bookings right now. Please contact them directly.' },
        { status: 409 }
      )
    }

    // Trigger 017/032: the DB raises 'slot_already_booked' when a concurrent
    // request wins the race for the same slot.
    if (apptErr?.message?.includes('slot_already_booked')) {
      return NextResponse.json(
        { error: 'slot_taken', message: 'This time slot was just taken. Please choose another time.' },
        { status: 409 }
      )
    }

    // Barber availability triggers (040)
    if (apptErr?.message?.includes('barber_not_qualified')) {
      return NextResponse.json(
        { error: 'barber_not_qualified', message: 'Selected barber cannot perform this service. Please choose another barber or service.' },
        { status: 400 }
      )
    }
    if (apptErr?.message?.includes('barber_unavailable')) {
      return NextResponse.json(
        { error: 'barber_unavailable', message: 'Selected barber is on vacation or break at that time. Please choose another time or barber.' },
        { status: 409 }
      )
    }
    if (apptErr?.message?.includes('barber_inactive')) {
      return NextResponse.json(
        { error: 'barber_inactive', message: 'Selected barber is inactive. Please choose another barber.' },
        { status: 400 }
      )
    }
    if (apptErr?.message?.includes('outside_availability')) {
      const reason = apptErr.message.includes('closed') ? 'closed' : apptErr.message.includes('break') ? 'break' : 'outside_hours'
      const messages: Record<string, string> = {
        closed: 'This business is closed at the selected date. Please choose another day.',
        outside_hours: 'This time is outside business hours. Please choose another time.',
        break: 'This time falls during a break. Please choose another time.',
      }
      return NextResponse.json(
        { error: 'outside_availability', reason, message: messages[reason] },
        { status: 400 }
      )
    }
    if (apptErr?.message?.includes('in_past') || apptErr?.message?.includes('too_soon')) {
      const isPast = apptErr.message.includes('in_past')
      // Use configured lead time for message when available; fallback to 30 for safety (e.g. direct DB trigger legacy)
      return NextResponse.json(
        { error: isPast ? 'in_past' : 'too_soon', message: isPast ? 'No se puede reservar en el pasado.' : `Reservá con al menos ${minAdvance} minutos de anticipación.` },
        { status: 400 }
      )
    }

    console.error('[api/book] insert error:', apptErr?.message)
    return NextResponse.json({ error: 'booking_failed' }, { status: 500 })
  }

  // US5: consume membership if used (booking descuenta remaining)
  if (clientId && membership_id && appt) {
    try {
      const { consumeMembership } = await import('@/lib/memberships')
      await consumeMembership(supabase as unknown as Parameters<typeof consumeMembership>[0], membership_id)
    } catch (e) {
      const err = e as Error & { code?: string }
      await supabase.from('appointments').delete().eq('id', appt.id)
      if (err.code === 'no_uses_left') return NextResponse.json({ error: 'no_uses_left', message: 'Membresía sin usos restantes' }, { status: 409 })
      if (err.code === 'membership_expired') return NextResponse.json({ error: 'membership_expired', message: 'Membresía expirada' }, { status: 409 })
      console.error('[api/book] membership consume failed', e)
      return NextResponse.json({ error: 'membership_consume_failed', message: err.message }, { status: 409 })
    }
  }

  // CRM attribution: mark campaign recipient as rebooked (T073)
  if (clientId && (campaign_id || source === 'campaign' || source === 'campaign_auto')) {
    try {
      const { attributeRebooking } = await import('@/lib/campaigns')
      await attributeRebooking(supabase as unknown as Parameters<typeof attributeRebooking>[0], {
        clientId,
        businessId,
        campaignId: campaign_id ?? null,
      })
    } catch {}
  }

  // Trigger notifications (fire-and-forget — non-blocking)
  fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/email/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET ?? ''}`,
    },
    body: JSON.stringify({ appointmentId: appt.id, formEmail: email || null }),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[api/book] email/confirm failed:', res.status, text)
    }
  }).catch((err) => {
    console.error('[api/book] email/confirm fetch error:', err)
  })

  return NextResponse.json({ appointmentId: appt.id, clientId, hasTelegram, hasViber })
}
