import DOMPurify from 'isomorphic-dompurify'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

const BodySchema = z.object({
  tax_rate: z.coerce.number().min(0).max(100).optional(),
  payment_methods: z.array(z.enum(['cash', 'card', 'transfer', 'digital'])).optional(),
  cancel_lead_time: z.coerce.number().int().min(0).max(1440).optional(),
  min_advance_minutes: z.coerce.number().int().min(0).max(1440).optional(),
  business_lead_time_enabled: z.boolean().optional(),
  loyalty_earn_rate: z.coerce.number().int().min(1).max(100000).optional(),
  loyalty_redeem_rate: z.coerce.number().int().min(1).max(100000).optional(),
  loyalty_redeem_value: z.coerce.number().int().min(1).max(1000000).optional(),
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

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: biz } = await supabase
    .from('businesses')
    .select(
      'tax_rate, payment_methods, cancel_lead_time, min_advance_minutes, booking_lead_time_enabled, loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_value',
    )
    .eq('id', businessId)
    .maybeSingle()

  const url = new URL(req.url)
  const locationId = url.searchParams.get('location_id')
  if (locationId) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id, name')
      .eq('id', locationId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!loc) return NextResponse.json({ error: 'location_not_found' }, { status: 404 })
  }

  // Also fetch business_settings for completeness
  const { data: settings } = await supabase
    .from('business_settings')
    .select('tax_rate, payment_methods, cancel_lead_time')
    .eq('business_id', businessId)
    .maybeSingle()

  return NextResponse.json({
    business: biz,
    business_settings: settings,
    location_id: locationId || null,
  })
}

export async function PUT(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`business-tax:${ip}`, { limit: 30, windowMs: 60 * 1000 }))
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
  const b = parsed.data

  const patch: Record<string, unknown> = {}
  if (b.tax_rate !== undefined) patch.tax_rate = b.tax_rate
  if (b.payment_methods !== undefined)
    patch.payment_methods = b.payment_methods.map((m) => sanitize(m))
  if (b.cancel_lead_time !== undefined) patch.cancel_lead_time = b.cancel_lead_time
  if (b.min_advance_minutes !== undefined) patch.min_advance_minutes = b.min_advance_minutes
  if (b.business_lead_time_enabled !== undefined)
    patch.booking_lead_time_enabled = b.business_lead_time_enabled
  if (b.loyalty_earn_rate !== undefined) patch.loyalty_earn_rate = b.loyalty_earn_rate
  if (b.loyalty_redeem_rate !== undefined) patch.loyalty_redeem_rate = b.loyalty_redeem_rate
  if (b.loyalty_redeem_value !== undefined) patch.loyalty_redeem_value = b.loyalty_redeem_value

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'no_changes' }, { status: 400 })

  const { error } = await supabase
    .from('businesses')
    .update(patch as unknown as never)
    .eq('id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mirror to business_settings if tax/cancel/payment present
  const settingsPatch: Record<string, unknown> = {}
  if (b.tax_rate !== undefined) settingsPatch.tax_rate = b.tax_rate
  if (b.payment_methods !== undefined) settingsPatch.payment_methods = b.payment_methods
  if (b.cancel_lead_time !== undefined) settingsPatch.cancel_lead_time = b.cancel_lead_time
  if (Object.keys(settingsPatch).length > 0) {
    await supabase
      .from('business_settings')
      .upsert(
        { business_id: businessId, ...settingsPatch } as unknown as never,
        { onConflict: 'business_id' } as unknown as never,
      )
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  return PUT(req)
}
