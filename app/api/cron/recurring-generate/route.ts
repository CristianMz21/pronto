import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
export async function GET(req: NextRequest) {
  const _ipGET = getIp(req as unknown as Request)
  if (!rateLimit(`recurring-generate-route:get:${_ipGET}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _parsed = z
      .object({})
      .passthrough()
      .safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!_parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const now = new Date()
  const nowIso = now.toISOString()

  // Find active series where next_at <= now (due to generate)
  // For MVP, we handle next occurrence creation for series that have not yet generated all via createSeries.
  // Since createSeries already generated all occurrences, this cron is a placeholder that deactivates expired series.
  const { data: dueSeries, error } = await supabase
    .from('recurring_appointments')
    .select('id, business_id, next_at, until, is_active')
    .eq('is_active', true)
    .lte('next_at', nowIso)
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let deactivated = 0
  const debug: Record<string, unknown> = { now: nowIso, dueCount: dueSeries?.length ?? 0 }

  for (const s of dueSeries ?? []) {
    const series = s as { id: string; business_id: string; until: string | null }
    if (series.until && new Date(series.until).getTime() <= now.getTime()) {
      // Expired series -> deactivate
      await supabase.from('recurring_appointments').update({ is_active: false }).eq('id', series.id)
      deactivated += 1
    } else {
      // For series that still active, we could generate next occurrence if missing.
      // Since createSeries already created all, we just bump next_at to next future appointment's starts_at if any
      const { data: nextAppt } = await supabase
        .from('appointments')
        .select('starts_at')
        .eq('recurring_id', series.id)
        .gte('starts_at', nowIso)
        .order('starts_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (nextAppt) {
        await supabase
          .from('recurring_appointments')
          .update({ next_at: (nextAppt as { starts_at: string }).starts_at })
          .eq('id', series.id)
      }
    }
  }

  return NextResponse.json({ ok: true, checked: dueSeries?.length ?? 0, deactivated, debug })
}

export async function POST(req: NextRequest) {
  const _ipPOST = getIp(req as unknown as Request)
  if (
    !rateLimit(`recurring-generate-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 })
  )
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  return GET(req)
}
