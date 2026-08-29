import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCampaignStats } from '@/lib/campaigns'
import { rateLimit, getIp } from '@/lib/rate-limit'

async function resolveBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: owned } = await supabase.from('businesses').select('id').eq('owner_id', userId).maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(req)
  if (!rateLimit(`campaigns-stats:${ip}`, { limit: 60, windowMs: 60 * 1000 })) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const stats = await getCampaignStats(supabase as unknown as Parameters<typeof getCampaignStats>[0], id)
    // Verify tenant
    const { data: camp } = await supabase.from('campaigns').select('id').eq('id', id).eq('business_id', businessId).maybeSingle()
    if (!camp) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 })
    return NextResponse.json(stats)
  } catch (e) {
    const err = e as Error
    if (String(err.message).includes('campaign_not_found')) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 })
    return NextResponse.json({ error: err.message ?? 'stats_failed' }, { status: 500 })
  }
}
