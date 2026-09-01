import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function resolveClient(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<{ clientId: string; businessId: string } | null> {
  const { data } = await service
    .from('clients')
    .select('id, business_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; business_id: string }
  return { clientId: row.id, businessId: row.business_id }
}

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`client-waitlist:get:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || undefined
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  let q = service
    .from('waitlist')
    .select(
      'id, business_id, location_id, service_id, employee_id, client_id, desired_at, status, notified_at, created_at, services(id, name), employees(id, name)',
    )
    .eq('client_id', resolved.clientId)
    .order('created_at', { ascending: false } as never)
    .limit(limit)

  if (status && ['waiting', 'notified', 'converted', 'expired', 'cancelled'].includes(status)) {
    q = (q as unknown as { eq: (c: string, v: unknown) => typeof q }).eq('status', status)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

const DeleteSchema = z.object({ id: z.string().uuid() })

export async function DELETE(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`client-waitlist:del:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let id: string | null = new URL(req.url).searchParams.get('id')
  if (!id) {
    try {
      const b: unknown = await req.json()
      const p = DeleteSchema.safeParse(b as Record<string, unknown>)
      if (p.success) id = p.data.id
    } catch {}
  }
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  // Verify owns
  const { data: wl } = await service.from('waitlist').select('client_id').eq('id', id).maybeSingle()
  if (!wl) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if ((wl as { client_id: string }).client_id !== resolved.clientId)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { error } = await service
    .from('waitlist')
    .update({ status: 'cancelled' } as never)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
