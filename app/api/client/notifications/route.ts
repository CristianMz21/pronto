import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { normalizePhoneCO } from '@/lib/client-360'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const QuerySchema = z.object({
  phone: z.string().min(6).max(30).optional().nullable(),
  business_id: z.string().uuid().optional().nullable(),
  business_slug: z.string().min(2).max(64).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(100).optional().nullable(),
})

const ICON_MAP: Record<string, string> = {
  reminder_24h: '🔔',
  reminder_2h: '🔔',
  reminder_1h: '🔔',
  thankyou: '✂️',
  reactivation: '💈',
  birthday: '🎁',
  campaign_auto: '🎁',
  waitlist_notified: '⏳',
  chat_message: '💬',
  deposit_paid: '💳',
}

function iconForType(t: string): string {
  if (t.startsWith('reminder')) return '🔔'
  if (t.includes('waitlist')) return '⏳'
  if (t.includes('birthday')) return '🎁'
  if (t.includes('thankyou') || t.includes('review')) return '✂️'
  if (t.includes('deposit') || t.includes('payment')) return '💳'
  if (t.includes('chat')) return '💬'
  return ICON_MAP[t] ?? '🔔'
}

async function resolveClient(
  service: ReturnType<typeof createServiceClient>,
  businessId: string,
  phone?: string | null,
  userId?: string | null,
): Promise<{ clientId: string; businessId: string } | null> {
  if (userId) {
    const { data } = await service
      .from('clients')
      .select('id, business_id')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (data) {
      const r = data as { id: string; business_id: string }
      return { clientId: r.id, businessId: r.business_id }
    }
  }
  if (phone) {
    const norm = normalizePhoneCO(phone)
    const { data } = await service
      .from('clients')
      .select('id, business_id')
      .eq('phone', norm)
      .eq('business_id', businessId)
      .maybeSingle()
    if (data) {
      const r = data as { id: string; business_id: string }
      return { clientId: r.id, businessId: r.business_id }
    }
    // fallback suffix
    const { data: list } = await service
      .from('clients')
      .select('id, phone, business_id')
      .eq('business_id', businessId)
      .limit(100)
    const arr =
      (list as unknown as Array<{ id: string; phone: string | null; business_id: string }>) ?? []
    const found = arr.find((c) =>
      String(c.phone ?? '')
        .replace(/\D/g, '')
        .endsWith(norm.replace(/\D/g, '').slice(-10)),
    )
    if (found) return { clientId: found.id, businessId: found.business_id }
  }
  return null
}

