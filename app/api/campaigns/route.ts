import DOMPurify from 'isomorphic-dompurify'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { CampaignCreateSchema, createFromSegment } from '@/lib/campaigns'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

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
  const status = url.searchParams.get('status')

  let query = supabase
    .from('campaigns')
    .select(
      'id, business_id, location_id, name, segment, channel, template, status, stats, sent_at, created_at',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (locationId) query = query.eq('location_id', locationId) as typeof query
  if (status) query = query.eq('status', status) as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`campaigns-create:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

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

  const parsed = CampaignCreateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }
  const body = parsed.data

  try {
    const campaign = await createFromSegment(
      supabase as unknown as Parameters<typeof createFromSegment>[0],
      {
        businessId,
        locationId: body.location_id || null,
        name: sanitize(body.name),
        segment: body.segment,
        channel: body.channel,
        template: sanitize(body.template),
      },
    )
    // Return campaign with recipient count
    const { count } = await supabase
      .from('campaign_recipients')
      .select('client_id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
    return NextResponse.json({ ...campaign, recipients_count: count ?? 0 }, { status: 201 })
  } catch (e) {
    const err = e as Error & { details?: unknown; cause?: unknown }
    if (String(err.message).includes('validation_failed')) {
      return NextResponse.json(
        { error: 'validation_failed', details: err.details ?? {} },
        { status: 422 },
      )
    }
    return NextResponse.json({ error: err.message ?? 'create_failed' }, { status: 500 })
  }
}
