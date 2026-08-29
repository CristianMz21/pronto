import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { EnqueueSchema, listWaiting, expireStale, convert } from '@/lib/waitlist'
import { parseDateTimeInTz } from '@/lib/booking-availability'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

const PatchSchema = z.object({
  action: z.enum(['notify', 'convert', 'cancel', 'expire']),
  waitlist_id: z.string().uuid().optional(),
  business_id: z.string().uuid().optional(),
  location_id: z.string().uuid().nullable().optional(),
  desired_at: z.string().datetime().optional(),
})

async function resolveBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: owned } = await supabase.from('businesses').select('id').eq('owner_id', userId).maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

// GET /api/waitlist?business_id=...&location_id=...&status=waiting
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const businessIdParam = url.searchParams.get('business_id')
  const locationId = url.searchParams.get('location_id')
  const status = url.searchParams.get('status') || 'waiting'
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50')))

  let businessId = businessIdParam
  if (!businessId) {
    businessId = await resolveBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Verify business access via my_business_ids or owned check? RLS will enforce but we do quick check
  // Fetch waitlist
  let query = supabase
    .from('waitlist')
    .select('id, business_id, location_id, service_id, employee_id, client_id, desired_at, status, notified_at, created_at, clients(id, name, phone, email), services(id, name), employees(id, name)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (status && ['waiting', 'notified', 'converted', 'expired', 'cancelled'].includes(status)) {
    query = query.eq('status', status) as typeof query
  }
  if (locationId) {
    query = query.eq('location_id', locationId) as typeof query
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/waitlist — enqueue
export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`waitlist:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Allow guest enqueue as well? For public waitlist, we allow without auth if business_id+client phone provided via /api/book flow.
  // But for dashboard, require auth. We'll support both: if no user, use service client and trust business_id
  let businessIdForAuth: string | null = null
  if (user) {
    businessIdForAuth = await resolveBusinessId(supabase, user.id)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Allow alternative input: date+time+timezone -> desired_at conversion
  const extended = raw as Record<string, unknown> & { date?: string; time?: string; timezone?: string; businessId?: string }
  let desiredAt: string | undefined = (raw as { desired_at?: string })?.desired_at
  if (!desiredAt && extended.date && extended.time) {
    const tz = (extended.timezone as string) ?? 'America/Bogota'
    try {
      const dt = parseDateTimeInTz(extended.date as string, extended.time as string, tz)
      desiredAt = dt.toISOString()
      ;(raw as Record<string, unknown>).desired_at = desiredAt
      // Normalize business_id if passed as businessId
      if (extended.businessId && !(raw as Record<string, unknown>).business_id) {
        ;(raw as Record<string, unknown>).business_id = extended.businessId
      }
    } catch {
      return NextResponse.json({ error: 'invalid_date' }, { status: 400 })
    }
  }

  const parsed = EnqueueSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const data = parsed.data
  // Auth guard: if user exists, ensure business matches their business
  if (user && businessIdForAuth && data.business_id !== businessIdForAuth) {
    // Check if user is owner/admin of multiple businesses? For MVP, allow if data.business_id in my_business_ids
    // We do a permissive check: query my_business_ids via supabase rpc? Simpler: allow if user owns that business directly
    const { data: ownedCheck } = await supabase.from('businesses').select('id').eq('id', data.business_id).eq('owner_id', user.id).maybeSingle()
    if (!ownedCheck) {
      const { data: empCheck } = await supabase.from('employees').select('id').eq('user_id', user.id).eq('business_id', data.business_id).eq('is_active', true).maybeSingle()
      if (!empCheck) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }
  }

  // Sanitize: we use service client for insert to bypass RLS for public flow; but for auth flow, use user client
  const service = createServiceClient()
  // Verify business exists
  const { data: biz } = await service.from('businesses').select('id, timezone').eq('id', data.business_id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'business_not_found' }, { status: 404 })

  // Validate desired_at > now + lead time (if we can fetch business config)
  try {
    const { data: bizCfg } = await service.from('businesses').select('min_advance_minutes, booking_lead_time_enabled').eq('id', data.business_id).maybeSingle()
    const minAdv = (bizCfg as { min_advance_minutes?: number | null } | null)?.min_advance_minutes ?? 30
    const enabled = (bizCfg as { booking_lead_time_enabled?: boolean | null } | null)?.booking_lead_time_enabled ?? true
    const { canEnqueue } = await import('@/lib/waitlist')
    const check = canEnqueue(data.desired_at, new Date(), minAdv, enabled)
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 })
    }
  } catch {}

  // Verify client exists and belongs to business
  const { data: client } = await service.from('clients').select('id').eq('id', data.client_id).eq('business_id', data.business_id).maybeSingle()
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  // Verify service belongs to business
  const { data: svc } = await service.from('services').select('id').eq('id', data.service_id).eq('business_id', data.business_id).maybeSingle()
  if (!svc) return NextResponse.json({ error: 'service_not_found' }, { status: 404 })

  // Use service client for enqueue (bypasses RLS for public)
  const { enqueue } = await import('@/lib/waitlist')
  try {
    const entry = await enqueue(service as unknown as Parameters<typeof enqueue>[0], {
      business_id: data.business_id,
      location_id: data.location_id || null,
      service_id: data.service_id,
      employee_id: data.employee_id || null,
      client_id: data.client_id,
      desired_at: data.desired_at,
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    const err = e as Error & { code?: string; details?: unknown }
    if (err.code === 'waitlist_duplicate') {
      return NextResponse.json({ error: 'waitlist_duplicate', message: 'Ya estás en lista de espera para ese horario' }, { status: 409 })
    }
    if (String(err.message).includes('validation_failed')) {
      return NextResponse.json({ error: 'validation_failed', details: err.details }, { status: 422 })
    }
    return NextResponse.json({ error: String(err.message ?? 'enqueue_failed') }, { status: 500 })
  }
}

// PATCH /api/waitlist — actions: notify, convert, cancel, expire
export async function PATCH(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`waitlist-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
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

  const parsed = PatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { action, waitlist_id, business_id, location_id, desired_at } = parsed.data
  const businessId = business_id ?? (await resolveBusinessId(supabase, user.id))
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const service = createServiceClient()

  if (action === 'expire') {
    const result = await expireStale(service as unknown as Parameters<typeof expireStale>[0])
    return NextResponse.json(result)
  }

  if (action === 'notify') {
    // Manual notify next in queue (for dashboard button)
    const { notifyNext } = await import('@/lib/waitlist')
    const entry = await notifyNext(service as unknown as Parameters<typeof notifyNext>[0], {
      business_id: businessId,
      desired_at: desired_at ?? undefined,
      location_id: location_id ?? null,
    })
    if (!entry) return NextResponse.json({ error: 'no_waiting', message: 'No hay nadie en espera para ese horario' }, { status: 404 })
    // TODO: trigger WhatsApp notification via service (fire-and-forget)
    // For now, just return entry; cron or notify endpoint will handle messaging
    return NextResponse.json(entry)
  }

  if (action === 'convert') {
    if (!waitlist_id) return NextResponse.json({ error: 'waitlist_id_required' }, { status: 400 })
    // Verify waitlist belongs to business
    const { data: wl } = await service.from('waitlist').select('id, business_id, status').eq('id', waitlist_id).eq('business_id', businessId).maybeSingle()
    if (!wl) return NextResponse.json({ error: 'waitlist_not_found' }, { status: 404 })
    try {
      const entry = await convert(service as unknown as Parameters<typeof convert>[0], waitlist_id)
      // Optionally create appointment from waitlist entry
      // Fetch entry details to create appointment
      const { data: full } = await service.from('waitlist').select('business_id, location_id, service_id, employee_id, client_id, desired_at').eq('id', waitlist_id).maybeSingle()
      if (full) {
        const f = full as { business_id: string; location_id: string | null; service_id: string; employee_id: string | null; client_id: string; desired_at: string }
        const startsAt = new Date(f.desired_at)
        // Fetch service duration/price
        const { data: svc } = await service.from('services').select('duration_min, price').eq('id', f.service_id).maybeSingle()
        const dur = (svc as { duration_min: number } | null)?.duration_min ?? 60
        const price = (svc as { price: number } | null)?.price ?? 0
        const endsAt = new Date(startsAt.getTime() + dur * 60_000)
        const { data: appt, error: apptErr } = await service.from('appointments').insert({
          business_id: f.business_id,
          location_id: f.location_id,
          client_id: f.client_id,
          service_id: f.service_id,
          employee_id: f.employee_id,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          price,
          status: 'confirmed',
          source: 'waitlist',
        } as unknown as never).select('id').single()
        if (apptErr) {
          // Revert convert? set back to notified if slot taken
          const msg = String((apptErr as { message?: string }).message ?? '')
          if (msg.includes('slot_already_booked') || msg.includes('slot_taken')) {
            // Move back to waiting? For now return conflict
            await service.from('waitlist').update({ status: 'waiting', notified_at: null }).eq('id', waitlist_id)
            return NextResponse.json({ error: 'slot_taken', message: 'El horario ya fue tomado, se regresó a lista de espera' }, { status: 409 })
          }
          return NextResponse.json({ error: 'appointment_create_failed', details: msg }, { status: 500 })
        }
        return NextResponse.json({ waitlist: entry, appointmentId: (appt as { id: string }).id })
      }
      return NextResponse.json(entry)
    } catch (e) {
      const err = e as Error & { code?: string }
      return NextResponse.json({ error: err.code ?? 'convert_failed', message: err.message }, { status: 409 })
    }
  }

  if (action === 'cancel') {
    if (!waitlist_id) return NextResponse.json({ error: 'waitlist_id_required' }, { status: 400 })
    const { error } = await service.from('waitlist').update({ status: 'cancelled' }).eq('id', waitlist_id).eq('business_id', businessId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
}

// DELETE /api/waitlist?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const service = createServiceClient()
  const { error } = await service.from('waitlist').update({ status: 'cancelled' }).eq('id', id).eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