function dedupOneHour<T extends { type: string; channel: string; sent_at: string }>(
  items: T[],
): T[] {
  // keep newest per (type,channel) if within 1h window — sorted desc already
  const result: T[] = []
  const seen: Record<string, number> = {} // key -> timestamp ms of kept
  for (const it of items) {
    const key = `${it.type}|${it.channel}`
    const ts = new Date(it.sent_at).getTime()
    const last = seen[key]
    if (last !== undefined && Math.abs(last - ts) < 3600_000) {
      // within 1h -> skip (deduplicate)
      continue
    }
    seen[key] = ts
    result.push(it)
  }
  return result
}

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`client-notif:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    phone: url.searchParams.get('phone'),
    business_id: url.searchParams.get('business_id'),
    business_slug: url.searchParams.get('business_slug'),
    limit: url.searchParams.get('limit'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  let { phone, business_id: businessId, business_slug: businessSlug } = parsed.data
  if (phone) phone = normalizePhoneCO(phone)
  const service = createServiceClient()

  if (!businessId && businessSlug) {
    const { data: biz } = await service
      .from('businesses')
      .select('id')
      .eq('slug', businessSlug)
      .maybeSingle()
    if (biz) businessId = (biz as { id: string }).id
  }
  if (!businessId) {
    if (user) {
      const { data: linked } = await service
        .from('clients')
        .select('business_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (linked) businessId = (linked as { business_id: string }).business_id
      else {
        const { data: owned } = await service
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()
        if (owned) businessId = (owned as { id: string }).id
      }
    }
  }
  if (!businessId) {
    const { data: esc } = await service
      .from('businesses')
      .select('id')
      .eq('slug', 'escuderia')
      .maybeSingle()
    if (esc) businessId = (esc as { id: string }).id
  }
  if (!businessId) return NextResponse.json({ error: 'business_not_found' }, { status: 404 })

  const userId = user?.id ?? null
  if (!phone && !userId) {
    return NextResponse.json({ error: 'phone_or_auth_required' }, { status: 401 })
  }

  const resolved = await resolveClient(service, businessId, phone ?? null, userId)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const limit = parsed.data.limit ?? 20

  // Fetch appointments for this client to include their ids in notification search (confirmada etc)
  const { data: appts } = await service
    .from('appointments')
    .select('id')
    .eq('client_id', resolved.clientId)
    .limit(50)
  const apptIds = ((appts as unknown as Array<{ id: string }>) ?? []).map((a) => a.id)

  // Build set of ref_ids: clientId + apptIds
  const refIds = [resolved.clientId, ...apptIds]

  // Fetch notification_log for business_id + ref_id in set, order desc limit *3 to allow dedup filtering then slice to limit
  // Supabase `in` with array
  let logs: Array<{
    id: string
    business_id: string
    ref_id: string
    type: string
    channel: string
    sent_at: string
  }> = []
  try {
    const { data } = await service
      .from('notification_log')
      .select('id, business_id, ref_id, type, channel, sent_at')
      .eq('business_id', businessId)
      .in('ref_id', refIds)
      .order('sent_at', { ascending: false } as never)
      .limit(limit * 3)
    logs = (data as unknown as typeof logs) ?? []
  } catch {
    // fallback: fetch by business only and filter
    const { data } = await service
      .from('notification_log')
      .select('id, business_id, ref_id, type, channel, sent_at')
      .eq('business_id', businessId)
      .order('sent_at', { ascending: false } as never)
      .limit(limit * 3)
    const raw = (data as unknown as typeof logs) ?? []
    logs = raw.filter((r) => refIds.includes(r.ref_id))
  }

  // Also fetch waitlist events as synthetic notifications (if any waiting/notified)
  try {
    const { data: waitlist } = await service
      .from('waitlist')
      .select('id, status, desired_at, created_at')
      .eq('client_id', resolved.clientId)
      .order('created_at', { ascending: false } as never)
      .limit(5)
    const wl =
      (waitlist as unknown as Array<{
        id: string
        status: string
        desired_at: string
        created_at: string
      }>) ?? []
    for (const w of wl) {
      if (w.status === 'notified') {
        logs.push({
          id: w.id,
          business_id: businessId,
          ref_id: resolved.clientId,
          type: 'waitlist_notified',
          channel: 'whatsapp',
          sent_at: w.created_at,
        })
      } else if (w.status === 'waiting') {
        logs.push({
          id: w.id,
          business_id: businessId,
          ref_id: resolved.clientId,
          type: 'waitlist_waiting',
          channel: 'push',
          sent_at: w.created_at,
        })
      }
    }
    logs.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
  } catch {}

  const deduped = dedupOneHour(logs).slice(0, limit)

  const enriched = deduped.map((l) => ({
    ...l,
    icon: iconForType(l.type),
    title:
      l.type === 'reminder_24h'
        ? 'Recordatorio 24h — tu cita es mañana'
        : l.type === 'reminder_2h'
          ? 'Recordatorio 2h — tu cita es pronto'
          : l.type === 'reminder_1h'
            ? 'Recordatorio 1h — te esperamos'
            : l.type === 'thankyou'
              ? '¿Qué tal tu corte? Déjanos tu reseña'
              : l.type === 'waitlist_notified'
                ? '¡Se liberó un horario! Reservá ahora (30m)'
                : l.type === 'waitlist_waiting'
                  ? 'En lista de espera'
                  : l.type,
    dedup_window: '1h',
  }))

  return NextResponse.json({ notifications: enriched, total: enriched.length, dedup_window: '1h' })
}
