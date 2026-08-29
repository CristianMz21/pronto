import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
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

async function resolveTimezone(businessId: string): Promise<string> {
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
  let businessId = businessIdParam ?? (await resolveBusinessId(supabase, user.id))
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

// POST /api/recurring — create series with occurrences
export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`recurring:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

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

  // Normalize business_id if passed as businessId, and allow date+time alternative
  const rawObj = raw as Record<string, unknown>
  if (rawObj.businessId && !rawObj.business_id) rawObj.business_id = rawObj.businessId
  if (rawObj.clientId && !rawObj.client_id) rawObj.client_id = rawObj.clientId
  if (rawObj.serviceId && !rawObj.service_id) rawObj.service_id = rawObj.serviceId

  const parsed = RecurringCreateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const data = parsed.data

  // Resolve businessId from auth if not provided? Must be provided; but check access
  const authBusinessId = await resolveBusinessId(supabase, user.id)
  if (!authBusinessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // Allow creation only for own business (or if user is employee of that business)
  if (data.business_id !== authBusinessId) {
    const { data: ownedCheck } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', data.business_id)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!ownedCheck) {
      const { data: empCheck } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .eq('business_id', data.business_id)
        .eq('is_active', true)
        .maybeSingle()
      if (!empCheck) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  // Validate location belongs to business
  if (data.location_id) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', data.location_id)
      .eq('business_id', data.business_id)
      .maybeSingle()
    if (!loc) return NextResponse.json({ error: 'location_not_found' }, { status: 404 })
  }

  // Validate client/service/employee belong to business
  const service = createServiceClient()
  const [{ data: client }, { data: svc }, { data: biz }] = await Promise.all([
    service
      .from('clients')
      .select('id')
      .eq('id', data.client_id)
      .eq('business_id', data.business_id)
      .maybeSingle(),
    service
      .from('services')
      .select('id, duration_min, price')
      .eq('id', data.service_id)
      .eq('business_id', data.business_id)
      .maybeSingle(),
    service.from('businesses').select('timezone').eq('id', data.business_id).maybeSingle(),
  ])
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

  // Resolve dtstart: need a valid date for validation
  let dtstart: Date | null = null
  if (data.dtstart) dtstart = new Date(data.dtstart)
  else if (data.date && data.time) {
    const { parseDateTimeInTz } = await import('@/lib/booking-availability')
    try {
      dtstart = parseDateTimeInTz(data.date, data.time, timezone)
    } catch {
      return NextResponse.json({ error: 'invalid_dtstart' }, { status: 400 })
    }
  }
  if (!dtstart || isNaN(dtstart.getTime())) {
    return NextResponse.json(
      { error: 'dtstart_required', message: 'Se requiere dtstart o date+time para la recurrencia' },
      { status: 400 },
    )
  }
  if (dtstart.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'in_past', message: 'La fecha de inicio debe ser futura' },
      { status: 400 },
    )
  }

  // Validate RRULE synchronously
  const validated = validateRRule(data.rrule, dtstart, data.until ? new Date(data.until) : null)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.code, message: validated.reason }, { status: 422 })
  }

  // Use service client for createSeries (bypasses RLS, but auth already checked)
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
    const err = e as Error & { code?: string; details?: unknown }
    if (err.code === 'validation_failed')
      return NextResponse.json(
        { error: 'validation_failed', details: err.details },
        { status: 422 },
      )
    if (
      err.code === 'invalid_rrule' ||
      err.code === 'count_too_large' ||
      err.code === 'until_before_dtstart' ||
      err.code === 'no_occurrences' ||
      err.code === 'dtstart_required'
    ) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 422 })
    }
    return NextResponse.json(
      { error: err.code ?? 'recurring_failed', message: String(err.message ?? 'Unknown') },
      { status: 500 },
    )
  }
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
