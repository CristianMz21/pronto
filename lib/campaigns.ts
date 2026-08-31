import { z } from 'zod'

// ── Constants ────────────────────────────────────────────────────────────────
export const SEGMENTS = [
  'inactive_30',
  'inactive_42',
  'inactive_60',
  'birthday_7',
  'vip',
  'new',
  'all',
] as const
export type Segment = (typeof SEGMENTS)[number]

const CHANNELS = ['whatsapp', 'email', 'telegram'] as const
export type Channel = (typeof CHANNELS)[number]

type CampaignStatus = 'draft' | 'sending' | 'sent' | 'cancelled'

type RecipientStatus = 'pending' | 'sent' | 'delivered' | 'rebooked' | 'failed'

// ── Zod schemas ──────────────────────────────────────────────────────────────
export const CampaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  segment: z.enum(SEGMENTS),
  channel: z.enum(CHANNELS).default('whatsapp'),
  template: z.string().min(1).max(2000),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
})

export interface Campaign {
  id: string
  business_id: string
  location_id: string | null
  name: string
  segment: Segment
  channel: Channel
  template: string
  status: CampaignStatus
  stats: { sent: number; delivered: number; rebooked: number }
  sent_at: string | null
  created_at: string
}

interface CampaignRecipient {
  campaign_id: string
  client_id: string
  status: RecipientStatus
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function interpolateTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v).replaceAll(`{${k}}`, v)
  }
  return out
}

// ── Segment filtering (mirrors CRM page logic) ───────────────────────────────
// Pure filtering over already-fetched clients+stats. For createFromSegment we
// fetch from DB; this helper is testable without DB.
export interface ClientLike {
  id: string
  birthday?: string | null
  tags?: string[] | null
  last_visit_at?: string | null
  total_visits?: number
  location_id?: string | null
}

export function filterClientsBySegment(
  clients: ClientLike[],
  segment: Segment,
  now: Date = new Date(),
): ClientLike[] {
  if (segment === 'all') return clients
  return clients.filter((c) => {
    const last = c.last_visit_at ?? null
    const visits = c.total_visits ?? 0
    const tags = (c.tags ?? []).map((t) => t.toLowerCase())
    const bd = c.birthday
    if (segment === 'inactive_30')
      return last ? (now.getTime() - new Date(last).getTime()) / 86400000 >= 30 : true
    if (segment === 'inactive_42')
      return last ? (now.getTime() - new Date(last).getTime()) / 86400000 >= 42 : true
    if (segment === 'inactive_60')
      return last ? (now.getTime() - new Date(last).getTime()) / 86400000 >= 60 : true
    if (segment === 'birthday_7') {
      if (!bd) return false
      const d = new Date(`${bd}T00:00:00`)
      if (Number.isNaN(d.getTime())) return false
      const thisYear = now.getFullYear()
      const bThisYear = new Date(thisYear, d.getMonth(), d.getDate())
      const diff = Math.ceil((bThisYear.getTime() - now.getTime()) / 86400000)
      return diff >= 0 && diff <= 7
    }
    if (segment === 'vip') return tags.includes('vip')
    if (segment === 'new') return visits > 0 && visits < 3
    return false
  })
}

// ── Supabase type helpers ────────────────────────────────────────────────────
type SupabaseLike = {
  from: (table: string) => unknown
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder
  eq: (col: string, val: unknown) => QueryBuilder
  not: (col: string, op: string, val: unknown) => QueryBuilder
  in: (col: string, vals: unknown[]) => QueryBuilder
  order: (...args: unknown[]) => QueryBuilder
  limit: (n: number) => QueryBuilder
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>
  single: () => Promise<{ data: unknown; error: unknown }>
}

// @ts-expect-error - tsc strict fix - helper type for supabase mock
type _InsertBuilder = {
  insert: (data: unknown) => {
    select: (...a: unknown[]) => { single: () => Promise<{ data: unknown; error: unknown }> }
  }
  update: (data: unknown) => QueryBuilder & {
    eq: (
      c: string,
      v: unknown,
    ) => QueryBuilder & {
      eq: (c: string, v: unknown) => Promise<{ data: unknown; error: unknown }>
    }
  }
}

// ── DB helpers ───────────────────────────────────────────────────────────────

