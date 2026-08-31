import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { RecurringCreateSchema, validateRRule } from '@/lib/recurring'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function resolveBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, timezone')
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

async function _resolveTimezone(businessId: string): Promise<string> {
  const service = createServiceClient()
  const { data } = await service
    .from('businesses')
    .select('timezone')
    .eq('id', businessId)
    .maybeSingle()
  return (data as { timezone?: string } | null)?.timezone ?? 'America/Bogota'
}

// GET /api/recurring?business_id=... — list series
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const businessIdParam = url.searchParams.get('business_id')
  const businessId = businessIdParam ?? (await resolveBusinessId(supabase, user.id))
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Verify access
  if (businessIdParam) {
    const { data: ownedCheck } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!ownedCheck) {
      const { data: empCheck } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .maybeSingle()
      if (!empCheck) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('recurring_appointments')
    .select(
      'id, business_id, location_id, client_id, service_id, employee_id, rrule, next_at, until, is_active, created_at, clients(id, name), services(id, name), employees(id, name)',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

async function checkRecurringBusinessAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  businessId: string,
): Promise<NextResponse | null> {
  const { data: ownedCheck } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (ownedCheck) return null
  const { data: empCheck } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle()
  if (!empCheck) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

async function validateRecurringLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  locationId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!locationId) return null
  const { data: loc } = await supabase
    .from('locations')
    .select('id')
    .eq('id', locationId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!loc) return NextResponse.json({ error: 'location_not_found' }, { status: 404 })
  return null
}

async function fetchRecurringPrereqs(
  service: ReturnType<typeof createServiceClient>,
  businessId: string,
  clientId: string,
  serviceId: string,
) {
  const [{ data: client }, { data: svc }, { data: biz }] = await Promise.all([
    service
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('business_id', businessId)
      .maybeSingle(),
    service
      .from('services')
      .select('id, duration_min, price')
      .eq('id', serviceId)
      .eq('business_id', businessId)
      .maybeSingle(),
    service.from('businesses').select('timezone').eq('id', businessId).maybeSingle(),
  ])
  return { client, svc, biz }
}

async function resolveDtstartForRecurring(
  data: {
    dtstart?: string | null | undefined
    date?: string | null | undefined
    time?: string | null | undefined
  },
  timezone: string,
): Promise<{ dtstart?: Date; error?: NextResponse }> {
  if (data.dtstart) {
    const d = new Date(data.dtstart)
    if (Number.isNaN(d.getTime()))
      return { error: NextResponse.json({ error: 'invalid_dtstart' }, { status: 400 }) }
    return { dtstart: d }
  }
  if (data.date && data.time) {
    const { parseDateTimeInTz } = await import('@/lib/booking-availability')
    try {
      return { dtstart: parseDateTimeInTz(data.date, data.time, timezone) }
    } catch {
      return { error: NextResponse.json({ error: 'invalid_dtstart' }, { status: 400 }) }
    }
  }
  return {
    error: NextResponse.json(
      { error: 'dtstart_required', message: 'Se requiere dtstart o date+time para la recurrencia' },
      { status: 400 },
    ),
  }
}

function mapRecurringCreateError(e: unknown): NextResponse {
  const err = e as Error & { code?: string; details?: unknown }
  if (err.code === 'validation_failed')
    return NextResponse.json({ error: 'validation_failed', details: err.details }, { status: 422 })
  if (
    err.code === 'invalid_rrule' ||
    err.code === 'count_too_large' ||
    err.code === 'until_before_dtstart' ||
    err.code === 'no_occurrences' ||
    err.code === 'dtstart_required'
  )
    return NextResponse.json({ error: err.code, message: err.message }, { status: 422 })
  return NextResponse.json(
    { error: err.code ?? 'recurring_failed', message: String(err.message ?? 'Unknown') },
    { status: 500 },
  )
}

function normalizeRecurringRaw(raw: Record<string, unknown>): void {
  if (raw.businessId && !raw.business_id) raw.business_id = raw.businessId
  if (raw.clientId && !raw.client_id) raw.client_id = raw.clientId
  if (raw.serviceId && !raw.service_id) raw.service_id = raw.serviceId
}

