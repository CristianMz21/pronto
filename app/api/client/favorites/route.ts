import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { nextAvailability } from '@/lib/favorites'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const BodySchema = z.object({
  employee_id: z.string().uuid(),
})

async function resolveClient(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<{ clientId: string; businessId: string } | null> {
  const { data } = await service
    .from('clients')
    .select('id, business_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; business_id: string }
  return { clientId: row.id, businessId: row.business_id }
}

async function getBusinessHours(
  service: ReturnType<typeof createServiceClient>,
  businessId: string,
) {
  const { data } = await service
    .from('business_hours')
    .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
    .eq('business_id', businessId)
  return (
    (data as unknown as Array<{
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
  }))
}

async function getBookedSlotsForEmployee(
  service: ReturnType<typeof createServiceClient>,
  businessId: string,
  employeeId: string,
  dateStr: string,
): Promise<{ starts_at: string; ends_at: string }[]> {
  try {
    const { data } = await service.rpc(
      'get_booked_slots' as never,
      {
        p_business_id: businessId,
        p_date: dateStr,
        p_employee_id: employeeId,
      } as never,
    )
    return (data as unknown as { starts_at: string; ends_at: string }[] | null) ?? []
  } catch {
    // Fallback: query appointments directly for next 7 days
    const start = new Date().toISOString()
    const end = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await (
      service
        .from('appointments')
        .select('starts_at, ends_at')
        .eq('business_id', businessId)
        .eq('employee_id', employeeId) as unknown as {
        gte: (
          c: string,
          v: unknown,
        ) => { lt: (c: string, v: unknown) => Promise<{ data: unknown }> }
      }
    )
      .gte('starts_at', start)
      .lt('starts_at', end)
    return ((data as unknown as { starts_at: string; ends_at: string }[] | null) ?? []).filter(
      (a) => a.starts_at && a.ends_at,
    )
  }
}

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`fav-get:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const { data: favs, error } = await service
    .from('favorites')
    .select('client_id, employee_id, created_at, employees(id, name, avatar_url)')
    .eq('client_id', resolved.clientId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows =
    (favs as unknown as Array<{
      client_id: string
      employee_id: string
      created_at: string
      employees: { id: string; name: string; avatar_url: string | null } | null
    }>) ?? []

  // Compute nextAvailability for each favorite (if business_hours exists)
  const businessHours = await getBusinessHours(service, resolved.businessId)
  // For each favorite, fetch booked slots for today only + reuse (light)
  // To avoid N RPCs, fetch booked slots per employee for today date string
  const todayStr = new Date().toISOString().slice(0, 10)
  const enriched = await Promise.all(
    rows.map(async (f) => {
      let next: string | null = null
      try {
        const booked = await getBookedSlotsForEmployee(
          service,
          resolved.businessId,
          f.employee_id,
          todayStr,
        )
        // Use nextAvailability helper: it iterates 7 days from now
        next = nextAvailability({
          businessHours,
          bookedSlots: booked,
          timezone: 'America/Bogota',
          slotDurationMin: 30,
          fromDate: new Date(),
        })
      } catch {
        next = null
      }
      return {
        client_id: f.client_id,
        employee_id: f.employee_id,
        created_at: f.created_at,
        employee_name: f.employees?.name ?? null,
        employee_avatar: f.employees?.avatar_url ?? null,
        nextAvailability: next,
      }
    }),
  )

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`fav-post:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 })) {
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
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  // Verify employee belongs to business and is active
  const { data: emp } = await service
    .from('employees')
    .select('id')
    .eq('id', parsed.data.employee_id)
    .eq('business_id', resolved.businessId)
    .maybeSingle()
  if (!emp) return NextResponse.json({ error: 'employee_not_found' }, { status: 404 })

  // Check existing
  const { data: existing } = await service
    .from('favorites')
    .select('client_id')
    .eq('client_id', resolved.clientId)
    .eq('employee_id', parsed.data.employee_id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ ok: true, added: false, message: 'already_favorite' })
  }

  const { error } = await service
    .from('favorites')
    .insert({ client_id: resolved.clientId, employee_id: parsed.data.employee_id } as never)
  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('duplicate') || (error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, added: true })
    }
    return NextResponse.json({ error: 'insert_failed', message: msg }, { status: 500 })
  }

  // Compute nextAvailability for new favorite
  const businessHours = await getBusinessHours(service, resolved.businessId)
  const todayStr = new Date().toISOString().slice(0, 10)
  let next: string | null = null
  try {
    const booked = await getBookedSlotsForEmployee(
      service,
      resolved.businessId,
      parsed.data.employee_id,
      todayStr,
    )
    next = nextAvailability({
      businessHours,
      bookedSlots: booked,
      timezone: 'America/Bogota',
      slotDurationMin: 30,
      fromDate: new Date(),
    })
  } catch {
    next = null
  }

  return NextResponse.json({ ok: true, added: true, nextAvailability: next }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`fav-del:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let employeeId: string | null = new URL(req.url).searchParams.get('employee_id')
  if (!employeeId) {
    try {
      const b: unknown = await req.json()
      const parsed = BodySchema.safeParse(b)
      if (parsed.success) employeeId = parsed.data.employee_id
    } catch {}
  }
  if (!employeeId) return NextResponse.json({ error: 'employee_id_required' }, { status: 400 })
  const check = z.string().uuid().safeParse(employeeId)
  if (!check.success) return NextResponse.json({ error: 'invalid_employee_id' }, { status: 422 })

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const { error } = await service
    .from('favorites')
    .delete()
    .eq('client_id', resolved.clientId)
    .eq('employee_id', employeeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, removed: true })
}