async function fetchSegmentClients(
  supabase: SupabaseLike,
  businessId: string,
  segment: Segment,
  locationId?: string | null,
): Promise<ClientLike[]> {
  // Fetch clients + compute stats from transactions similar to CRM page
  const _s = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          eq: (col: string, val: unknown) => unknown
          not: (col: string, op: string, val: unknown) => unknown
          order: (
            col: string,
            opt?: unknown,
          ) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> }
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
        } & {
          order: (
            col: string,
            opt?: unknown,
          ) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> }
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
        }
      }
    }
  }
  void _s

  // For simplicity, fetch all clients (capped at 500) and transactions for stats —
  // matches existing CRM page behavior and keeps RLS safe.
  let clients: ClientLike[] = []
  try {
    const fromClients = supabase.from('clients') as unknown as {
      select: (cols: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          order: (col: string) => {
            limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
          }
        }
      }
    }
    let q: {
      order: (c: string) => {
        limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
      }
    } = fromClients
      .select('id, name, birthday, tags, last_visit_at, location_id')
      .eq('business_id', businessId) as unknown as typeof q
    if (locationId) {
      // Chain location filter via supabase eq — use generic path
      const withLoc = fromClients
        .select('id, name, birthday, tags, last_visit_at, location_id')
        .eq('business_id', businessId) as unknown as {
        eq: (
          c: string,
          v: unknown,
        ) => {
          order: (c: string) => {
            limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
          }
        }
      }
      q = withLoc.eq('location_id', locationId)
    }
    const res = await q.order('created_at').limit(500)
    clients = ((res.data as unknown[]) ?? []) as ClientLike[]
  } catch {
    clients = []
  }

  if (clients.length === 0) return []

  // Enrich with transaction-derived stats (visits, last_visit, etc.)
  try {
    const ids = clients.map((c) => c.id)
    const txRes = await (
      supabase.from('transactions') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            eq: (
              col: string,
              val: unknown,
            ) => {
              in: (
                col: string,
                vals: unknown[],
              ) => {
                order: (
                  col: string,
                  opt: unknown,
                ) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> }
              }
            }
          }
        }
      }
    )
      .select('client_id, amount, created_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .in('client_id', ids)
      .order('created_at', { ascending: false })
      .limit(2000)

    const txs = (txRes.data as unknown as { client_id: string; created_at: string }[] | null) ?? []
    const map = new Map<string, { total_visits: number; last_visit_at: string | null }>()
    for (const tx of txs) {
      if (!tx.client_id) continue
      const entry = map.get(tx.client_id) ?? { total_visits: 0, last_visit_at: null }
      entry.total_visits++
      if (!entry.last_visit_at) entry.last_visit_at = tx.created_at
      map.set(tx.client_id, entry)
    }
    for (const c of clients) {
      const m = map.get(c.id)
      if (m) {
        c.total_visits = m.total_visits
        // Prefer transaction last_visit over client last_visit_at for accuracy
        if (m.last_visit_at) c.last_visit_at = m.last_visit_at
      } else if (c.total_visits == null) {
        c.total_visits = 0
      }
    }
  } catch {
    // fallback: use raw client fields
  }

  return filterClientsBySegment(clients, segment)
}