async function handleRecurringCreate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  service: ReturnType<typeof createServiceClient>,
  user: { id: string },
  raw: unknown,
): Promise<NextResponse> {
  const rawObj = raw as Record<string, unknown>
  normalizeRecurringRaw(rawObj)

  const parsed = RecurringCreateSchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const data = parsed.data

  const authBusinessId = await resolveBusinessId(supabase, user.id)
  if (!authBusinessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (data.business_id !== authBusinessId) {
    const accessErr = await checkRecurringBusinessAccess(supabase, user.id, data.business_id)
    if (accessErr) return accessErr
  }

  const locErr = await validateRecurringLocation(supabase, data.business_id, data.location_id)
  if (locErr) return locErr

  const { client, svc, biz } = await fetchRecurringPrereqs(
    service,
    data.business_id,
    data.client_id,
    data.service_id,
  )
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })
  if (!svc) return NextResponse.json({ error: 'service_not_found' }, { status: 404 })

  const timezone = (biz as { timezone?: string } | null)?.timezone ?? 'America/Bogota'
  const durationMin = (svc as { duration_min: number }).duration_min ?? 60
  const price = (svc as { price: number }).price ?? 0

  if (data.employee_id) {
    const { data: emp } = await service
      .from('employees')
      .select('id')
      .eq('id', data.employee_id)
      .eq('business_id', data.business_id)
      .maybeSingle()
    if (!emp) return NextResponse.json({ error: 'employee_not_found' }, { status: 404 })
  }

  const dtRes = await resolveDtstartForRecurring(data, timezone)
  if ('error' in dtRes && dtRes.error) return dtRes.error
  const dtstart = dtRes.dtstart!
  if (dtstart.getTime() <= Date.now())
    return NextResponse.json(
      { error: 'in_past', message: 'La fecha de inicio debe ser futura' },
      { status: 400 },
    )

  const validated = validateRRule(data.rrule, dtstart, data.until ? new Date(data.until) : null)
  if (!validated.ok)
    return NextResponse.json({ error: validated.code, message: validated.reason }, { status: 422 })

  const { createSeries } = await import('@/lib/recurring')
  try {
    const result = await createSeries(
      service as unknown as Parameters<typeof createSeries>[0],
      {
        business_id: data.business_id,
        location_id: data.location_id || null,
        client_id: data.client_id,
        service_id: data.service_id,
        employee_id: data.employee_id || null,
        rrule: data.rrule,
        dtstart: dtstart.toISOString(),
        until: data.until ?? null,
        count: data.count,
        timezone,
        duration_min: durationMin,
        price,
      } as unknown as Parameters<typeof createSeries>[1],
    )
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return mapRecurringCreateError(e)
  }
}

// POST /api/recurring — create series with occurrences
export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`recurring:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 }))
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
  const service = createServiceClient()
  return handleRecurringCreate(supabase, service, user, raw)
}

// PATCH /api/recurring — deactivate series { id, is_active }
export async function PATCH(req: NextRequest) {
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
  const schema = z.object({ id: z.string().uuid(), is_active: z.boolean() })
  const parsed = schema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data, error } = await supabase
    .from('recurring_appointments')
    .update({ is_active: parsed.data.is_active })
    .eq('id', parsed.data.id)
    .eq('business_id', businessId)
    .select('id, is_active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/recurring?id=xxx
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

  // Deactivate instead of hard delete to preserve history? But spec says delete.
  // We'll delete series and its future scheduled appointments
  const service = createServiceClient()
  // Verify ownership
  const { data: series } = await service
    .from('recurring_appointments')
    .select('id')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!series) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Delete future appointments linked to series (status scheduled/confirmed)
  await service
    .from('appointments')
    .delete()
    .eq('recurring_id', id)
    .eq('business_id', businessId)
    .in('status', ['scheduled', 'confirmed'] as unknown as never)

  const { error } = await service
    .from('recurring_appointments')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

void _resolveTimezone
