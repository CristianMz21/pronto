/**
 * POST /api/book
 * Server-side booking submission with Zod validation and rate limiting.
 * Migrated to Drizzle ORM (portable Postgres/MySQL/SQLite) — Supabase kept only for auth.
 */

import { and, eq } from 'drizzle-orm'
import DOMPurify from 'isomorphic-dompurify'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  appointments,
  businesses,
  businessHours,
  clientMemberships,
  clients,
  employees,
  holidays,
  locations,
  promotions,
  services,
} from '@/drizzle/schema'
import {
  checkSlotWithHolidays,
  computeEffectiveHours,
  DEFAULT_LEAD_MINUTES,
  dayOfWeekFromDateString,
  isPastInTz,
  isTooSoonInTz,
  parseDateTimeInTz,
} from '@/lib/booking-availability'
import { db, tryDrizzle } from '@/lib/db'
import { generateCheckinCode } from '@/lib/qrcode'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

type ServiceRow = {
  id: string
  durationMin: number
  price: string | number
  locationId: string | null
} | null
type BusinessRow = {
  timezone: string
  minAdvanceMinutes: number | null
  bookingLeadTimeEnabled: boolean | null
  allowGuestBookings: boolean | null
} | null
type BusinessHoursRow = {
  id: string
  businessId: string
  locationId: string | null
  dayOfWeek: number
  isOpen: boolean
  openTime: string
  closeTime: string
  breakStart: string | null
  breakEnd: string | null
}
type HolidayRow = {
  id: string
  businessId: string
  locationId: string | null
  date: string
  reason: string | null
  isOpen: boolean
}
type ClientRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  telegramId: string | null
  viberUserId: string | null
  userId: string | null
}
type ClientCandidate = {
  id: string
  name: string
  phone: string | null
  email: string | null
  telegramId: string | null
  viberUserId: string | null
  userId: string | null
}

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
  source: z
    .enum(['online', 'manual', 'campaign', 'campaign_auto', 'walk-in'])
    .optional()
    .nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  tip_amount: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  deposit_amount: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  guest_name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : (v?.trim() ?? null)))
    .optional(),
})

// ── Small helpers (<20 each) ───────────────────────────────────────────────

function checkPromoStack(
  membership_id: string | null | undefined,
  promo_code: string | null | undefined,
  loyalty_redeem_points: number | null | undefined,
): NextResponse | null {
  const count = [
    membership_id,
    promo_code,
    loyalty_redeem_points ? String(loyalty_redeem_points) : null,
  ].filter(Boolean).length
  if (count > 1)
    return NextResponse.json(
      {
        error: 'promo_stack_guard',
        message: 'Solo un beneficio por reserva (membresía, promo o puntos)',
      },
      { status: 409 },
    )
  return null
}

function checkContactRequired(
  phone: string | null | undefined,
  email: string | null | undefined,
): NextResponse | null {
  if (!phone && !email)
    return NextResponse.json(
      { error: 'contact_required', message: 'At least a phone number or email is required' },
      { status: 400 },
    )
  return null
}

async function fetchServiceAndBiz(
  serviceId: string,
  businessId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<{ service: ServiceRow; biz: BusinessRow }> {
  const [serviceRaw, bizRaw]: [unknown, unknown] = await Promise.all([
    tryDrizzle(
      () =>
        db.query.services.findFirst({
          where: and(
            eq(services.id, serviceId),
            eq(services.businessId, businessId),
            eq(services.isActive, true),
          ),
          columns: { id: true, durationMin: true, price: true, locationId: true },
        }),
      async (): Promise<unknown> => {
        const { data } = await supabaseFallback
          .from('services')
          .select('id, duration_min, price, location_id')
          .eq('id', serviceId)
          .eq('business_id', businessId)
          .eq('is_active', true)
          .maybeSingle()
        if (!data) return null as unknown as ServiceRow
        const d = data as unknown as {
          id: string
          duration_min: number
          price: unknown
          location_id: string | null
        }
        return {
          id: d.id,
          durationMin: d.duration_min,
          price: d.price as string,
          locationId: d.location_id,
        } as ServiceRow
      },
    ),
    tryDrizzle(
      () =>
        db.query.businesses.findFirst({
          where: eq(businesses.id, businessId),
          columns: {
            timezone: true,
            minAdvanceMinutes: true,
            bookingLeadTimeEnabled: true,
            allowGuestBookings: true,
          },
        }),
      async (): Promise<unknown> => {
        const { data } = await supabaseFallback
          .from('businesses')
          .select('timezone, min_advance_minutes, booking_lead_time_enabled, allow_guest_bookings')
          .eq('id', businessId)
          .maybeSingle()
        if (!data) return null as unknown as BusinessRow
        const d = data as unknown as {
          timezone: string
          min_advance_minutes: number | null
          booking_lead_time_enabled: boolean | null
          allow_guest_bookings: boolean | null
        }
        return {
          timezone: d.timezone,
          minAdvanceMinutes: d.min_advance_minutes,
          bookingLeadTimeEnabled: d.booking_lead_time_enabled,
          allowGuestBookings: d.allow_guest_bookings,
        } as BusinessRow
      },
    ),
  ])
  return { service: serviceRaw as ServiceRow, biz: bizRaw as BusinessRow }
}

async function fetchAuthUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const authClient = await createAuthClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (user) return { id: user.id, email: user.email ?? null }
    return null
  } catch {
    return null
  }
}

function checkGuestAllowed(
  allowGuest: boolean,
  authUser: { id: string; email: string | null } | null,
): NextResponse | null {
  if (!allowGuest && !authUser)
    return NextResponse.json(
      { error: 'guest_not_allowed', message: 'Debes registrarte para reservar en este negocio' },
      { status: 401 },
    )
  return null
}

