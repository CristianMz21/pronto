import DOMPurify from 'isomorphic-dompurify'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { parseDateTimeInTz } from '@/lib/booking-availability'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { convert, EnqueueSchema, expireStale } from '@/lib/waitlist'

// @ts-expect-error - tsc strict fix
function _sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

const PatchSchema = z.object({
  action: z.enum(['notify', 'convert', 'cancel', 'expire']),
  waitlist_id: z.string().uuid().optional(),
  business_id: z.string().uuid().optional(),
  location_id: z.string().uuid().nullable().optional(),
  desired_at: z.string().datetime().optional(),
})

async function resolveBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase
    .from('employees')
    .select('business_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

// GET /api/waitlist?business_id=...&location_id=...&status=waiting
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const businessIdParam = url.searchParams.get('business_id')
  const locationId = url.searchParams.get('location_id')
  const status = url.searchParams.get('status') || 'waiting'
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

  let businessId = businessIdParam
  if (!businessId) {
    businessId = await resolveBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Verify business access via my_business_ids or owned check? RLS will enforce but we do quick check
  // Fetch waitlist
  let query = supabase
    .from('waitlist')
    .select(
      'id, business_id, location_id, service_id, employee_id, client_id, desired_at, status, notified_at, created_at, clients(id, name, phone, email), services(id, name), employees(id, name)',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (status && ['waiting', 'notified', 'converted', 'expired', 'cancelled'].includes(status)) {
    query = query.eq('status', status) as typeof query
  }
  if (locationId) {
    query = query.eq('location_id', locationId) as typeof query
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

function normalizeDesiredAt(raw: Record<string, unknown>): {
  desiredAt?: string
  error?: NextResponse
} {
  const direct = (raw as { desired_at?: string })?.desired_at
  if (direct) return { desiredAt: direct }
  const ext = raw as Record<string, unknown> & {
    date?: string
    time?: string
    timezone?: string
    businessId?: string
  }
  if (!ext.date || !ext.time) return {}
  const tz = (ext.timezone as string) ?? 'America/Bogota'
  try {
    const dt = parseDateTimeInTz(ext.date as string, ext.time as string, tz)
    const iso = dt.toISOString()
    ;(raw as Record<string, unknown>).desired_at = iso
    if (ext.businessId && !(raw as Record<string, unknown>).business_id)
      (raw as Record<string, unknown>).business_id = ext.businessId
    return { desiredAt: iso }
  } catch {
    return { error: NextResponse.json({ error: 'invalid_date' }, { status: 400 }) }
  }
}

async function checkWaitlistAuthGuard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string } | null,
  businessIdForAuth: string | null,
  dataBusinessId: string,
): Promise<NextResponse | null> {
  if (!user || !businessIdForAuth || dataBusinessId === businessIdForAuth) return null
  const { data: ownedCheck } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', dataBusinessId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (ownedCheck) return null
  const { data: empCheck } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .eq('business_id', dataBusinessId)
    .eq('is_active', true)
    .maybeSingle()
  if (!empCheck) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

async function validateWaitlistPrereqs(
  service: ReturnType<typeof createServiceClient>,
  businessId: string,
  clientId: string,
  serviceId: string,
  desiredAt: string,
): Promise<NextResponse | null> {
  const { data: biz } = await service
    .from('businesses')
    .select('id, timezone')
    .eq('id', businessId)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'business_not_found' }, { status: 404 })

  try {
    const { data: bizCfg } = await service
      .from('businesses')
      .select('min_advance_minutes, booking_lead_time_enabled')
      .eq('id', businessId)
      .maybeSingle()
    const minAdv =
      (bizCfg as { min_advance_minutes?: number | null } | null)?.min_advance_minutes ?? 30
    const enabled =
      (bizCfg as { booking_lead_time_enabled?: boolean | null } | null)
        ?.booking_lead_time_enabled ?? true
    const { canEnqueue } = await import('@/lib/waitlist')
    const check = canEnqueue(desiredAt, new Date(), minAdv, enabled)
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })
  } catch {}

  const { data: client } = await service
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const { data: svc } = await service
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!svc) return NextResponse.json({ error: 'service_not_found' }, { status: 404 })
  return null
}