export async function createFromSegment(
  supabase: SupabaseLike,
  params: {
    businessId: string
    locationId?: string | null
    name: string
    segment: Segment
    channel: Channel
    template: string
  },
): Promise<Campaign> {
  const parsed = CampaignCreateSchema.safeParse({
    name: params.name,
    segment: params.segment,
    channel: params.channel,
    template: params.template,
    location_id: params.locationId ?? null,
  })
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), {
      details: parsed.error.flatten().fieldErrors,
    })
  if (!params.businessId) throw new Error('businessId required')

  // Fetch recipients for segment (respect location filter)
  const matched = await fetchSegmentClients(
    supabase,
    params.businessId,
    params.segment as Segment,
    params.locationId ?? null,
  )

  // Create campaign row
  const payload = {
    business_id: params.businessId,
    location_id: params.locationId || null,
    name: params.name.trim(),
    segment: params.segment,
    channel: params.channel,
    template: params.template.trim(),
    status: 'draft' as const,
    stats: { sent: 0, delivered: 0, rebooked: 0 },
  }

  const insertRes = await (
    supabase.from('campaigns') as unknown as {
      insert: (d: unknown) => {
        select: (c: string) => { single: () => Promise<{ data: Campaign | null; error: unknown }> }
      }
    }
  )
    .insert(payload)
    .select(
      'id, business_id, location_id, name, segment, channel, template, status, stats, sent_at, created_at',
    )
    .single()

  if (insertRes.error || !insertRes.data) {
    throw Object.assign(
      new Error(
        String(
          (insertRes.error as { message?: string } | null)?.message ?? 'campaign_create_failed',
        ),
      ),
      { cause: insertRes.error },
    )
  }
  const campaign = insertRes.data as Campaign

  if (matched.length > 0) {
    const recipientRows = matched.map((c) => ({
      campaign_id: campaign.id,
      client_id: c.id,
      status: 'pending' as const,
    }))
    // Insert in batches of 500 to avoid payload limits
    for (let i = 0; i < recipientRows.length; i += 500) {
      const batch = recipientRows.slice(i, i + 500)
      await (
        supabase.from('campaign_recipients') as unknown as {
          insert: (d: unknown) => Promise<{ error: unknown }>
        }
      ).insert(batch)
    }
    // Update stats.sent preview count (pending = to be sent)
    await (
      supabase.from('campaigns') as unknown as {
        update: (d: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
      }
    )
      .update({
        stats: { sent: 0, delivered: 0, rebooked: 0, recipients: matched.length },
      })
      .eq('id', campaign.id)
  }

  return campaign
}

async function isDuplicateWithinHour(
  supabase: SupabaseLike,
  businessId: string,
  clientId: string,
  event: string,
): Promise<boolean> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const res = await (
      supabase.from('notification_log') as unknown as {
        select: (
          c: string,
          opts?: unknown,
        ) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            eq: (
              col: string,
              val: unknown,
            ) => {
              eq: (
                col: string,
                val: unknown,
              ) => {
                gte: (
                  col: string,
                  val: unknown,
                ) => {
                  limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
                }
              }
            }
          }
        }
      }
    )
      .select('id', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('ref_id', clientId)
      .eq('type', event)
      .gte('sent_at', oneHourAgo)
      .limit(1)
    return ((res.data as unknown[])?.length ?? 0) > 0
  } catch {
    return false
  }
}

async function fetchCampaignOrThrow(supabase: SupabaseLike, campaignId: string): Promise<Campaign> {
  const res = await (
    supabase.from('campaigns') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => { single: () => Promise<{ data: Campaign | null; error: unknown }> }
      }
    }
  )
    .select(
      'id, business_id, location_id, name, segment, channel, template, status, stats, sent_at, created_at',
    )
    .eq('id', campaignId)
    .single()
  if (res.error || !res.data) throw Object.assign(new Error('campaign_not_found'), { status: 404 })
  const campaign = res.data as Campaign
  if (campaign.status !== 'draft' && campaign.status !== 'sending')
    throw Object.assign(new Error('campaign_not_draft'), { status: 409 })
  return campaign
}

async function markSending(supabase: SupabaseLike, campaignId: string): Promise<void> {
  await (
    supabase.from('campaigns') as unknown as {
      update: (d: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
    }
  )
    .update({ status: 'sending' })
    .eq('id', campaignId)
}

async function fetchRecipients(
  supabase: SupabaseLike,
  campaignId: string,
): Promise<CampaignRecipient[]> {
  const res = await (
    supabase.from('campaign_recipients') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => Promise<{ data: CampaignRecipient[] | null; error: unknown }>
      }
    }
  )
    .select('campaign_id, client_id, status')
    .eq('campaign_id', campaignId)
  return (res.data as CampaignRecipient[] | null) ?? []
}

async function handleEmptyRecipients(
  supabase: SupabaseLike,
  campaignId: string,
): Promise<{ sent: number; failed: number; stub: boolean }> {
  await (
    supabase.from('campaigns') as unknown as {
      update: (d: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
    }
  )
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      stats: { sent: 0, delivered: 0, rebooked: 0 },
    })
    .eq('id', campaignId)
  return { sent: 0, failed: 0, stub: true }
}