async function checkLocationExists(
  location_id: string | null,
  businessId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<NextResponse | null> {
  if (!location_id) return null
  const loc = (await tryDrizzle(
    () =>
      db.query.locations.findFirst({
        where: and(eq(locations.id, location_id), eq(locations.businessId, businessId)),
        columns: { id: true },
      }),
    async (): Promise<unknown> => {
      const { data } = await supabaseFallback
        .from('locations')
        .select('id')
        .eq('id', location_id)
        .eq('business_id', businessId)
        .maybeSingle()
      return data as unknown as { id: string } | null
    },
  )) as { id: string } | null
  if (!loc)
    return NextResponse.json(
      { error: 'location_not_found', message: 'Sucursal no encontrada en este negocio' },
      { status: 404 },
    )
  return null
}

function checkServiceLocationMismatch(
  service: ServiceRow,
  location_id: string | null,
): NextResponse | null {
  if (service?.locationId && service.locationId !== location_id) {
    return NextResponse.json(
      { error: 'service_location_mismatch', message: 'Servicio no disponible en esta sucursal' },
      { status: 409 },
    )
  }
  return null
}

async function checkEmployeeLocationMismatch(
  employeeId: string | null | undefined,
  businessId: string,
  location_id: string | null,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<NextResponse | null> {
  if (!employeeId || !location_id) return null
  const empLoc = (await tryDrizzle(
    () =>
      db.query.employees.findFirst({
        where: and(eq(employees.id, employeeId), eq(employees.businessId, businessId)),
        columns: { locationId: true },
      }),
    async (): Promise<unknown> => {
      const { data } = await supabaseFallback
        .from('employees')
        .select('location_id')
        .eq('id', employeeId)
        .eq('business_id', businessId)
        .maybeSingle()
      if (!data) return null as unknown as { locationId: string | null } | null
      const d = data as unknown as { location_id: string | null }
      return { locationId: d.location_id } as unknown as { locationId: string | null } | null
    },
  )) as { locationId: string | null } | null
  if (empLoc?.locationId && empLoc.locationId !== location_id) {
    return NextResponse.json(
      { error: 'employee_location_mismatch', message: 'Barbero no disponible en esta sucursal' },
      { status: 409 },
    )
  }
  return null
}

async function validateLocationFlow(
  service: ServiceRow,
  location_id: string | null,
  employeeId: string | null | undefined,
  businessId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<NextResponse | null> {
  if (!location_id) return null
  const locErr = await checkLocationExists(location_id, businessId, supabaseFallback)
  if (locErr) return locErr
  const svcErr = checkServiceLocationMismatch(service, location_id)
  if (svcErr) return svcErr
  const empErr = await checkEmployeeLocationMismatch(
    employeeId,
    businessId,
    location_id,
    supabaseFallback,
  )
  if (empErr) return empErr
  return null
}

async function fetchBusinessHours(
  businessId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<BusinessHoursRow[]> {
  const rows = (await tryDrizzle(
    () => db.query.businessHours.findMany({ where: eq(businessHours.businessId, businessId) }),
    async (): Promise<unknown> => {
      const { data } = await supabaseFallback
        .from('business_hours')
        .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
        .eq('business_id', businessId)
      if (!data) return [] as unknown as BusinessHoursRow[]
      return (
        data as unknown as Array<{
          day_of_week: number
          is_open: boolean
          open_time: string
          close_time: string
          break_start: string | null
          break_end: string | null
        }>
      ).map((h) => ({
        id: '',
        businessId,
        locationId: null,
        dayOfWeek: h.day_of_week,
        isOpen: h.is_open,
        openTime: h.open_time,
        closeTime: h.close_time,
        breakStart: h.break_start,
        breakEnd: h.break_end,
      })) as unknown as BusinessHoursRow[]
    },
  )) as BusinessHoursRow[]
  return rows
}

async function fetchHolidays(
  businessId: string,
  date: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<HolidayRow[]> {
  const rows = (await tryDrizzle(
    () =>
      db.query.holidays.findMany({
        where: and(
          eq(holidays.businessId, businessId),
          eq(holidays.date, date as unknown as string),
        ),
      }),
    async (): Promise<unknown> => {
      try {
        const chain = supabaseFallback.from('holidays') as unknown as {
          select: (
            s: string,
          ) => Promise<{ data: unknown }> & Record<string, (...a: unknown[]) => unknown>
        }
        let res: { data: unknown } | null = null
        try {
          const sel = chain.select('date, is_open, location_id') as unknown as Record<
            string,
            unknown
          >
          if (sel && typeof (sel as Record<string, unknown>).eq === 'function') {
            const withEq = (sel as Record<string, (...a: unknown[]) => unknown>).eq?.(
              'business_id',
              businessId,
            ) as unknown as Record<string, unknown> | undefined
            const withEq2 = (
              withEq as Record<string, (...a: unknown[]) => unknown> | undefined
            )?.eq?.('date', date) as unknown as Promise<{ data: unknown }> | undefined
            if (withEq2 && typeof withEq2.then === 'function') res = await withEq2
            else if (withEq && typeof (withEq as unknown as Promise<unknown>).then === 'function')
              res = await (withEq as unknown as Promise<{ data: unknown }>)
          } else if (sel && typeof (sel as unknown as Promise<unknown>).then === 'function') {
            res = await (sel as unknown as Promise<{ data: unknown }>)
          }
        } catch {}
        if (!res) {
          const r = (await chain.select('date, is_open, location_id')) as unknown as {
            data: unknown
          }
          res = r
        }
        const data = (res as { data: unknown })?.data
        if (!data || !Array.isArray(data)) return [] as unknown as HolidayRow[]
        return (data as Array<{ date: string; is_open: boolean; location_id: string | null }>).map(
          (h) => ({
            id: '',
            businessId,
            locationId: h.location_id,
            date: h.date,
            reason: null,
            isOpen: h.is_open,
          }),
        ) as unknown as HolidayRow[]
      } catch {
        return [] as unknown as HolidayRow[]
      }
    },
  )) as HolidayRow[]
  return rows
}

function checkHolidayBlock(
  holidaysMapped: { date: string; is_open: boolean; location_id: string | null }[],
  date: string,
  location_id: string | null,
): NextResponse | null {
  const isHoliday = holidaysMapped.some(
    (h) =>
      h.date === date &&
      h.is_open === false &&
      (!h.location_id || !location_id || h.location_id === location_id),
  )
  if (isHoliday)
    return NextResponse.json(
      {
        error: 'outside_availability',
        reason: 'holiday',
        message: 'Este día es festivo / cierre por mantenimiento. Elegí otra fecha.',
      },
      { status: 400 },
    )
  return null
}

function checkSlotOk(
  dayHours: unknown,
  time: string,
  durationMin: number,
  date: string,
  holidaysMapped: unknown,
): NextResponse | null {
  const result = (
    checkSlotWithHolidays as unknown as (
      a: unknown,
      b: string,
      c: number,
      d: string,
      e: unknown,
    ) => { ok: boolean; reason: string }
  )(dayHours, time, durationMin, date, holidaysMapped)
  if (result.ok) return null
  const messages: Record<string, string> = {
    closed: 'This business is closed at the selected date. Please choose another day.',
    outside_hours: 'This time is outside business hours. Please choose another time.',
    break: 'This time falls during a break. Please choose another time.',
    holiday: 'Este día es festivo y la barbería está cerrada. Elegí otra fecha.',
  }
  return NextResponse.json(
    {
      error: 'outside_availability',
      reason: result.reason,
      message: messages[result.reason] ?? 'Unavailable',
    },
    { status: 400 },
  )
}

// ── Client helpers ───────────────────────────────────────────────────────

async function findLinkedClient(
  supabaseFallback: ReturnType<typeof createServiceClient>,
  businessId: string,
  authUserId: string,
): Promise<ClientRow | null> {
  return (await tryDrizzle(
    () =>
      db.query.clients.findFirst({
        where: and(eq(clients.businessId, businessId), eq(clients.userId, authUserId)),
      }),
    async (): Promise<unknown> => {
      const { data } = await supabaseFallback
        .from('clients')
        .select('id, name, email, telegram_id, viber_user_id, user_id')
        .eq('business_id', businessId)
        .eq('user_id', authUserId)
        .limit(1)
        .maybeSingle()
      if (!data) return null as unknown as ClientRow | null
      const d = data as unknown as {
        id: string
        name: string
        email: string | null
        telegram_id: string | null
        viber_user_id: string | null
        user_id: string | null
      }
      return {
        id: d.id,
        name: d.name,
        email: d.email,
        telegramId: d.telegram_id,
        viberUserId: d.viber_user_id,
        userId: d.user_id,
      } as unknown as ClientRow | null
    },
  )) as ClientRow | null
}

async function updateLinkedClient(
  linked: ClientRow,
  name: string,
  phone: string | null | undefined,
  email: string | null | undefined,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const updates: Record<string, unknown> = {}
  if (name && name !== linked.name) (updates as Record<string, string>).name = name
  if (phone && phone !== linked.phone) (updates as Record<string, string>).phone = phone
  if (email && email !== linked.email) (updates as Record<string, string>).email = email
  if (Object.keys(updates).length === 0) return
  await tryDrizzle(
    (() =>
      db
        .update(clients)
        .set(updates as unknown as never)
        .where(eq(clients.id, linked.id))) as unknown as () => Promise<unknown>,
    async (): Promise<unknown> => {
      await supabaseFallback
        .from('clients')
        .update(updates as unknown as never)
        .eq('id', linked.id)
      return null
    },
  )
}

async function fetchCandidatesForAuth(
  supabaseFallback: ReturnType<typeof createServiceClient>,
  businessId: string,
  phone: string | null | undefined,
  email: string | null | undefined,
): Promise<ClientCandidate[]> {
  return (await tryDrizzle(
    () => db.query.clients.findMany({ where: eq(clients.businessId, businessId) }),
    async (): Promise<unknown> => {
      try {
        const orParts: string[] = []
        if (phone) orParts.push(`phone.eq.${phone}`)
        if (email) orParts.push(`email.eq.${email}`)
        const orStr = orParts.join(',')
        const chain = supabaseFallback.from('clients') as unknown as Record<string, unknown>
        const sel = (chain as unknown as { select: (s: string) => unknown }).select(
          'id, name, email, telegram_id, viber_user_id, user_id, phone',
        ) as unknown as Record<string, unknown>
        const eqRes = (sel as unknown as { eq: (...a: unknown[]) => unknown }).eq?.(
          'business_id',
          businessId,
        ) as unknown as Record<string, unknown>
        if (eqRes && typeof (eqRes as Record<string, unknown>).or === 'function') {
          const orRes = (eqRes as unknown as { or: (s: string) => unknown }).or(
            orStr,
          ) as unknown as Record<string, unknown>
          const lim = (
            orRes as unknown as { limit: (n: number) => Promise<{ data: unknown }> }
          )?.limit?.(10) as unknown as Promise<{ data: unknown }>
          if (lim && typeof lim.then === 'function') {
            const r = await lim
            if (r && 'data' in r && Array.isArray(r.data))
              return (r.data as Array<Record<string, unknown>>).map((d) => ({
                id: d.id as string,
                name: d.name as string,
                email: d.email as string | null,
                telegramId: d.telegram_id as string | null,
                viberUserId: d.viber_user_id as string | null,
                userId: d.user_id as string | null,
                phone: d.phone as string | null,
              })) as unknown as ClientCandidate[]
          }
        }
        if (eqRes && typeof (eqRes as Record<string, unknown>).limit === 'function') {
          const lim2 = (
            eqRes as unknown as { limit: (n: number) => Promise<{ data: unknown }> }
          ).limit(10)
          const r2 = await lim2
          if (r2 && 'data' in r2 && Array.isArray(r2.data))
            return (r2.data as Array<Record<string, unknown>>).map((d) => ({
              id: d.id as string,
              name: d.name as string,
              email: d.email as string | null,
              telegramId: d.telegram_id as string | null,
              viberUserId: d.viber_user_id as string | null,
              userId: d.user_id as string | null,
              phone: d.phone as string | null,
            })) as unknown as ClientCandidate[]
        }
      } catch {}
      return [] as unknown as ClientCandidate[]
    },
  )) as ClientCandidate[]
}

async function claimUnownedCandidate(
  candidate: ClientCandidate,
  authUserId: string,
  name: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<void> {
  await tryDrizzle(
    (() =>
      db
        .update(clients)
        .set({ userId: authUserId, name: name || candidate.name })
        .where(eq(clients.id, candidate.id))) as unknown as () => Promise<unknown>,
    async (): Promise<unknown> => {
      await supabaseFallback
        .from('clients')
        .update({ user_id: authUserId, name: name || candidate.name })
        .eq('id', candidate.id)
      return null
    },
  )
}

async function createClientForAuth(
  businessId: string,
  name: string,
  phone: string | null | undefined,
  email: string | null | undefined,
  authUserId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<string | null> {
  const [newClient] = (await tryDrizzle(
    () =>
      db
        .insert(clients)
        .values({
          businessId,
          name,
          phone: phone || null,
          email: email || null,
          userId: authUserId,
        })
        .returning({ id: clients.id }),
    async (): Promise<Array<{ id: string }>> => {
      const { data } = await supabaseFallback
        .from('clients')
        .insert({
          business_id: businessId,
          name,
          phone: phone || null,
          email: email || null,
          user_id: authUserId,
        })
        .select('id')
        .single()
      return [{ id: (data as unknown as { id: string }).id }] as Array<{ id: string }>
    },
  )) as Array<{ id: string }>
  return newClient?.id ?? null
}

async function handleAuthClaimFlow(
  businessId: string,
  name: string,
  phone: string | null | undefined,
  email: string | null | undefined,
  authUserId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<{
  clientId: string | null
  hasTelegram: boolean
  hasViber: boolean
  error?: NextResponse
}> {
  const candidates = await fetchCandidatesForAuth(supabaseFallback, businessId, phone, email)
  const claimCandidate =
    candidates.find((c) => (phone && c.phone === phone) || (email && c.email === email)) ?? null
  if (claimCandidate && claimCandidate.userId === null) {
    await claimUnownedCandidate(claimCandidate, authUserId, name, supabaseFallback)
    return {
      clientId: claimCandidate.id,
      hasTelegram: !!claimCandidate.telegramId,
      hasViber: !!claimCandidate.viberUserId,
    }
  }
  if (claimCandidate && claimCandidate.userId !== null) {
    try {
      const newId = await createClientForAuth(
        businessId,
        name,
        phone,
        email,
        authUserId,
        supabaseFallback,
      )
      if (newId) return { clientId: newId, hasTelegram: false, hasViber: false }
    } catch {
      // fallback below
    }
    const fallback = (await tryDrizzle(
      () =>
        db.query.clients.findFirst({
          where: and(eq(clients.businessId, businessId), eq(clients.userId, authUserId)),
        }),
      async (): Promise<unknown> => {
        const { data } = await supabaseFallback
          .from('clients')
          .select('id, telegram_id, viber_user_id')
          .eq('business_id', businessId)
          .eq('user_id', authUserId)
          .limit(1)
          .maybeSingle()
        if (!data) return null as unknown as ClientRow | null
        const d = data as unknown as {
          id: string
          telegram_id: string | null
          viber_user_id: string | null
        }
        return {
          id: d.id,
          name: '',
          phone: null,
          email: null,
          telegramId: d.telegram_id,
          viberUserId: d.viber_user_id,
          userId: authUserId,
        } as unknown as ClientRow | null
      },
    )) as ClientRow | null
    if (fallback)
      return {
        clientId: fallback.id,
        hasTelegram: !!fallback.telegramId,
        hasViber: !!fallback.viberUserId,
      }
    // Preserve old behavior: if create succeeded without id, continue with null rather than 500
    return { clientId: null, hasTelegram: false, hasViber: false }
  }
  try {
    const newId = await createClientForAuth(
      businessId,
      name,
      phone,
      email,
      authUserId,
      supabaseFallback,
    )
    if (newId) return { clientId: newId, hasTelegram: false, hasViber: false }
    return { clientId: null, hasTelegram: false, hasViber: false }
  } catch {
    return {
      clientId: null,
      hasTelegram: false,
      hasViber: false,
      error: NextResponse.json({ error: 'client_creation_failed' }, { status: 500 }),
    }
  }
}

async function fetchCandidatesForGuest(
  supabaseFallback: ReturnType<typeof createServiceClient>,
  businessId: string,
  phone: string | null | undefined,
  email: string | null | undefined,
): Promise<ClientCandidate[]> {
  return (await tryDrizzle(
    () => db.query.clients.findMany({ where: eq(clients.businessId, businessId) }),
    async (): Promise<unknown> => {
      try {
        const orParts: string[] = []
        if (phone) orParts.push(`phone.eq.${phone}`)
        if (email) orParts.push(`email.eq.${email}`)
        const orStr = orParts.join(',')
        const chain = supabaseFallback.from('clients') as unknown as Record<string, unknown>
        const sel = (chain as unknown as { select: (s: string) => unknown }).select(
          'id, name, email, telegram_id, viber_user_id, phone',
        ) as unknown as Record<string, unknown>
        const eqRes = (sel as unknown as { eq: (...a: unknown[]) => unknown }).eq?.(
          'business_id',
          businessId,
        ) as unknown as Record<string, unknown>
        if (eqRes && typeof (eqRes as Record<string, unknown>).or === 'function') {
          const orRes = (eqRes as unknown as { or: (s: string) => unknown }).or(
            orStr,
          ) as unknown as Record<string, unknown>
          const lim = (
            orRes as unknown as { limit: (n: number) => Promise<{ data: unknown }> }
          )?.limit?.(10) as unknown as Promise<{ data: unknown }>
          if (lim && typeof lim.then === 'function') {
            const r = await lim
            if (r && 'data' in r && Array.isArray(r.data))
              return (r.data as Array<Record<string, unknown>>).map((d) => ({
                id: d.id as string,
                name: d.name as string,
                email: d.email as string | null,
                telegramId: d.telegram_id as string | null,
                viberUserId: d.viber_user_id as string | null,
                phone: d.phone as string | null,
                userId: null,
              })) as unknown as ClientCandidate[]
          }
        }
      } catch {}
      return [] as unknown as ClientCandidate[]
    },
  )) as ClientCandidate[]
}

async function handleGuestExisting(
  existing: ClientCandidate,
  name: string,
  email: string | null | undefined,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<{ clientId: string; hasTelegram: boolean; hasViber: boolean }> {
  const updates: Record<string, unknown> = {}
  if (name && name !== existing.name) (updates as Record<string, string>).name = name
  if (email && email !== existing.email) (updates as Record<string, string>).email = email
  if (Object.keys(updates).length > 0) {
    await tryDrizzle(
      (() =>
        db
          .update(clients)
          .set(updates as unknown as never)
          .where(eq(clients.id, existing.id))) as unknown as () => Promise<unknown>,
      async (): Promise<unknown> => {
        await supabaseFallback
          .from('clients')
          .update(updates as unknown as never)
          .eq('id', existing.id)
        return null
      },
    )
  }
  return {
    clientId: existing.id,
    hasTelegram: !!existing.telegramId,
    hasViber: !!existing.viberUserId,
  }
}

async function createGuestClient(
  businessId: string,
  name: string,
  phone: string | null | undefined,
  email: string | null | undefined,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<string | null> {
  const [newClient] = (await tryDrizzle(
    () =>
      db
        .insert(clients)
        .values({ businessId, name, phone: phone || null, email: email || null })
        .returning({ id: clients.id }),
    async (): Promise<Array<{ id: string }>> => {
      const { data } = await supabaseFallback
        .from('clients')
        .insert({ business_id: businessId, name, phone: phone || null, email: email || null })
        .select('id')
        .single()
      return [{ id: (data as unknown as { id: string }).id }] as Array<{ id: string }>
    },
  )) as Array<{ id: string }>
  return newClient?.id ?? null
}

async function resolveClient(params: {
  businessId: string
  name: string
  phone: string | null | undefined
  email: string | null | undefined
  authUser: { id: string; email: string | null } | null
  supabaseFallback: ReturnType<typeof createServiceClient>
}): Promise<{
  clientId: string | null
  hasTelegram: boolean
  hasViber: boolean
  error?: NextResponse
}> {
  const { businessId, name, phone, email, authUser, supabaseFallback } = params
  if (!phone && !email) return { clientId: null, hasTelegram: false, hasViber: false }
  if (authUser) {
    const linked = await findLinkedClient(supabaseFallback, businessId, authUser.id)
    if (linked) {
      await updateLinkedClient(linked, name, phone, email, supabaseFallback)
      return {
        clientId: linked.id,
        hasTelegram: !!linked.telegramId,
        hasViber: !!linked.viberUserId,
      }
    }
    return handleAuthClaimFlow(businessId, name, phone, email, authUser.id, supabaseFallback)
  }
  const candidates = await fetchCandidatesForGuest(supabaseFallback, businessId, phone, email)
  const existing =
    candidates.find((c) => (phone && c.phone === phone) || (email && c.email === email)) ?? null
  if (existing) return handleGuestExisting(existing, name, email, supabaseFallback)
  try {
    const newId = await createGuestClient(businessId, name, phone, email, supabaseFallback)
    if (newId) return { clientId: newId, hasTelegram: false, hasViber: false }
    // Preserve old behavior: allow null clientId when insert returns no id (e.g., mock returns empty)
    return { clientId: null, hasTelegram: false, hasViber: false }
  } catch {
    return {
      clientId: null,
      hasTelegram: false,
      hasViber: false,
      error: NextResponse.json({ error: 'client_creation_failed' }, { status: 500 }),
    }
  }
}

// ── Loyalty helpers ─────────────────────────────────────────────────────

async function checkMembershipEligibility(
  clientId: string,
  membership_id: string,
  businessId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<NextResponse | null> {
  try {
    const { isEligible } = await import('@/lib/memberships')
    const cm = (await tryDrizzle(
      () =>
        db.query.clientMemberships.findFirst({
          where: and(
            eq(clientMemberships.id, membership_id),
            eq(clientMemberships.clientId, clientId),
            eq(clientMemberships.businessId, businessId),
          ),
        }),
      async (): Promise<unknown> => {
        const { data } = await supabaseFallback
          .from('client_memberships')
          .select('remaining, expires_at, status')
          .eq('id', membership_id)
          .eq('client_id', clientId)
          .eq('business_id', businessId)
          .maybeSingle()
        return data as unknown as { remaining: number; expires_at: string; status: string } | null
      },
    )) as { remaining: number; expires_at: string; status: string } | null
    if (!cm) return NextResponse.json({ error: 'membership_not_found' }, { status: 404 })
    if (!isEligible(cm as { remaining: number; expires_at: string; status: string })) {
      const r = (cm as { remaining: number }).remaining <= 0 ? 'no_uses_left' : 'membership_expired'
      return NextResponse.json(
        { error: r, message: r === 'no_uses_left' ? 'Membresía sin usos' : 'Membresía expirada' },
        { status: 409 },
      )
    }
    return null
  } catch {
    return NextResponse.json({ error: 'membership_check_failed' }, { status: 500 })
  }
}

async function checkPromoEligibility(
  clientId: string,
  promo_code: string,
  serviceId: string,
  date: string,
  amount: number,
  businessId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<NextResponse | null> {
  try {
    const { evaluatePromotion } = await import('@/lib/promotions')
    const promo = (await tryDrizzle(
      () =>
        db.query.promotions.findFirst({
          where: and(
            eq(promotions.businessId, businessId),
            eq(promotions.promoCode, promo_code.toUpperCase()),
          ),
        }),
      async (): Promise<unknown> => {
        const { data } = await supabaseFallback
          .from('promotions')
          .select(
            'id, type, value, promo_code, valid_from, valid_to, rules, is_active, business_id, location_id',
          )
          .eq('business_id', businessId)
          .eq('promo_code', promo_code.toUpperCase())
          .maybeSingle()
        return data as unknown as Parameters<typeof evaluatePromotion>[0] | null
      },
    )) as Parameters<typeof evaluatePromotion>[0] | null
    if (!promo) return NextResponse.json({ error: 'promo_not_found' }, { status: 404 })
    const c = (await tryDrizzle(
      () => db.query.clients.findFirst({ where: eq(clients.id, clientId) }),
      async (): Promise<unknown> => {
        const { data } = await supabaseFallback
          .from('clients')
          .select('birthday, tags, last_visit_at, total_visits')
          .eq('id', clientId)
          .maybeSingle()
        return data as unknown as Parameters<typeof evaluatePromotion>[1]['client'] | null
      },
    )) as Parameters<typeof evaluatePromotion>[1]['client'] | null
    const evalRes = evaluatePromotion(promo as Parameters<typeof evaluatePromotion>[0], {
      date,
      serviceIds: [serviceId],
      client: c ?? null,
      amount,
      now: new Date(),
      promoCode: promo_code,
    })
    if (!evalRes.eligible)
      return NextResponse.json(
        { error: 'promo_not_eligible', reason: evalRes.reason },
        { status: 409 },
      )
    return null
  } catch {
    return NextResponse.json({ error: 'promo_check_failed' }, { status: 500 })
  }
}

async function checkLoyaltyPoints(
  clientId: string,
  loyalty_redeem_points: number,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<NextResponse | null> {
  try {
    const { getBalance, canRedeem } = await import('@/lib/loyalty')
    const bal = await getBalance(
      supabaseFallback as unknown as Parameters<typeof getBalance>[0],
      clientId,
    )
    if (!canRedeem(bal, Number(loyalty_redeem_points)))
      return NextResponse.json({ error: 'insufficient_points', balance: bal }, { status: 409 })
    return null
  } catch (e) {
    const err = e as Error & { code?: string }
    if (String(err.message).includes('insufficient'))
      return NextResponse.json({ error: 'insufficient_points' }, { status: 409 })
    return NextResponse.json({ error: 'loyalty_check_failed' }, { status: 500 })
  }
}

async function validateLoyaltyBenefits(params: {
  clientId: string | null
  membership_id: string | null | undefined
  promo_code: string | null | undefined
  loyalty_redeem_points: number | null | undefined
  serviceId: string
  date: string
  businessId: string
  servicePrice: string | number
  supabaseFallback: ReturnType<typeof createServiceClient>
}): Promise<NextResponse | null> {
  const {
    clientId,
    membership_id,
    promo_code,
    loyalty_redeem_points,
    serviceId,
    date,
    businessId,
    servicePrice,
    supabaseFallback,
  } = params
  if (!clientId) return null
  if (membership_id)
    return checkMembershipEligibility(clientId, membership_id, businessId, supabaseFallback)
  if (promo_code)
    return checkPromoEligibility(
      clientId,
      promo_code,
      serviceId,
      date,
      Number(servicePrice),
      businessId,
      supabaseFallback,
    )
  if (loyalty_redeem_points && loyalty_redeem_points > 0)
    return checkLoyaltyPoints(clientId, loyalty_redeem_points, supabaseFallback)
  return null
}

function validateTimeConstraints(
  startsAt: Date,
  minAdvance: number,
  leadEnabled: boolean,
): NextResponse | null {
  const now = new Date()
  if (isPastInTz(startsAt, now))
    return NextResponse.json(
      {
        error: 'in_past',
        message: 'No se puede reservar en el pasado. Elegí una fecha y hora futuras.',
      },
      { status: 400 },
    )
  if (isTooSoonInTz(startsAt, now, minAdvance, leadEnabled))
    return NextResponse.json(
      { error: 'too_soon', message: `Reservá con al menos ${minAdvance} minutos de anticipación.` },
      { status: 400 },
    )
  return null
}

function mapBookingInsertError(msg: string, minAdvance: number): NextResponse {
  if (msg.includes('no_staff_available'))
    return NextResponse.json(
      {
        error: 'no_staff_available',
        message:
          'This business has no staff available to take bookings right now. Please contact them directly.',
        suggest_waitlist: true,
      },
      { status: 409 },
    )
  if (msg.includes('slot_already_booked'))
    return NextResponse.json(
      {
        error: 'slot_taken',
        message: 'This time slot was just taken. Please choose another time.',
      },
      { status: 409 },
    )
  if (msg.includes('barber_not_qualified'))
    return NextResponse.json(
      {
        error: 'barber_not_qualified',
        message:
          'Selected barber cannot perform this service. Please choose another barber or service.',
      },
      { status: 400 },
    )
  if (msg.includes('barber_unavailable'))
    return NextResponse.json(
      {
        error: 'barber_unavailable',
        message:
          'Selected barber is on vacation or break at that time. Please choose another time or barber.',
      },
      { status: 409 },
    )
  if (msg.includes('barber_inactive'))
    return NextResponse.json(
      {
        error: 'barber_inactive',
        message: 'Selected barber is inactive. Please choose another barber.',
      },
      { status: 400 },
    )
  if (msg.includes('outside_availability')) {
    const reason = msg.includes('closed')
      ? 'closed'
      : msg.includes('break')
        ? 'break'
        : 'outside_hours'
    const messages: Record<string, string> = {
      closed: 'This business is closed at the selected date. Please choose another day.',
      outside_hours: 'This time is outside business hours. Please choose another time.',
      break: 'This time falls during a break. Please choose another time.',
    }
    return NextResponse.json(
      { error: 'outside_availability', reason, message: messages[reason] },
      { status: 400 },
    )
  }
  if (msg.includes('in_past') || msg.includes('too_soon')) {
    const isPast = msg.includes('in_past')
    return NextResponse.json(
      {
        error: isPast ? 'in_past' : 'too_soon',
        message: isPast
          ? 'No se puede reservar en el pasado.'
          : `Reservá con al menos ${minAdvance} minutos de anticipación.`,
      },
      { status: 400 },
    )
  }
  return NextResponse.json({ error: 'booking_failed' }, { status: 500 })
}

async function createAppointment(params: {
  businessId: string
  location_id: string | null
  clientId: string | null
  employeeId: string | null | undefined
  serviceId: string
  startsAt: Date
  endsAt: Date
  price: string | number
  source: string | null
  campaign_id: string | null
  minAdvance: number
  deposit_amount?: number | null
  payment_status?: string | null
  guest_name?: string | null
  tip_amount?: number | null
  supabaseFallback: ReturnType<typeof createServiceClient>
}): Promise<{ apptId?: string; error?: NextResponse }> {
  const checkinCode = generateCheckinCode()
  const deposit =
    typeof params.deposit_amount === 'number' && params.deposit_amount > 0
      ? Math.floor(params.deposit_amount)
      : 0
  const pStatus = deposit > 0 ? 'deposit_paid' : (params.payment_status ?? 'unpaid')
  const guest = params.guest_name ? sanitize(params.guest_name).slice(0, 80) : null
  // tip_amount stub: validated but not charged; stored via appointments.notes suffix if needed, no financial side-effect V1
  try {
    const apptRes = (await tryDrizzle(
      () =>
        db
          .insert(appointments)
          .values({
            businessId: params.businessId,
            locationId: params.location_id ?? null,
            clientId: params.clientId,
            employeeId: params.employeeId ?? null,
            serviceId: params.serviceId,
            startsAt: params.startsAt.toISOString() as unknown as string,
            endsAt: params.endsAt.toISOString() as unknown as string,
            price: params.price as unknown as string,
            status: 'confirmed',
            source: params.campaign_id ? 'campaign' : ((params.source as string) ?? 'online'),
            campaignId: params.campaign_id ?? null,
            checkinCode,
            depositAmount: deposit,
            paymentStatus: pStatus,
            guestName: guest,
          } as unknown as typeof appointments.$inferInsert)
          .returning({ id: appointments.id }),
      async (): Promise<unknown> => {
        const { data, error } = await params.supabaseFallback
          .from('appointments')
          .insert({
            business_id: params.businessId,
            location_id: params.location_id ?? null,
            client_id: params.clientId,
            employee_id: params.employeeId ?? null,
            service_id: params.serviceId,
            starts_at: params.startsAt.toISOString(),
            ends_at: params.endsAt.toISOString(),
            price: params.price,
            status: 'confirmed',
            source: params.campaign_id ? 'campaign' : ((params.source as string) ?? 'online'),
            campaign_id: params.campaign_id ?? null,
            checkin_code: checkinCode,
            deposit_amount: deposit,
            payment_status: pStatus,
            guest_name: guest,
          } as never)
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        return [{ id: (data as unknown as { id: string }).id }] as unknown as Array<{ id: string }>
      },
    )) as Array<{ id: string }>
    const appt = apptRes[0]
    const apptId = appt?.id ?? null
    if (!apptId) return { error: NextResponse.json({ error: 'booking_failed' }, { status: 500 }) }
    return { apptId }
  } catch (e) {
    const msg = (e as Error).message ?? ''
    return { error: mapBookingInsertError(msg, params.minAdvance) }
  }
}

async function consumeMembershipIfNeeded(
  clientId: string | null,
  membership_id: string | null | undefined,
  apptId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<NextResponse | null> {
  if (!clientId || !membership_id || !apptId) return null
  try {
    const { consumeMembership } = await import('@/lib/memberships')
    await consumeMembership(
      supabaseFallback as unknown as Parameters<typeof consumeMembership>[0],
      membership_id,
    )
    return null
  } catch (e) {
    const err = e as Error & { code?: string }
    await tryDrizzle(
      (() =>
        db
          .delete(appointments)
          .where(eq(appointments.id, apptId))) as unknown as () => Promise<unknown>,
      async (): Promise<unknown> => {
        await supabaseFallback.from('appointments').delete().eq('id', apptId)
        return null
      },
    )
    if (err.code === 'no_uses_left')
      return NextResponse.json(
        { error: 'no_uses_left', message: 'Membresía sin usos restantes' },
        { status: 409 },
      )
    if (err.code === 'membership_expired')
      return NextResponse.json(
        { error: 'membership_expired', message: 'Membresía expirada' },
        { status: 409 },
      )
    return NextResponse.json(
      { error: 'membership_consume_failed', message: err.message },
      { status: 409 },
    )
  }
}

async function attributeCampaignIfNeeded(
  clientId: string | null,
  campaign_id: string | null,
  source: string | null,
  businessId: string,
  supabaseFallback: ReturnType<typeof createServiceClient>,
): Promise<void> {
  if (!clientId || !(campaign_id || source === 'campaign' || source === 'campaign_auto')) return
  try {
    const { attributeRebooking } = await import('@/lib/campaigns')
    await attributeRebooking(
      supabaseFallback as unknown as Parameters<typeof attributeRebooking>[0],
      { clientId, businessId, campaignId: campaign_id ?? null },
    )
  } catch {}
}

function triggerEmailConfirm(apptId: string, email: string | null | undefined): void {
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
        void text
      }
    })
    .catch(() => {})
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(ip, { limit: 20, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BookingSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const {
    businessId,
    serviceId,
    employeeId,
    date,
    time,
    phone,
    email,
    membership_id,
    promo_code,
    loyalty_redeem_points,
  } = parsed.data
  const location_id = (parsed.data as { location_id?: string | null }).location_id ?? null
  const source = (parsed.data as { source?: string | null }).source ?? 'online'
  const campaign_id = (parsed.data as { campaign_id?: string | null }).campaign_id ?? null
  const tip_amount = (parsed.data as { tip_amount?: number | null }).tip_amount ?? null
  const deposit_amount = (parsed.data as { deposit_amount?: number | null }).deposit_amount ?? null
  const guest_name = (parsed.data as { guest_name?: string | null }).guest_name ?? null
  const name = sanitize(parsed.data.name)

  const stackErr = checkPromoStack(membership_id, promo_code, loyalty_redeem_points)
  if (stackErr) return stackErr
  const contactErr = checkContactRequired(phone, email)
  if (contactErr) return contactErr

  const supabaseFallback = createServiceClient()
  const { service, biz } = await fetchServiceAndBiz(serviceId, businessId, supabaseFallback)
  if (!service) return NextResponse.json({ error: 'service_not_found' }, { status: 404 })
  const timezone = biz?.timezone ?? 'UTC'
  const minAdvance = biz?.minAdvanceMinutes ?? DEFAULT_LEAD_MINUTES
  const leadEnabled = biz?.bookingLeadTimeEnabled ?? true
  const allowGuest = biz?.allowGuestBookings ?? true

  const authUser = await fetchAuthUser()
  const guestErr = checkGuestAllowed(allowGuest, authUser)
  if (guestErr) return guestErr

  const locFlowErr = await validateLocationFlow(
    service,
    location_id,
    employeeId,
    businessId,
    supabaseFallback,
  )
  if (locFlowErr) return locFlowErr

  const businessHoursRows = await fetchBusinessHours(businessId, supabaseFallback)
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

  const holidayRows = await fetchHolidays(businessId, date, supabaseFallback)
  const holidaysMapped = holidayRows.map((h) => ({
    date: typeof h.date === 'string' ? h.date.slice(0, 10) : String(h.date),
    is_open: h.isOpen,
    location_id: h.locationId,
  }))
  const holidayErr = checkHolidayBlock(
    holidaysMapped as unknown as { date: string; is_open: boolean; location_id: string | null }[],
    date,
    location_id,
  )
  if (holidayErr) return holidayErr
  const slotErr = checkSlotOk(
    dayHours,
    time,
    service.durationMin ?? 30,
    date,
    holidaysMapped as unknown as import('@/lib/booking-availability').HolidayCheck[],
  )
  if (slotErr) return slotErr

  const clientRes = await resolveClient({
    businessId,
    name,
    phone,
    email,
    authUser,
    supabaseFallback,
  })
  if (clientRes.error) return clientRes.error
  const { clientId, hasTelegram, hasViber } = clientRes

  const loyaltyErr = await validateLoyaltyBenefits({
    clientId,
    membership_id,
    promo_code,
    loyalty_redeem_points,
    serviceId,
    date,
    businessId,
    servicePrice: service.price,
    supabaseFallback,
  })
  if (loyaltyErr) return loyaltyErr

  const startsAt = parseDateTimeInTz(date, time, timezone)
  const endsAt = new Date(startsAt.getTime() + (service.durationMin ?? 30) * 60_000)
  const timeErr = validateTimeConstraints(startsAt, minAdvance, leadEnabled)
  if (timeErr) return timeErr

  const apptRes = await createAppointment({
    businessId,
    location_id,
    clientId,
    employeeId,
    serviceId,
    startsAt,
    endsAt,
    price: service.price,
    source,
    campaign_id,
    minAdvance,
    deposit_amount: deposit_amount ?? null,
    guest_name: guest_name ?? null,
    tip_amount: tip_amount ?? null,
    supabaseFallback,
  })
  if (apptRes.error) return apptRes.error
  const apptId = apptRes.apptId!
  if (!apptId) return NextResponse.json({ error: 'booking_failed' }, { status: 500 })

  const consumeErr = await consumeMembershipIfNeeded(
    clientId,
    membership_id,
    apptId,
    supabaseFallback,
  )
  if (consumeErr) return consumeErr

  await attributeCampaignIfNeeded(clientId, campaign_id, source, businessId, supabaseFallback)
  triggerEmailConfirm(apptId, email)
  return NextResponse.json({ appointmentId: apptId, clientId, hasTelegram, hasViber })
}
