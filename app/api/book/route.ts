/**
 * POST /api/book
 * Server-side booking submission with Zod validation and rate limiting.
 * Migrated to Drizzle ORM (portable Postgres/MySQL/SQLite) — Supabase kept only for auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { db } from '@/lib/db'
import { businesses, services, locations, employees, businessHours, holidays, clients, appointments, clientMemberships, promotions } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { rateLimit, getIp } from '@/lib/rate-limit'
import {
  computeEffectiveHours,
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
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  name: z.string().min(1).max(100),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  membership_id: z.string().uuid().optional().nullable(),
  promo_code: z.string().max(50).optional().nullable(),
  loyalty_redeem_points: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  source: z.enum(['online', 'manual', 'campaign', 'campaign_auto', 'walk-in']).optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(ip, { limit: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

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
      { status: 422 },
    )
  }

  const { businessId, serviceId, employeeId, date, time, phone, email, membership_id, promo_code, loyalty_redeem_points } = parsed.data
  const location_id = (parsed.data as { location_id?: string | null }).location_id ?? null
  const source = (parsed.data as { source?: string | null }).source ?? 'online'
  const campaign_id = (parsed.data as { campaign_id?: string | null }).campaign_id ?? null
  const name = sanitize(parsed.data.name)

  const discountCount = [membership_id, promo_code, loyalty_redeem_points ? String(loyalty_redeem_points) : null].filter(Boolean).length
  if (discountCount > 1) {
    return NextResponse.json({ error: 'promo_stack_guard', message: 'Solo un beneficio por reserva (membresía, promo o puntos)' }, { status: 409 })
  }

  if (!phone && !email) {
    return NextResponse.json({ error: 'contact_required', message: 'At least a phone number or email is required' }, { status: 400 })
  }

  // Drizzle: verify service and business (portable, no Supabase vendor lock)
  const [service, biz] = await Promise.all([
    db.query.services.findFirst({
      where: and(eq(services.id, serviceId), eq(services.businessId, businessId), eq(services.isActive, true)),
      columns: { id: true, durationMin: true, price: true, locationId: true },
    }),
    db.query.businesses.findFirst({
      where: eq(businesses.id, businessId),
      columns: { timezone: true, minAdvanceMinutes: true, bookingLeadTimeEnabled: true, allowGuestBookings: true },
    }),
  ])

  if (!service) {
    return NextResponse.json({ error: 'service_not_found' }, { status: 404 })
  }

  const timezone = biz?.timezone ?? 'UTC'
  const minAdvance = (biz as { minAdvanceMinutes?: number | null } | null)?.minAdvanceMinutes ?? DEFAULT_LEAD_MINUTES
  const leadEnabled = (biz as { bookingLeadTimeEnabled?: boolean | null } | null)?.bookingLeadTimeEnabled ?? true
  const allowGuest = (biz as { allowGuestBookings?: boolean | null } | null)?.allowGuestBookings ?? true

  let authUser: { id: string; email?: string | null } | null = null
  try {
    const authClient = await createAuthClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (user) authUser = { id: user.id, email: user.email }
  } catch {}

  if (!allowGuest && !authUser) {
    return NextResponse.json({ error: 'guest_not_allowed', message: 'Debes registrarte para reservar en este negocio' }, { status: 401 })
  }

  if (location_id) {
    const loc = await db.query.locations.findFirst({
      where: and(eq(locations.id, location_id), eq(locations.businessId, businessId)),
      columns: { id: true },
    })
    if (!loc) {
      return NextResponse.json({ error: 'location_not_found', message: 'Sucursal no encontrada en este negocio' }, { status: 404 })
    }
    if ((service as { locationId: string | null }).locationId && (service as { locationId: string | null }).locationId !== location_id) {
      return NextResponse.json({ error: 'service_location_mismatch', message: 'Servicio no disponible en esta sucursal' }, { status: 409 })
    }
    if (employeeId) {
      const empLoc = await db.query.employees.findFirst({
        where: and(eq(employees.id, employeeId), eq(employees.businessId, businessId)),
        columns: { locationId: true },
      })
      if ((empLoc as { locationId: string | null } | null)?.locationId && (empLoc as { locationId: string | null }).locationId !== location_id) {
        return NextResponse.json({ error: 'employee_location_mismatch', message: 'Barbero no disponible en esta sucursal' }, { status: 409 })
      }
    }
  }

  const businessHoursRows = await db.query.businessHours.findMany({
    where: eq(businessHours.businessId, businessId),
  })
  const effectiveHours = computeEffectiveHours(
    businessHoursRows.map((h) => ({
      day_of_week: h.dayOfWeek,
      is_open: h.isOpen,
      open_time: h.openTime,
      close_time: h.closeTime,
      break_start: h.breakStart,
      break_end: h.breakEnd,
    })),
  )
  const dow = dayOfWeekFromDateString(date)
  const dayHours = effectiveHours.find((h) => h.day_of_week === dow)

  // Holiday check via Drizzle
  const holidayRows = await db.query.holidays.findMany({
    where: and(eq(holidays.businessId, businessId), eq(holidays.date, date as unknown as string)),
  })
  const holidaysMapped = holidayRows.map((h) => ({
    date: typeof h.date === 'string' ? (h.date as string).slice(0, 10) : String(h.date),
    is_open: h.isOpen as boolean,
    location_id: h.locationId as string | null,
  }))

  const { checkSlotWithHolidays } = await import('@/lib/booking-availability')
  const slotCheck = checkSlotWithHolidays(
    dayHours,
    time,
    service.durationMin,
    date,
    holidaysMapped as unknown as import('@/lib/booking-availability').HolidayCheck[],
  )

  const locationHoliday = holidaysMapped.some((h) => h.date === date && h.is_open === false && (!h.location_id || !location_id || h.location_id === location_id))
  if (locationHoliday) {
    return NextResponse.json(
      { error: 'outside_availability', reason: 'holiday', message: 'Este día es festivo / cierre por mantenimiento. Elegí otra fecha.' },
      { status: 400 },
    )
  }

  if (!slotCheck.ok) {
    const messages: Record<typeof slotCheck.reason, string> = {
      closed: 'This business is closed at the selected date. Please choose another day.',
      outside_hours: 'This time is outside business hours. Please choose another time.',
      break: 'This time falls during a break. Please choose another time.',
      holiday: 'Este día es festivo y la barbería está cerrada. Elegí otra fecha.',
    }
    return NextResponse.json({ error: 'outside_availability', reason: slotCheck.reason, message: messages[slotCheck.reason] }, { status: 400 })
  }

  // Upsert client via Drizzle — guest/registered claim logic (056+057)
  let clientId: string | null = null
  let hasTelegram = false
  let hasViber = false
  if (phone || email) {
    if (authUser) {
      const linked = await db.query.clients.findFirst({
        where: and(eq(clients.businessId, businessId), eq(clients.userId, authUser.id)),
      })
      if (linked) {
        clientId = linked.id
        hasTelegram = !!linked.telegramId
        hasViber = !!linked.viberUserId
        const updates: Record<string, unknown> = {}
        if (name && name !== linked.name) (updates as Record<string, string>).name = name
        if (phone && phone !== linked.phone) (updates as Record<string, string>).phone = phone
        if (email && email !== linked.email) (updates as Record<string, string>).email = email
        if (Object.keys(updates).length > 0) {
          await db.update(clients).set(updates).where(eq(clients.id, linked.id))
        }
      } else {
        // Try to claim by phone/email if guest record exists — portable via Drizzle or filter in-memory
        const candidates = await db.query.clients.findMany({
          where: eq(clients.businessId, businessId),
        })
        const claimCandidate =
          candidates.find((c) => (phone && c.phone === phone) || (email && c.email === email)) ?? null

        if (claimCandidate && claimCandidate.userId === null) {
          await db.update(clients).set({ userId: authUser.id, name: name || claimCandidate.name }).where(eq(clients.id, claimCandidate.id))
          clientId = claimCandidate.id
          hasTelegram = !!claimCandidate.telegramId
          hasViber = !!claimCandidate.viberUserId
        } else if (claimCandidate && claimCandidate.userId !== null) {
          try {
            const [newClient] = await db
              .insert(clients)
              .values({
                businessId,
                name,
                phone: phone || null,
                email: email || null,
                userId: authUser.id,
              })
              .returning({ id: clients.id })
            clientId = newClient.id
          } catch (e) {
            console.error('[api/book] client claim insert error:', (e as Error).message)
            const fallback = await db.query.clients.findFirst({
              where: and(eq(clients.businessId, businessId), eq(clients.userId, authUser.id)),
            })
            if (fallback) {
              clientId = fallback.id
              hasTelegram = !!fallback.telegramId
              hasViber = !!fallback.viberUserId
            } else {
              return NextResponse.json({ error: 'client_creation_failed' }, { status: 500 })
            }
          }
        } else {
          try {
            const [newClient] = await db
              .insert(clients)
              .values({
                businessId,
                name,
                phone: phone || null,
                email: email || null,
                userId: authUser.id,
              })
              .returning({ id: clients.id })
            clientId = newClient.id
          } catch (e) {
            console.error('[api/book] client insert error:', (e as Error).message)
            return NextResponse.json({ error: 'client_creation_failed' }, { status: 500 })
          }
        }
      }
    } else {
      const candidates = await db.query.clients.findMany({
        where: eq(clients.businessId, businessId),
      })
      const existing = candidates.find((c) => (phone && c.phone === phone) || (email && c.email === email)) ?? null
      if (existing) {
        clientId = existing.id
        hasTelegram = !!existing.telegramId
        hasViber = !!existing.viberUserId
        const updates: Record<string, unknown> = {}
        if (name && name !== existing.name) (updates as Record<string, string>).name = name
        if (email && email !== existing.email) (updates as Record<string, string>).email = email
        if (Object.keys(updates).length > 0) {
          await db.update(clients).set(updates).where(eq(clients.id, existing.id))
        }
      } else {
        try {
          const [newClient] = await db
            .insert(clients)
            .values({
              businessId,
              name,
              phone: phone || null,
              email: email || null,
            })
            .returning({ id: clients.id })
          clientId = newClient.id
        } catch (e) {
          console.error('[api/book] client insert error:', (e as Error).message)
          return NextResponse.json({ error: 'client_creation_failed' }, { status: 500 })
        }
      }
    }
  }

  // US5 loyalty validation via Drizzle (membership / promo / points)
  const supabaseForHelpers = createServiceClient()
  if (clientId && membership_id) {
    try {
      const { isEligible } = await import('@/lib/memberships')
      const cm = await db.query.clientMemberships.findFirst({
        where: and(eq(clientMemberships.id, membership_id), eq(clientMemberships.clientId, clientId), eq(clientMemberships.businessId, businessId)),
      })
      if (!cm) return NextResponse.json({ error: 'membership_not_found' }, { status: 404 })
      if (!isEligible(cm as unknown as { remaining: number; expires_at: string; status: string })) {
        const r = (cm as unknown as { remaining: number }).remaining <= 0 ? 'no_uses_left' : 'membership_expired'
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
      const promo = await db.query.promotions.findFirst({
        where: and(eq(promotions.businessId, businessId), eq(promotions.promoCode, promo_code.toUpperCase())),
      })
      if (!promo) return NextResponse.json({ error: 'promo_not_found' }, { status: 404 })
      const c = await db.query.clients.findFirst({ where: eq(clients.id, clientId) })
      const evalRes = evaluatePromotion(
        promo as unknown as Parameters<typeof evaluatePromotion>[0],
        {
          date,
          serviceIds: [serviceId],
          client: c as unknown as Parameters<typeof evaluatePromotion>[1]['client'],
          amount: Number(service.price),
          now: new Date(),
          promoCode: promo_code,
        },
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
      const bal = await getBalance(supabaseForHelpers as unknown as Parameters<typeof getBalance>[0], clientId)
      if (!canRedeem(bal, Number(loyalty_redeem_points))) return NextResponse.json({ error: 'insufficient_points', balance: bal }, { status: 409 })
    } catch (e) {
      const err = e as Error & { code?: string }
      if (String(err.message).includes('insufficient')) return NextResponse.json({ error: 'insufficient_points' }, { status: 409 })
      console.error('[api/book] loyalty check error', e)
      return NextResponse.json({ error: 'loyalty_check_failed' }, { status: 500 })
    }
  }

  const startsAt = parseDateTimeInTz(date, time, timezone)
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000)

  const now = new Date()
  if (isPastInTz(startsAt, now)) {
    return NextResponse.json({ error: 'in_past', message: 'No se puede reservar en el pasado. Elegí una fecha y hora futuras.' }, { status: 400 })
  }
  if (isTooSoonInTz(startsAt, now, minAdvance, leadEnabled)) {
    return NextResponse.json({ error: 'too_soon', message: `Reservá con al menos ${minAdvance} minutos de anticipación.` }, { status: 400 })
  }

  // Create appointment via Drizzle — still triggers DB constraints (slot_already_booked, no_staff_available, etc.)
  let apptId: string | null = null
  try {
    const [appt] = await db
      .insert(appointments)
      .values({
        businessId,
        locationId: location_id ?? null,
        clientId,
        employeeId: employeeId ?? null,
        serviceId,
        startsAt: startsAt.toISOString() as unknown as string,
        endsAt: endsAt.toISOString() as unknown as string,
        price: service.price as unknown as string,
        status: 'confirmed',
        source: campaign_id ? 'campaign' : (source as string) ?? 'online',
        campaignId: campaign_id ?? null,
      })
      .returning({ id: appointments.id })
    apptId = appt.id
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (msg.includes('no_staff_available')) {
      return NextResponse.json(
        { error: 'no_staff_available', message: 'This business has no staff available to take bookings right now. Please contact them directly.' },
        { status: 409 },
      )
    }
    if (msg.includes('slot_already_booked')) {
      return NextResponse.json({ error: 'slot_taken', message: 'This time slot was just taken. Please choose another time.' }, { status: 409 })
    }
    if (msg.includes('barber_not_qualified')) {
      return NextResponse.json(
        { error: 'barber_not_qualified', message: 'Selected barber cannot perform this service. Please choose another barber or service.' },
        { status: 400 },
      )
    }
    if (msg.includes('barber_unavailable')) {
      return NextResponse.json(
        { error: 'barber_unavailable', message: 'Selected barber is on vacation or break at that time. Please choose another time or barber.' },
        { status: 409 },
      )
    }
    if (msg.includes('barber_inactive')) {
      return NextResponse.json({ error: 'barber_inactive', message: 'Selected barber is inactive. Please choose another barber.' }, { status: 400 })
    }
    if (msg.includes('outside_availability')) {
      const reason = msg.includes('closed') ? 'closed' : msg.includes('break') ? 'break' : 'outside_hours'
      const messages: Record<string, string> = {
        closed: 'This business is closed at the selected date. Please choose another day.',
        outside_hours: 'This time is outside business hours. Please choose another time.',
        break: 'This time falls during a break. Please choose another time.',
      }
      return NextResponse.json({ error: 'outside_availability', reason, message: messages[reason] }, { status: 400 })
    }
    if (msg.includes('in_past') || msg.includes('too_soon')) {
      const isPast = msg.includes('in_past')
      return NextResponse.json(
        { error: isPast ? 'in_past' : 'too_soon', message: isPast ? 'No se puede reservar en el pasado.' : `Reservá con al menos ${minAdvance} minutos de anticipación.` },
        { status: 400 },
      )
    }
    console.error('[api/book] insert error:', msg)
    return NextResponse.json({ error: 'booking_failed' }, { status: 500 })
  }

  if (!apptId) return NextResponse.json({ error: 'booking_failed' }, { status: 500 })

  if (clientId && membership_id && apptId) {
    try {
      const { consumeMembership } = await import('@/lib/memberships')
      await consumeMembership(supabaseForHelpers as unknown as Parameters<typeof consumeMembership>[0], membership_id)
    } catch (e) {
      const err = e as Error & { code?: string }
      await db.delete(appointments).where(eq(appointments.id, apptId))
      if (err.code === 'no_uses_left') return NextResponse.json({ error: 'no_uses_left', message: 'Membresía sin usos restantes' }, { status: 409 })
      if (err.code === 'membership_expired') return NextResponse.json({ error: 'membership_expired', message: 'Membresía expirada' }, { status: 409 })
      console.error('[api/book] membership consume failed', e)
      return NextResponse.json({ error: 'membership_consume_failed', message: err.message }, { status: 409 })
    }
  }

  if (clientId && (campaign_id || source === 'campaign' || source === 'campaign_auto')) {
    try {
      const { attributeRebooking } = await import('@/lib/campaigns')
      await attributeRebooking(supabaseForHelpers as unknown as Parameters<typeof attributeRebooking>[0], {
        clientId,
        businessId,
        campaignId: campaign_id ?? null,
      })
    } catch {}
  }

  fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/email/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.INTERNAL_API_SECRET ?? ''}`,
    },
    body: JSON.stringify({ appointmentId: apptId, formEmail: email || null }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error('[api/book] email/confirm failed:', res.status, text)
      }
    })
    .catch((err) => {
      console.error('[api/book] email/confirm fetch error:', err)
    })

  return NextResponse.json({ appointmentId: apptId, clientId, hasTelegram, hasViber })
}