async function fetchBusinessInfo(
  supabase: SupabaseLike,
  businessId: string,
): Promise<{
  waCreds?: { phoneNumberId: string; accessToken: string } | undefined
  businessName: string
}> {
  try {
    const res = await (
      supabase.from('businesses') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => { single: () => Promise<{ data: unknown; error: unknown }> }
        }
      }
    )
      .select('name, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
      .eq('id', businessId)
      .single()
    const biz = res.data as {
      name: string
      meta_whatsapp_phone_number_id: string | null
      meta_whatsapp_access_token: string | null
    } | null
    if (!biz) return { businessName: '' }
    const waCreds =
      biz.meta_whatsapp_phone_number_id && biz.meta_whatsapp_access_token
        ? {
            phoneNumberId: biz.meta_whatsapp_phone_number_id,
            accessToken: biz.meta_whatsapp_access_token,
          }
        : undefined
    return { waCreds, businessName: biz.name ?? '' }
  } catch {
    return { businessName: '' }
  }
}

async function fetchClientsMap(
  supabase: SupabaseLike,
  clientIds: string[],
): Promise<
  Map<
    string,
    {
      id: string
      name: string
      phone: string | null
      email: string | null
      whatsapp_number: string | null
    }
  >
> {
  const res = await (
    supabase.from('clients') as unknown as {
      select: (c: string) => {
        in: (col: string, vals: unknown[]) => Promise<{ data: unknown[] | null; error: unknown }>
      }
    }
  )
    .select('id, name, phone, email, whatsapp_number')
    .in('id', clientIds)
  const map = new Map<
    string,
    {
      id: string
      name: string
      phone: string | null
      email: string | null
      whatsapp_number: string | null
    }
  >()
  for (const c of (res.data as unknown as
    | {
        id: string
        name: string
        phone: string | null
        email: string | null
        whatsapp_number: string | null
      }[]
    | null) ?? []) {
    const row = c as {
      id: string
      name: string
      phone: string | null
      email: string | null
      whatsapp_number: string | null
    }
    map.set(row.id, row)
  }
  return map
}

async function getWhatsAppSender(): Promise<
  | ((
      to: string,
      body: string,
      creds: { phoneNumberId: string; accessToken: string } | undefined,
    ) => Promise<boolean>)
  | null
> {
  try {
    const mod = await import('@/lib/whatsapp')
    return mod.sendWhatsAppMessage
  } catch {
    return null
  }
}

async function markRecipientFailed(
  supabase: SupabaseLike,
  campaignId: string,
  clientId: string,
): Promise<void> {
  await (
    supabase.from('campaign_recipients') as unknown as {
      update: (d: unknown) => {
        eq: (
          c: string,
          v: unknown,
        ) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
      }
    }
  )
    .update({ status: 'failed' })
    .eq('campaign_id', campaignId)
    .eq('client_id', clientId)
}

async function updateRecipientStatus(
  supabase: SupabaseLike,
  campaignId: string,
  clientId: string,
  ok: boolean,
): Promise<void> {
  const status = ok ? 'sent' : 'failed'
  await (
    supabase.from('campaign_recipients') as unknown as {
      update: (d: unknown) => {
        eq: (
          c: string,
          v: unknown,
        ) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
      }
    }
  )
    .update({ status })
    .eq('campaign_id', campaignId)
    .eq('client_id', clientId)
}

async function logNotification(
  supabase: SupabaseLike,
  businessId: string,
  clientId: string,
  campaignId: string,
  channel: string,
): Promise<void> {
  try {
    await (
      supabase.from('notification_log') as unknown as {
        insert: (d: unknown) => Promise<{ error: unknown }>
      }
    ).insert({ business_id: businessId, ref_id: clientId, type: `campaign:${campaignId}`, channel })
  } catch {}
}

async function deliverViaChannel(
  campaign: Campaign,
  client: {
    phone: string | null
    email: string | null
    whatsapp_number: string | null
    name: string
  },
  _businessName: string,
  waCreds: { phoneNumberId: string; accessToken: string } | undefined,
  hasCreds: boolean,
  sendWhatsApp:
    | ((
        to: string,
        body: string,
        creds: { phoneNumberId: string; accessToken: string } | undefined,
      ) => Promise<boolean>)
    | null,
  body: string,
): Promise<{ ok: boolean; stub: boolean }> {
  if (campaign.channel === 'whatsapp') {
    const to = client.whatsapp_number ?? client.phone
    if (!to || !sendWhatsApp) return { ok: false, stub: false }
    const ok = await sendWhatsApp(to, body, waCreds)
    if (!ok && !hasCreds) return { ok: true, stub: true }
    return { ok, stub: false }
  }
  if (campaign.channel === 'email') return { ok: !!client.email, stub: true }
  if (campaign.channel === 'telegram') return { ok: true, stub: true }
  return { ok: false, stub: false }
}

