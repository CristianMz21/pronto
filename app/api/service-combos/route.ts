import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { ServiceComboSchema } from '@/lib/service-combos'
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

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data, error } = await supabase
    .from('service_combos')
    .select(
      'id, business_id, location_id, name, service_ids, price, duration_min, is_active, created_at',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`service-combos-create:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
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
  const parsed = ServiceComboSchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const b = parsed.data

  // Verify service_ids belong to business (tenant guard)
  const { data: services } = await supabase
    .from('services')
    .select('id')
    .eq('business_id', businessId)
    .in('id', b.service_ids)
  const foundIds = new Set((services as { id: string }[] | null)?.map((s) => s.id) ?? [])
  const missing = b.service_ids.filter((id) => !foundIds.has(id))
  if (missing.length > 0)
    return NextResponse.json({ error: 'service_not_found', missing }, { status: 404 })

  const payload = {
    business_id: businessId,
    location_id: b.location_id || null,
    name: sanitize(b.name),
    service_ids: b.service_ids,
    price: b.price,
    duration_min: b.duration_min,
    is_active: b.is_active ?? true,
  }

  const { data, error } = await supabase
    .from('service_combos')
    .insert(payload)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
