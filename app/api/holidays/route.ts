import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { rateLimit, getIp } from '@/lib/rate-limit'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

const CreateSchema = z.object({
  business_id: z.string().uuid().optional(),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format YYYY-MM-DD'),
  reason: z.string().max(200).nullable().optional(),
  is_open: z.boolean().optional().default(false),
})

const PatchSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(200).nullable().optional(),
  is_open: z.boolean().optional(),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

async function resolveBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: owned } = await supabase.from('businesses').select('id').eq('owner_id', userId).maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

// GET /api/holidays?business_id=...&location_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const businessIdParam = url.searchParams.get('business_id')
  const locationId = url.searchParams.get('location_id')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  // Public read allowed for booking form? We allow anon to read holidays for a business_id (published)
  // But we still enforce tenant if no business_id provided via auth
  let businessId = businessIdParam
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!businessId) {
    if (!user) return NextResponse.json({ error: 'business_id_required' }, { status: 400 })
    businessId = await resolveBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Use service client for public read to bypass RLS for anon booking, but filter by business_id
  const service = createServiceClient()
  let query = service.from('holidays').select('id, business_id, location_id, date, reason, is_open, created_at').eq('business_id', businessId).order('date', { ascending: true })

  if (locationId) {
    // Return holidays for that location + business-wide (location_id null)
    // We fetch all and filter JS for simplicity (small table)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    let filtered = (data ?? []) as { location_id: string | null; date: string }[]
    filtered = filtered.filter((h) => !h.location_id || h.location_id === locationId)
    if (from) filtered = filtered.filter((h) => h.date >= from)
    if (to) filtered = filtered.filter((h) => h.date <= to)
    return NextResponse.json(filtered)
  }

  if (from) query = query.gte('date', from) as typeof query
  if (to) query = query.lte('date', to) as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/holidays — create holiday
export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`holidays:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  let businessId = parsed.data.business_id ?? null
  if (!businessId) {
    businessId = await resolveBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  } else {
    // Verify user has access to that business_id
    const { data: ownedCheck } = await supabase.from('businesses').select('id').eq('id', businessId).eq('owner_id', user.id).maybeSingle()
    if (!ownedCheck) {
      const { data: empCheck } = await supabase.from('employees').select('id').eq('user_id', user.id).eq('business_id', businessId).eq('is_active', true).maybeSingle()
      if (!empCheck) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  // Validate location belongs to business if provided
  const locationId = parsed.data.location_id || null
  if (locationId) {
    const { data: loc } = await supabase.from('locations').select('id').eq('id', locationId).eq('business_id', businessId).maybeSingle()
    if (!loc) return NextResponse.json({ error: 'location_not_found' }, { status: 404 })
  }

  const payload = {
    business_id: businessId,
    location_id: locationId,
    date: parsed.data.date,
    reason: parsed.data.reason ? sanitize(parsed.data.reason) : null,
    is_open: parsed.data.is_open ?? false,
  }

  const { data, error } = await supabase.from('holidays').insert(payload as unknown as never).select('id, business_id, location_id, date, reason, is_open').single()
  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('duplicate') || msg.includes('unique') || (error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'holiday_duplicate', message: 'Ya existe un festivo para esa fecha y sede' }, { status: 409 })
    }
    return NextResponse.json({ error: msg || 'insert_failed' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/holidays — update
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })

  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (parsed.data.reason !== undefined) patch.reason = parsed.data.reason ? sanitize(parsed.data.reason) : null
  if (parsed.data.is_open !== undefined) patch.is_open = parsed.data.is_open
  if (parsed.data.location_id !== undefined) patch.location_id = parsed.data.location_id || null
  if (parsed.data.date !== undefined) patch.date = parsed.data.date

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no_changes' }, { status: 400 })

  // Verify location if changing
  if (patch.location_id) {
    const { data: loc } = await supabase.from('locations').select('id').eq('id', patch.location_id as string).eq('business_id', businessId).maybeSingle()
    if (!loc) return NextResponse.json({ error: 'location_not_found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('holidays')
    .update(patch as unknown as never)
    .eq('id', parsed.data.id)
    .eq('business_id', businessId)
    .select('id, business_id, location_id, date, reason, is_open')
    .single()

  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('duplicate') || msg.includes('unique')) return NextResponse.json({ error: 'holiday_duplicate' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json(data)
}

// DELETE /api/holidays?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error } = await supabase.from('holidays').delete().eq('id', id).eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
