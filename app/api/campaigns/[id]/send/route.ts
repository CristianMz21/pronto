import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { sendCampaign } from '@/lib/campaigns'

async function resolveBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: owned } = await supabase.from('businesses').select('id').eq('owner_id', userId).maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(req)
  if (!rateLimit(`campaigns-send:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Verify campaign belongs to business
  const { data: camp } = await supabase.from('campaigns').select('id, business_id, status').eq('id', id).eq('business_id', businessId).maybeSingle()
  if (!camp) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 })
  const status = (camp as { status: string }).status
  if (status !== 'draft') return NextResponse.json({ error: 'campaign_not_draft', status }, { status: 409 })

  try {
    const result = await sendCampaign(supabase as unknown as Parameters<typeof sendCampaign>[0], id)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const err = e as Error & { status?: number }
    const code = err.status ?? 500
    if (code === 404) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 })
    if (code === 409) return NextResponse.json({ error: err.message }, { status: 409 })
    return NextResponse.json({ error: err.message ?? 'send_failed' }, { status: 500 })
  }
}
