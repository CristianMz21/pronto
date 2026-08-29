import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const DayHoursSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  is_open: z.boolean(),
  open_time: z.string().regex(/^\d{2}:\d{2}$/),
  close_time: z.string().regex(/^\d{2}:\d{2}$/),
  break_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('')),
  break_end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('')),
})

const BodySchema = z.object({
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
  hours: z.array(DayHoursSchema).min(1).max(7),
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

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const url = new URL(req.url)
  const locationId = url.searchParams.get('location_id')

  let query = supabase
    .from('business_hours')
    .select('day_of_week, is_open, open_time, close_time, break_start, break_end, location_id')
    .eq('business_id', businessId)
    .order('day_of_week')

  if (locationId) query = query.eq('location_id', locationId) as typeof query
  else query = query.is('location_id', null) as unknown as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PUT(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`business-hours:${ip}`, { limit: 30, windowMs: 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const body = parsed.data
  const locationId = body.location_id || null

  if (locationId) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', locationId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!loc) return NextResponse.json({ error: 'location_not_found' }, { status: 404 })
  }

  // Validate break inside open/close and start < end
  for (const h of body.hours) {
    if (h.break_start && h.break_end) {
      if (h.break_start >= h.break_end)
        return NextResponse.json(
          {
            error: 'validation_failed',
            details: { break: [`break_start must be < break_end for day ${h.day_of_week}`] },
          },
          { status: 422 },
        )
      if (h.break_start < h.open_time || h.break_end > h.close_time)
        return NextResponse.json(
          {
            error: 'validation_failed',
            details: { break: [`break outside open/close for day ${h.day_of_week}`] },
          },
          { status: 422 },
        )
    }
  }

  const rows = body.hours.map((h) => ({
    business_id: businessId,
    location_id: locationId,
    day_of_week: h.day_of_week,
    is_open: h.is_open,
    open_time: h.open_time,
    close_time: h.close_time,
    break_start: h.break_start || null,
    break_end: h.break_end || null,
  }))

  // Upsert: business_id + location_id + day_of_week
  const { error } = await supabase
    .from('business_hours')
    .upsert(rows, { onConflict: 'business_id,location_id,day_of_week' } as unknown as {
      onConflict: string
    })
  // Fallback if constraint not yet satisfied (location_id null handling)
  if (error) {
    // Try delete + insert for that location
    if (locationId)
      await supabase
        .from('business_hours')
        .delete()
        .eq('business_id', businessId)
        .eq('location_id', locationId)
    else
      await supabase
        .from('business_hours')
        .delete()
        .eq('business_id', businessId)
        .is('location_id', null)
    const { error: insErr } = await supabase.from('business_hours').insert(rows)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, location_id: locationId })
}

export async function PATCH(req: NextRequest) {
  return PUT(req)
}