async function processSingleRecipient(
  supabase: SupabaseLike,
  campaign: Campaign,
  client: {
    id: string
    name: string
    phone: string | null
    email: string | null
    whatsapp_number: string | null
  },
  businessName: string,
  waCreds: { phoneNumberId: string; accessToken: string } | undefined,
  hasCreds: boolean,
  sendWhatsApp:
    | ((
        to: string,
        body: string,
        creds: { phoneNumberId: string; accessToken: string } | undefined,
      ) => Promise<boolean>)
    | null,
  campaignId: string,
): Promise<{ ok: boolean; stub: boolean; skipped?: boolean }> {
  const dedupEvent = `campaign:${campaignId}`
  if (await isDuplicateWithinHour(supabase, campaign.business_id, client.id, dedupEvent))
    return { ok: false, stub: false, skipped: true }
  const body = interpolateTemplate(campaign.template, {
    name: client.name,
    business: businessName,
    brand: businessName,
  })
  const res = await deliverViaChannel(
    campaign,
    client,
    businessName,
    waCreds,
    hasCreds,
    sendWhatsApp,
    body,
  )
  await logNotification(supabase, campaign.business_id, client.id, campaignId, campaign.channel)
  await updateRecipientStatus(supabase, campaignId, client.id, res.ok)
  return { ok: res.ok, stub: res.stub }
}

export async function sendCampaign(
  supabase: SupabaseLike,
  campaignId: string,
): Promise<{ sent: number; failed: number; stub: boolean }> {
  const campaign = await fetchCampaignOrThrow(supabase, campaignId)
  await markSending(supabase, campaignId)
  const recipients = await fetchRecipients(supabase, campaignId)
  if (recipients.length === 0) return handleEmptyRecipients(supabase, campaignId)
  const { waCreds, businessName } = await fetchBusinessInfo(supabase, campaign.business_id)
  const clientIds = recipients.map((r) => r.client_id)
  const clientsById = await fetchClientsMap(supabase, clientIds)
  const sendWhatsApp = await getWhatsAppSender()
  let sent = 0
  let failed = 0
  let stub = false
  const hasCreds = !!waCreds
  for (const r of recipients) {
    const client = clientsById.get(r.client_id)
    if (!client) {
      failed++
      await markRecipientFailed(supabase, campaignId, r.client_id)
      continue
    }
    const result = await processSingleRecipient(
      supabase,
      campaign,
      client,
      businessName,
      waCreds,
      hasCreds,
      sendWhatsApp,
      campaignId,
    )
    if (result.skipped) continue
    if (result.stub) stub = true
    if (result.ok) sent++
    else failed++
  }
  await (
    supabase.from('campaigns') as unknown as {
      update: (d: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
    }
  )
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      stats: { sent, delivered: sent, rebooked: 0, failed },
    })
    .eq('id', campaignId)
  return { sent, failed, stub }
}

export async function getCampaignStats(
  supabase: SupabaseLike,
  campaignId: string,
): Promise<{
  sent: number
  delivered: number
  rebooked: number
  failed: number
  recipients: number
  stats: Campaign['stats']
}> {
  const campRes = await (
    supabase.from('campaigns') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => { single: () => Promise<{ data: Campaign | null; error: unknown }> }
      }
    }
  )
    .select('id, business_id, stats, sent_at, status')
    .eq('id', campaignId)
    .single()
  if (campRes.error || !campRes.data)
    throw Object.assign(new Error('campaign_not_found'), { status: 404 })
  const campaign = campRes.data as Campaign

  const recRes = await (
    supabase.from('campaign_recipients') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => Promise<{ data: CampaignRecipient[] | null; error: unknown }>
      }
    }
  )
    .select('status')
    .eq('campaign_id', campaignId)

  const recipients = (recRes.data as CampaignRecipient[] | null) ?? []
  const sent = recipients.filter(
    (r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'rebooked',
  ).length
  const delivered = recipients.filter(
    (r) => r.status === 'delivered' || r.status === 'rebooked',
  ).length
  const rebooked = recipients.filter((r) => r.status === 'rebooked').length
  const failed = recipients.filter((r) => r.status === 'failed').length

  // Rebooked is also tracked via campaign_recipients status; stats may have rebooked incremented via attribution
  const statsRebooked = (campaign.stats as unknown as { rebooked?: number })?.rebooked ?? rebooked
  const mergedStats = {
    ...campaign.stats,
    sent,
    delivered,
    rebooked: Math.max(statsRebooked, rebooked),
  }

  return {
    sent,
    delivered,
    rebooked: mergedStats.rebooked,
    failed,
    recipients: recipients.length,
    stats: mergedStats as Campaign['stats'],
  }
}

