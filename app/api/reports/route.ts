import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { reportSalesByBarber } from '@/lib/reports'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  {
    const _parsed = z
      .object({})
      .passthrough()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!_parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  const ip = getIp(request)
  if (!rateLimit(`reports:${ip}`, { limit: 60, windowMs: 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') ?? 'week'
  const location = searchParams.get('location')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let businessId: string | null = null
  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) businessId = (owned as { id: string }).id
  else {
    const { data: emp } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (emp) businessId = (emp as { business_id: string }).business_id
  }
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const sinceMap: Record<string, string> = {
    day: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    week: new Date(Date.now() - 7 * 86400000).toISOString(),
    month: new Date(Date.now() - 30 * 86400000).toISOString(),
  }
  const since = sinceMap[range] ?? sinceMap.week

  let q = supabase
    .from('transactions')
    .select('amount, employee_id')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('created_at', since)
    .limit(1000)
  if (location)
    q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq(
      'location_id',
      location,
    ) as typeof q
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const byBarber = reportSalesByBarber(
    (data ?? []) as { amount: number; employee_id: string | null }[],
  )
  return NextResponse.json({ byBarber, count: data?.length ?? 0, since, range })
}
