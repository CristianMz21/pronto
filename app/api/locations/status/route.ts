import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'

const QuerySchema = z.object({
  business_id: z.string().uuid().optional().nullable(),
  business_slug: z.string().min(2).max(64).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`loc-status:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    business_id: url.searchParams.get('business_id'),
    business_slug: url.searchParams.get('business_slug'),
    location_id: url.searchParams.get('location_id'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const service = createServiceClient()
  let businessId = parsed.data.business_id ?? null
  const locationId = parsed.data.location_id ?? null

  if (!businessId && parsed.data.business_slug) {
    const { data: biz } = await service
      .from('businesses')
      .select('id, timezone')
      .eq('slug', parsed.data.business_slug)
      .maybeSingle()
    if (biz) businessId = (biz as { id: string }).id
  }
  if (!businessId) {
    const { data: esc } = await service
      .from('businesses')
      .select('id, timezone')
      .eq('slug', 'escuderia')
      .maybeSingle()
    if (esc) businessId = (esc as { id: string }).id
  }
  if (!businessId) return NextResponse.json({ error: 'business_not_found' }, { status: 404 })

  // Fetch business hours + timezone to decide open/closed
  const { data: bizData } = await service
    .from('businesses')
    .select('timezone')
    .eq('id', businessId)
    .maybeSingle()
  const tz = (bizData as { timezone: string } | null)?.timezone ?? 'America/Bogota'

  const { data: hours } = await service
    .from('business_hours')
    .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
    .eq('business_id', businessId)
  const hoursArr =
    (hours as unknown as Array<{
      day_of_week: number
      is_open: boolean
      open_time: string
      close_time: string
      break_start: string | null
      break_end: string | null
    }>) ?? []

  // Determine dow in business tz
  let dow = new Date().getUTCDay()
  let openNow = false
  let currentHours: { open_time: string; close_time: string; is_open: boolean } | null = null
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(
      new Date(),
    )
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    dow = map[wd] ?? dow
  } catch {}
  const today = hoursArr.find((h) => h.day_of_week === dow)
  if (today) {
    currentHours = {
      open_time: today.open_time,
      close_time: today.close_time,
      is_open: today.is_open,
    }
    if (today.is_open) {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(new Date())
        const hh = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
        const mm = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
        const nowMin = (hh % 24) * 60 + mm
        const [oh, om] = today.open_time.split(':').map(Number)
        const [ch, cm] = today.close_time.split(':').map(Number)
        const openMin = (oh ?? 0) * 60 + (om ?? 0)
        const closeMin = (ch ?? 0) * 60 + (cm ?? 0)
        openNow = nowMin >= openMin && nowMin < closeMin
        // break check
        if (today.break_start && today.break_end && openNow) {
          const [bh, bm] = today.break_start.split(':').map(Number)
          const [eh, em] = today.break_end.split(':').map(Number)
          const bStart = (bh ?? 0) * 60 + (bm ?? 0)
          const bEnd = (eh ?? 0) * 60 + (em ?? 0)
          if (nowMin >= bStart && nowMin < bEnd) openNow = false
        }
      } catch {
        openNow = !!today.is_open
      }
    }
  }

  // Count in_service appointments as "sillas ocupadas" proxy
  let inServiceCount = 0
  try {
    const q = service
      .from('appointments')
      .select('id', { count: 'exact' } as unknown as never)
      .eq('business_id', businessId)
      .eq('status', 'in_service')
    // If location filter, narrow
    const filtered = locationId
      ? (q as unknown as { eq: (c: string, v: unknown) => Promise<{ count: number | null }> }).eq(
          'location_id',
          locationId,
        )
      : (q as unknown as Promise<{ count: number | null }>)
    const { count } = (await filtered) as unknown as { count: number | null }
    inServiceCount = count ?? 0
  } catch {
    try {
      const { data } = await service
        .from('appointments')
        .select('id')
        .eq('business_id', businessId)
        .eq('status', 'in_service')
      inServiceCount = (data as unknown as unknown[])?.length ?? 0
    } catch {
      inServiceCount = 0
    }
  }

  // Total chairs / capacity heuristic: count active employees as chairs
  let chairTotal = 3
  try {
    const { data: emps } = await service
      .from('employees')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)
    chairTotal = Math.max(1, (emps as unknown as unknown[])?.length ?? 3)
  } catch {}

  const freeChairs = Math.max(0, chairTotal - inServiceCount)
  const status: 'open' | 'closed' = openNow ? 'open' : 'closed'

  return NextResponse.json({
    business_id: businessId,
    location_id: locationId,
    timezone: tz,
    status,
    hours: currentHours,
    dow,
    chairs: { total: chairTotal, occupied: inServiceCount, free: freeChairs },
    polled_at: new Date().toISOString(),
    dedup: 'realtime stub polling 30s',
  })
}
