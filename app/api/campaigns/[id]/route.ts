import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
  if (!rateLimit(`campaigns-get:${ip}`, { limit: 60, windowMs: 60 * 1000 })) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, business_id, location_id, name, segment, channel, template, status, stats, sent_at, created_at')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!campaign) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 })

  const { data: recipients, count } = await supabase
    .from('campaign_recipients')
    .select('client_id, status, clients(id, name, phone, email)', { count: 'exact' })
    .eq('campaign_id', id)
    .limit(200)

  return NextResponse.json({ campaign, recipients: recipients ?? [], recipients_count: count ?? 0 })
}
