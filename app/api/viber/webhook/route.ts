/**
 * POST /api/viber/webhook?bid={businessId}
 *
 * Viber присылает сюда все события бота.
 */

import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import type { Database } from '@/lib/supabase/database.types'
import { sendViberMessage } from '@/lib/viber'

const ViberWebhookSchema = z
  .object({
    event: z.string().optional(),
    sender: z.object({ id: z.string(), name: z.string().optional() }).passthrough().optional(),
    user: z.object({ id: z.string(), name: z.string().optional() }).passthrough().optional(),
    context: z.string().optional(),
    message: z
      .object({ text: z.string().optional(), type: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

type ViberWebhookPayload = z.infer<typeof ViberWebhookSchema>

interface BusinessViberRow {
  id: string
  name: string
  viber_bot_token: string | null
  viber_chat_id: string | null
}
interface ClientViberRow {
  id: string
  name: string
}
interface AppointmentTodayRow {
  starts_at: string
  status: string
  clients: { name: string } | null
  services: { name: string } | null
}

async function handleViberClientOptIn(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  context: string,
  businessId: string,
): Promise<boolean> {
  if (!context.startsWith('client_') || !senderId) return false
  const clientId = context.replace('client_', '')
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return false
  const { data: clientData } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .eq('business_id', businessId)
    .maybeSingle<ClientViberRow>()
  const client = (clientData as unknown as ClientViberRow | null) ?? null
  if (!client) {
    await sendViberMessage(
      viberToken,
      senderId,
      `❌ Link not found. Please use the link from your booking confirmation.`,
    )
    return true
  }
  await supabase
    .from('clients')
    .update({ viber_user_id: senderId } as Database['public']['Tables']['clients']['Update'])
    .eq('id', clientId)
  await sendViberMessage(
    viberToken,
    senderId,
    [
      `✅ Hi ${client.name}!`,
      ``,
      `You're now connected to ${biz.name}.`,
      `You'll receive appointment reminders here automatically.`,
      ``,
      `See you soon! 👋`,
    ].join('\n'),
  )
  return true
}

async function handleViberOwnerConnect(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  senderName: string,
  businessId: string,
): Promise<boolean> {
  if (biz.viber_chat_id || !senderId) return false
  await supabase
    .from('businesses')
    .update({ viber_chat_id: senderId } as Database['public']['Tables']['businesses']['Update'])
    .eq('id', businessId)
  await sendViberMessage(
    viberToken,
    senderId,
    [
      `👋 Hi ${senderName}!`,
      ``,
      `You are now connected to ${biz.name} on Pronto.`,
      ``,
      `You'll receive notifications here:`,
      `• 📅 New bookings`,
      `• 🔔 Appointment reminders`,
      `• ⚠️ Low-stock alerts`,
      `• ✅ Visit completions`,
      ``,
      `Send /help to see available commands.`,
    ].join('\n'),
  )
  return true
}

async function handleConversationStarted(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  senderName: string,
  businessId: string,
  context: string,
): Promise<boolean> {
  const clientHandled = await handleViberClientOptIn(
    supabase,
    biz,
    viberToken,
    senderId,
    context,
    businessId,
  )
  if (clientHandled) return true
  const ownerHandled = await handleViberOwnerConnect(
    supabase,
    biz,
    viberToken,
    senderId,
    senderName,
    businessId,
  )
  if (ownerHandled) return true
  return false
}

async function handleViberStart(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  text: string,
  businessId: string,
): Promise<boolean> {
  if (!text.startsWith('/start') || !senderId) return false
  await supabase
    .from('businesses')
    .update({ viber_chat_id: senderId } as Database['public']['Tables']['businesses']['Update'])
    .eq('id', businessId)
  await sendViberMessage(
    viberToken,
    senderId,
    `✅ Connected to ${biz.name}! You will receive notifications here.`,
  )
  return true
}

async function handleViberLink(
  supabase: ReturnType<typeof createClient<Database>>,
  _biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  text: string,
  businessId: string,
): Promise<boolean> {
  if (!text.startsWith('/link') || !senderId) return false
  const phone = text.replace('/link', '').trim()
  if (!phone) return true
  const { data: clientData } = await supabase
    .from('clients')
    .select('id, name')
    .eq('business_id', businessId)
    .eq('phone', phone)
    .maybeSingle<ClientViberRow>()
  const client = (clientData as unknown as ClientViberRow | null) ?? null
  if (client) {
    await supabase
      .from('clients')
      .update({ viber_user_id: senderId } as Database['public']['Tables']['clients']['Update'])
      .eq('id', client.id)
    await sendViberMessage(
      viberToken,
      senderId,
      `✅ Hi ${client.name}! Your Viber is now linked. You'll receive appointment reminders here.`,
    )
  } else {
    await sendViberMessage(
      viberToken,
      senderId,
      `❌ Phone number not found. Make sure it matches the number you used when booking.`,
    )
  }
  return true
}

async function handleViberToday(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  text: string,
  businessId: string,
): Promise<boolean> {
  const isOwner = senderId === (biz.viber_chat_id ?? '')
  if (!text.startsWith('/today') || !isOwner) return false
  const today = new Date()
  const start = new Date(today.setHours(0, 0, 0, 0)).toISOString()
  const end = new Date(today.setHours(23, 59, 59, 999)).toISOString()
  const { data: apptsData } = await supabase
    .from('appointments')
    .select('starts_at, status, clients(name), services(name)')
    .eq('business_id', businessId)
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')

  const appts = (apptsData as unknown as AppointmentTodayRow[] | null) ?? null
  if (!appts || appts.length === 0) {
    await sendViberMessage(viberToken, senderId, '📅 No appointments today.')
    return true
  }
  const lines = appts.map((a) => {
    const time = new Date(a.starts_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const statusEmoji: Record<string, string> = {
      confirmed: '🔵',
      pending: '🟡',
      completed: '🟢',
      cancelled: '⛔',
      no_show: '❌',
    }
    return `${statusEmoji[a.status] ?? '⚪'} ${time} — ${a.clients?.name ?? 'Walk-in'} (${a.services?.name ?? '—'})`
  })
  await sendViberMessage(
    viberToken,
    senderId,
    `📅 Today's appointments (${String(appts.length)})\n\n${lines.join('\n')}`,
  )
  return true
}

async function handleViberHelp(
  biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  text: string,
): Promise<boolean> {
  if (!text.startsWith('/help')) return false
  const targetId = senderId || (biz.viber_chat_id ?? '')
  if (!targetId) return true
  await sendViberMessage(
    viberToken,
    targetId,
    [
      `Pronto Bot — available commands:`,
      ``,
      `/today — today's appointments (owner only)`,
      `/link {phone} — link your Viber to your client profile`,
      `  Example: /link +79001234567`,
      `/help — this message`,
    ].join('\n'),
  )
  return true
}

async function handleViberMessage(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessViberRow,
  viberToken: string,
  senderId: string,
  text: string,
  businessId: string,
): Promise<boolean> {
  if (await handleViberStart(supabase, biz, viberToken, senderId, text, businessId)) return true
  if (await handleViberLink(supabase, biz, viberToken, senderId, text, businessId)) return true
  if (await handleViberToday(supabase, biz, viberToken, senderId, text, businessId)) return true
  if (await handleViberHelp(biz, viberToken, senderId, text)) return true
  if (senderId)
    await sendViberMessage(viberToken, senderId, 'Send /help to see available commands.')
  return true
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const _ipPOST: string = getIp(req as unknown as Request)
  if (!rateLimit(`webhook-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }
  try {
    const businessId: string | null = req.nextUrl.searchParams.get('bid')
    if (!businessId) return NextResponse.json({ status: 0 })
    const raw: unknown = (await req.json()) as unknown
    const parsed = ViberWebhookSchema.safeParse(raw)
    const body: ViberWebhookPayload = parsed.success ? parsed.data : {}
    const event: string = body.event ?? ''
    if (!event) return NextResponse.json({ status: 0 })
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: bizData } = await supabase
      .from('businesses')
      .select('id, name, viber_bot_token, viber_chat_id')
      .eq('id', businessId)
      .single<BusinessViberRow>()
    const biz: BusinessViberRow | null = (bizData as unknown as BusinessViberRow | null) ?? null
    if (!biz?.viber_bot_token) return NextResponse.json({ status: 0 })
    const viberToken: string = biz.viber_bot_token
    const senderId: string = body.sender?.id ?? body.user?.id ?? ''
    const senderName: string = body.sender?.name ?? body.user?.name ?? 'there'
    if (event === 'conversation_started') {
      const context: string = body.context ?? ''
      const handled = await handleConversationStarted(
        supabase,
        biz,
        viberToken,
        senderId,
        senderName,
        businessId,
        context,
      )
      void handled
      return NextResponse.json({ status: 0 })
    }
    if (event === 'message') {
      const text: string = body.message?.text ?? ''
      await handleViberMessage(supabase, biz, viberToken, senderId, text, businessId)
      return NextResponse.json({ status: 0 })
    }
    return NextResponse.json({ status: 0 })
  } catch (_err: unknown) {
    return NextResponse.json({ status: 0 })
  }
}
