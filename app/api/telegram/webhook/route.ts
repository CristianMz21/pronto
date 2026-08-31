/**
 * POST /api/telegram/webhook?bid={businessId}
 *
 * Telegram присылает сюда все сообщения боту.
 *
 * Flows:
 *  /start               → owner connects, saves chat_id to businesses
 *  /start client_{uuid} → client opt-in, saves chat_id to clients.telegram_id
 *  /link {phone}        → fallback: client links by phone number
 *  /today               → owner: appointments today
 *  /help                → command list
 */

import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import type { Database } from '@/lib/supabase/database.types'
import { sendTelegramMessage } from '@/lib/telegram'

const TelegramWebhookSchema = z
  .object({
    message: z
      .object({
        chat: z
          .object({ id: z.union([z.number(), z.string()]) })
          .passthrough()
          .optional(),
        text: z.string().optional(),
        from: z.object({ first_name: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

type TelegramWebhookPayload = z.infer<typeof TelegramWebhookSchema>

interface BusinessTelegramRow {
  id: string
  name: string
  telegram_bot_token: string | null
  telegram_chat_id: string | null
}

interface ClientOptInRow {
  id: string
  name: string
  phone: string | null
  email: string | null
}

interface ClientLinkRow {
  id: string
  name: string
}

interface AppointmentTodayRow {
  starts_at: string
  status: string
  clients: { name: string } | null
  services: { name: string } | null
}

function toTitleCase(name: string): string {
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}


async function handleTelegramStart(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessTelegramRow,
  botToken: string,
  chatId: string,
  text: string,
  businessId: string,
  firstName: string,
): Promise<boolean> {
  if (!text.startsWith('/start')) return false
  const param = text.replace('/start', '').trim()
  if (param.startsWith('client_')) {
    const clientId = param.replace('client_', '')
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
      await sendTelegramMessage(botToken, chatId, `❌ Link not found. Please use the link from your booking confirmation.`)
      return true
    }
    const { data: clientData } = await supabase.from('clients').select('id, name, phone, email').eq('id', clientId).eq('business_id', businessId).maybeSingle<ClientOptInRow>()
    const client = (clientData as unknown as ClientOptInRow | null) ?? null
    if (!client) {
      await sendTelegramMessage(botToken, chatId, `❌ Link not found. Please use the link from your booking confirmation.`)
      return true
    }
    if (client.phone) await supabase.from('clients').update({ telegram_id: chatId } as Database['public']['Tables']['clients']['Update']).eq('business_id', businessId).eq('phone', client.phone)
    else if (client.email) await supabase.from('clients').update({ telegram_id: chatId } as Database['public']['Tables']['clients']['Update']).eq('business_id', businessId).eq('email', client.email)
    else await supabase.from('clients').update({ telegram_id: chatId } as Database['public']['Tables']['clients']['Update']).eq('id', clientId)
    await sendTelegramMessage(botToken, chatId, [`✅ Hi ${toTitleCase(client.name)}!`, ``, `You're now connected to <b>${biz.name}</b>.`, `You'll receive appointment reminders here automatically.`, ``, `See you soon! 👋`].join('\n'))
    return true
  }
  await supabase.from('businesses').update({ telegram_chat_id: chatId } as Database['public']['Tables']['businesses']['Update']).eq('id', businessId)
  await sendTelegramMessage(botToken, chatId, [`👋 Hi ${firstName}!`, ``, `You are now connected to <b>${biz.name}</b> on Pronto.`, ``, `You'll receive notifications here:`, `• 📅 New bookings`, `• 🔔 Appointment reminders`, `• ⚠️ Low-stock alerts`, `• ✅ Visit completions`, ``, `Send /help to see available commands.`].join('\n'))
  return true
}

async function handleTelegramLink(
  supabase: ReturnType<typeof createClient<Database>>,
  botToken: string,
  chatId: string,
  text: string,
  businessId: string,
): Promise<boolean> {
  if (!text.startsWith('/link')) return false
  const phone = text.replace('/link', '').trim()
  if (!phone) {
    await sendTelegramMessage(botToken, chatId, `Please include your phone number.\nExample: /link +79001234567`)
    return true
  }
  const { data: clientsData } = await supabase.from('clients').select('id, name').eq('business_id', businessId).eq('phone', phone).returns<ClientLinkRow[]>()
  const clients = (clientsData as unknown as ClientLinkRow[] | null) ?? null
  if (clients && clients.length > 0) {
    await supabase.from('clients').update({ telegram_id: chatId } as Database['public']['Tables']['clients']['Update']).eq('business_id', businessId).eq('phone', phone)
    const displayName = clients[0] ? toTitleCase(clients[0].name) : 'there'
    await sendTelegramMessage(botToken, chatId, `✅ Hi ${displayName}! Your Telegram is linked. You'll receive appointment reminders here.`)
  } else {
    await sendTelegramMessage(botToken, chatId, `❌ Phone number not found. Make sure it matches the number you used when booking.`)
  }
  return true
}

async function handleTelegramToday(
  supabase: ReturnType<typeof createClient<Database>>,
  botToken: string,
  chatId: string,
  text: string,
  businessId: string,
): Promise<boolean> {
  if (!text.startsWith('/today')) return false
  const today = new Date()
  const start = new Date(today.setHours(0, 0, 0, 0)).toISOString()
  const end = new Date(today.setHours(23, 59, 59, 999)).toISOString()
  const { data: apptsData } = await supabase.from('appointments').select('starts_at, status, clients(name), services(name)').eq('business_id', businessId).gte('starts_at', start).lte('starts_at', end).order('starts_at').returns<AppointmentTodayRow[]>()
  const appts = (apptsData as unknown as AppointmentTodayRow[] | null) ?? null
  if (!appts || appts.length === 0) {
    await sendTelegramMessage(botToken, chatId, '📅 No appointments today.')
    return true
  }
  const statusEmoji: Record<string, string> = { confirmed: '🔵', pending: '🟡', completed: '🟢', cancelled: '🔴', no_show: '❌' }
  const lines = appts.map((a) => {
    const time = new Date(a.starts_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    const client = toTitleCase(a.clients?.name ?? 'Walk-in')
    const service = a.services?.name ?? '—'
    const emoji = statusEmoji[a.status] ?? '⚪'
    return `${emoji} ${time} — ${client} (${service})`
  })
  const statuses = new Set(appts.map((a) => a.status))
  const legend = ['🔵 Confirmed', '🟢 Completed', ...(statuses.has('cancelled') ? ['🔴 Cancelled'] : [])].join('  ')
  await sendTelegramMessage(botToken, chatId, `📅 <b>Today's appointments (${String(appts.length)})</b>\n\n${lines.join('\n')}\n\n${legend}`)
  return true
}

async function handleTelegramHelp(botToken: string, chatId: string, text: string): Promise<boolean> {
  if (!text.startsWith('/help')) return false
  await sendTelegramMessage(botToken, chatId, [`<b>Pronto Bot — available commands:</b>`, ``, `/today — today's appointments (owner only)`, `/link {phone} — link your Telegram to your client profile`, `  Example: /link +79001234567`, `/help — this message`].join('\n'))
  return true
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const _ipPOST: string = getIp(req as unknown as Request)
  if (!rateLimit(`webhook-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 })) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  try {
    const businessId: string | null = req.nextUrl.searchParams.get('bid')
    if (!businessId) return NextResponse.json({ ok: false }, { status: 400 })

    const raw: unknown = (await req.json()) as unknown
    const parsed = TelegramWebhookSchema.safeParse(raw)
    const body: TelegramWebhookPayload = parsed.success ? parsed.data : {}
    const message = body.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId = String(message.chat?.id ?? '')
    const text = message.text ?? ''
    const firstName = message.from?.first_name ?? 'there'

    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: bizData } = await supabase.from('businesses').select('id, name, telegram_bot_token, telegram_chat_id').eq('id', businessId).single<BusinessTelegramRow>()
    const biz = (bizData as unknown as BusinessTelegramRow | null) ?? null
    if (!biz?.telegram_bot_token) return NextResponse.json({ ok: true })
    const botToken = biz.telegram_bot_token

    if (await handleTelegramStart(supabase, biz, botToken, chatId, text, businessId, firstName)) return NextResponse.json({ ok: true })
    if (await handleTelegramLink(supabase, botToken, chatId, text, businessId)) return NextResponse.json({ ok: true })
    if (await handleTelegramToday(supabase, botToken, chatId, text, businessId)) return NextResponse.json({ ok: true })
    if (await handleTelegramHelp(botToken, chatId, text)) return NextResponse.json({ ok: true })

    if (biz.telegram_chat_id === chatId) await sendTelegramMessage(botToken, chatId, 'Use /help to see available commands.')
    return NextResponse.json({ ok: true })
  } catch (_err: unknown) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
