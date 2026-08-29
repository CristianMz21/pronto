import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { SEGMENTS, filterClientsBySegment } from '@/lib/campaigns'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const QuerySchema = z.object({
  segment: z.enum(SEGMENTS),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
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

function _inDaysFromNow(dateStr: string, days: number, now: Date): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return false
  const thisYear = now.getFullYear()
  const bThisYear = new Date(thisYear, d.getMonth(), d.getDate())
  const diff = Math.ceil((bThisYear.getTime() - now.getTime()) / 86400000)
  return diff >= 0 && diff <= days
}

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`crm-segments:${ip}`, { limit: 60, windowMs: 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const url = new URL(req.url)
  const segment = url.searchParams.get('segment')
  const locationId = url.searchParams.get('location_id')
  const parsed = QuerySchema.safeParse({ segment, location_id: locationId || null })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Fetch clients + stats similar to CRM page, but capped
  let query = supabase
    .from('clients')
    .select('id, name, phone, email, tags, birthday, last_visit_at, location_id')
    .eq('business_id', businessId)
    .order('name')
    .limit(200)

  if (parsed.data.location_id) {
    query = query.eq('location_id', parsed.data.location_id) as typeof query
  }

  const { data: clientsRaw } = await query
  const clients = clientsRaw ?? []

  // Enrich with transaction stats for visits/last_visit
  const clientIds = (clients as unknown as { id: string }[]).map((c) => c.id)
  const statsMap: Record<string, { total_visits: number; last_visit_at: string | null }> = {}
  if (clientIds.length > 0) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('client_id, created_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
      .limit(1000)
    for (const tx of (txs as unknown as { client_id: string; created_at: string }[] | null) ?? []) {
      if (!tx.client_id) continue
      if (!statsMap[tx.client_id]) statsMap[tx.client_id] = { total_visits: 0, last_visit_at: null }
      statsMap[tx.client_id].total_visits++
      if (!statsMap[tx.client_id].last_visit_at)
        statsMap[tx.client_id].last_visit_at = tx.created_at
    }
  }

  const enriched = (
    clients as unknown as {
      id: string
      birthday: string | null
      tags: string[] | null
      last_visit_at: string | null
      location_id: string | null
    }[]
  ).map((c) => ({
    id: c.id,
    birthday: c.birthday,
    tags: c.tags,
    location_id: c.location_id,
    last_visit_at: statsMap[c.id]?.last_visit_at ?? c.last_visit_at ?? null,
    total_visits: statsMap[c.id]?.total_visits ?? 0,
  }))

  const filtered = filterClientsBySegment(enriched, parsed.data.segment)

  // Also return full client rows for preview
  const filteredIds = new Set(filtered.map((f) => f.id))
  const preview = (clients as unknown as { id: string }[])
    .filter((c) => filteredIds.has(c.id))
    .slice(0, 50)

  return NextResponse.json({
    segment: parsed.data.segment,
    count: filtered.length,
    preview,
    location_id: parsed.data.location_id ?? null,
  })
}