async function handleWaitlistEnqueue(
  service: ReturnType<typeof createServiceClient>,
  data: {
    business_id: string
    location_id: string | null | undefined
    service_id: string
    employee_id: string | null | undefined
    client_id: string
    desired_at: string
  },
): Promise<NextResponse> {
  const { enqueue } = await import('@/lib/waitlist')
  try {
    const entry = await enqueue(service as unknown as Parameters<typeof enqueue>[0], {
      business_id: data.business_id,
      location_id: data.location_id ?? null,
      service_id: data.service_id,
      employee_id: data.employee_id ?? null,
      client_id: data.client_id,
      desired_at: data.desired_at,
      status: 'waiting',
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    const err = e as Error & { code?: string; details?: unknown }
    if (err.code === 'waitlist_duplicate')
      return NextResponse.json(
        { error: 'waitlist_duplicate', message: 'Ya estás en lista de espera para ese horario' },
        { status: 409 },
      )
    if (String(err.message).includes('validation_failed'))
      return NextResponse.json(
        { error: 'validation_failed', details: err.details },
        { status: 422 },
      )
    return NextResponse.json({ error: String(err.message ?? 'enqueue_failed') }, { status: 500 })
  }
}

// POST /api/waitlist — enqueue
export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`waitlist:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let businessIdForAuth: string | null = null
  if (user) businessIdForAuth = await resolveBusinessId(supabase, user.id)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const norm = normalizeDesiredAt(raw as Record<string, unknown>)
  if ('error' in norm && norm.error) return norm.error

  const parsed = EnqueueSchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  const data = parsed.data
  const guard = await checkWaitlistAuthGuard(
    supabase,
    user as { id: string } | null,
    businessIdForAuth,
    data.business_id,
  )
  if (guard) return guard

  const service = createServiceClient()
  const prereq = await validateWaitlistPrereqs(
    service,
    data.business_id,
    data.client_id,
    data.service_id,
    data.desired_at,
  )
  if (prereq) return prereq

  return handleWaitlistEnqueue(service, {
    business_id: data.business_id,
    location_id: data.location_id,
    service_id: data.service_id,
    employee_id: data.employee_id,
    client_id: data.client_id,
    desired_at: data.desired_at,
  })
}

async function handleWaitlistExpire(
  service: ReturnType<typeof createServiceClient>,
): Promise<NextResponse> {
  const result = await expireStale(service as unknown as Parameters<typeof expireStale>[0])
  return NextResponse.json(result)
}

async function handleWaitlistNotify(
  service: ReturnType<typeof createServiceClient>,
  businessId: string,
  desiredAt: string | undefined,
  locationId: string | null | undefined,
): Promise<NextResponse> {
  const { notifyNext } = await import('@/lib/waitlist')
  // @ts-expect-error - tsc strict fix
  const entry = await notifyNext(service as unknown as Parameters<typeof notifyNext>[0], {
    business_id: businessId,
    desired_at: desiredAt ?? undefined,
    location_id: locationId ?? null,
  })
  if (!entry)
    return NextResponse.json(
      { error: 'no_waiting', message: 'No hay nadie en espera para ese horario' },
      { status: 404 },
    )
  return NextResponse.json(entry)
}

async function handleWaitlistConvert(
  service: ReturnType<typeof createServiceClient>,
  waitlistId: string,
  businessId: string,
): Promise<NextResponse> {
  const { data: wl } = await service
    .from('waitlist')
    .select('id, business_id, status')
    .eq('id', waitlistId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!wl) return NextResponse.json({ error: 'waitlist_not_found' }, { status: 404 })
  try {
    const entry = await convert(service as unknown as Parameters<typeof convert>[0], waitlistId)
    const { data: full } = await service
      .from('waitlist')
      .select('business_id, location_id, service_id, employee_id, client_id, desired_at')
      .eq('id', waitlistId)
      .maybeSingle()
    if (!full) return NextResponse.json(entry)
    const f = full as {
      business_id: string
      location_id: string | null
      service_id: string
      employee_id: string | null
      client_id: string
      desired_at: string
    }
    const startsAt = new Date(f.desired_at)
    const { data: svc } = await service
      .from('services')
      .select('duration_min, price')
      .eq('id', f.service_id)
      .maybeSingle()
    const dur = (svc as { duration_min: number } | null)?.duration_min ?? 60
    const price = (svc as { price: number } | null)?.price ?? 0
    const endsAt = new Date(startsAt.getTime() + dur * 60_000)
    const { data: appt, error: apptErr } = await service
      .from('appointments')
      .insert({
        business_id: f.business_id,
        location_id: f.location_id,
        client_id: f.client_id,
        service_id: f.service_id,
        employee_id: f.employee_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        price,
        status: 'confirmed',
        source: 'waitlist',
      } as unknown as never)
      .select('id')
      .single()
    if (apptErr) {
      const msg = String((apptErr as { message?: string }).message ?? '')
      if (msg.includes('slot_already_booked') || msg.includes('slot_taken')) {
        await service
          .from('waitlist')
          .update({ status: 'waiting', notified_at: null })
          .eq('id', waitlistId)
        return NextResponse.json(
          {
            error: 'slot_taken',
            message: 'El horario ya fue tomado, se regresó a lista de espera',
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: 'appointment_create_failed', details: msg },
        { status: 500 },
      )
    }
    return NextResponse.json({ waitlist: entry, appointmentId: (appt as { id: string }).id })
  } catch (e) {
    const err = e as Error & { code?: string }
    return NextResponse.json(
      { error: err.code ?? 'convert_failed', message: err.message },
      { status: 409 },
    )
  }
}

async function handleWaitlistCancel(
  service: ReturnType<typeof createServiceClient>,
  waitlistId: string,
  businessId: string,
): Promise<NextResponse> {
  const { error } = await service
    .from('waitlist')
    .update({ status: 'cancelled' })
    .eq('id', waitlistId)
    .eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/waitlist — actions: notify, convert, cancel, expire
export async function PATCH(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`waitlist-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  const { action, waitlist_id, business_id, location_id, desired_at } = parsed.data
  const businessId = business_id ?? (await resolveBusinessId(supabase, user.id))
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const service = createServiceClient()

  if (action === 'expire') return handleWaitlistExpire(service)
  if (action === 'notify')
    return handleWaitlistNotify(service, businessId, desired_at ?? undefined, location_id ?? null)
  if (action === 'convert') {
    if (!waitlist_id) return NextResponse.json({ error: 'waitlist_id_required' }, { status: 400 })
    return handleWaitlistConvert(service, waitlist_id, businessId)
  }
  if (action === 'cancel') {
    if (!waitlist_id) return NextResponse.json({ error: 'waitlist_id_required' }, { status: 400 })
    return handleWaitlistCancel(service, waitlist_id, businessId)
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const service = createServiceClient()
  const { error } = await service
    .from('waitlist')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