// Attribution: called when appointment created with source=campaign
export async function attributeRebooking(
  supabase: SupabaseLike,
  params: { clientId: string; businessId: string; campaignId?: string | null },
): Promise<void> {
  const { clientId, businessId: _businessId, campaignId } = params
  void _businessId
  try {
    if (campaignId) {
      // Direct attribution if campaign_id known
      await (
        supabase.from('campaign_recipients') as unknown as {
          update: (d: unknown) => {
            eq: (
              c: string,
              v: unknown,
            ) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
          }
        }
      )
        .update({ status: 'rebooked' })
        .eq('campaign_id', campaignId)
        .eq('client_id', clientId)
      // Update campaign stats rebooked increment
      const statsRes = await (
        supabase.from('campaigns') as unknown as {
          select: (c: string) => {
            eq: (
              col: string,
              val: unknown,
            ) => { single: () => Promise<{ data: Campaign | null; error: unknown }> }
          }
        }
      )
        .select('stats')
        .eq('id', campaignId)
        .single()
      const current = (statsRes.data as Campaign | null)?.stats as unknown as {
        rebooked?: number
        sent?: number
        delivered?: number
      } | null
      if (current) {
        const next = { ...current, rebooked: (current.rebooked ?? 0) + 1 }
        await (
          supabase.from('campaigns') as unknown as {
            update: (d: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
          }
        )
          .update({ stats: next })
          .eq('id', campaignId)
      }
      return
    }
    // Indirect: find most recent sent campaign for this client+business where recipient is sent/delivered
    const campRes = await (
      supabase.from('campaign_recipients') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            in: (
              col: string,
              vals: unknown[],
            ) => Promise<{ data: CampaignRecipient[] | null; error: unknown }>
          }
        }
      }
    )
      .select('campaign_id, status')
      .eq('client_id', clientId)
      .in('status', ['sent', 'delivered'])

    const recs = (campRes.data as CampaignRecipient[] | null) ?? []
    if (recs.length === 0) return
    // Pick the most recent campaign (by created_at via campaigns join) — simplified: first
    // For precision we query campaigns for those ids
    const ids = recs.map((r) => r.campaign_id)
    const cRes = await (
      supabase.from('campaigns') as unknown as {
        select: (c: string) => {
          in: (
            col: string,
            vals: unknown[],
          ) => {
            order: (
              col: string,
              opt: unknown,
            ) => { limit: (n: number) => Promise<{ data: Campaign[] | null; error: unknown }> }
          }
        }
      }
    )
      .select('id, stats')
      .in('id', ids)
      .order('sent_at', { ascending: false })
      .limit(1)

    const target = (cRes.data as Campaign[] | null)?.[0]
    if (!target) return
    await (
      supabase.from('campaign_recipients') as unknown as {
        update: (d: unknown) => {
          eq: (
            c: string,
            v: unknown,
          ) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
        }
      }
    )
      .update({ status: 'rebooked' })
      .eq('campaign_id', target.id)
      .eq('client_id', clientId)
    const next = {
      ...(target.stats as unknown as Record<string, number>),
      rebooked: ((target.stats as unknown as { rebooked?: number }).rebooked ?? 0) + 1,
    }
    await (
      supabase.from('campaigns') as unknown as {
        update: (d: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
      }
    )
      .update({ stats: next })
      .eq('id', target.id)
  } catch {
    // attribution is best-effort, never throw
  }
}
