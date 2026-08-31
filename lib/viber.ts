/**
 * lib/viber.ts
 * Viber Bot API — отправка сообщений и регистрация вебхука.
 *
 * Как это работает (объяснение):
 * Viber Bot API — это сервис Viber для бизнесов (называется "Public Account").
 * Каждый бот имеет уникальный auth-token. Все запросы идут на chatapi.viber.com.
 * В отличие от Telegram, аутентификация через заголовок X-Viber-Auth-Token.
 */

import { isRecord } from '@/lib/supabase/typed'

const BASE = 'https://chatapi.viber.com/pa'

interface ViberApiResponse {
  status: number
  status_message?: string | undefined
  name?: string | undefined
  uri?: string | undefined
}

function parseViberResponse(raw: unknown): ViberApiResponse | null {
  if (!isRecord(raw)) return null
  const status: unknown = raw['status']
  if (typeof status !== 'number') return null
  const statusMessage: unknown = raw['status_message']
  const name: unknown = raw['name']
  const uri: unknown = raw['uri']
  const result: ViberApiResponse = { status }
  if (typeof statusMessage === 'string') result.status_message = statusMessage
  if (typeof name === 'string') result.name = name
  if (typeof uri === 'string') result.uri = uri
  return result
}

// ─── Отправить текстовое сообщение ────────────────────────────────────────────

export async function sendViberMessage(
  token: string,
  userId: string,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/send_message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Viber-Auth-Token': token,
      },
      body: JSON.stringify({
        receiver: userId,
        min_api_version: 1,
        sender: { name: 'Pronto' },
        type: 'text',
        text,
      }),
    })
    const raw: unknown = (await res.json()) as unknown
    const parsed: ViberApiResponse | null = parseViberResponse(raw)
    // Viber returns status=0 on success (0 = ok, other = error)
    if (parsed === null || parsed.status !== 0) {
      return false
    }
    return true
  } catch (_err: unknown) {
    // console.error('[viber] sendMessage exception:', err)
    return false
  }
}

// ─── Зарегистрировать вебхук ───────────────────────────────────────────────────
// Вебхук — это адрес на вашем сервере, куда Viber будет присылать сообщения от пользователей.

export async function setViberWebhook(
  token: string,
  webhookUrl: string,
): Promise<{ ok: boolean; description?: string }> {
  try {
    const res = await fetch(`${BASE}/set_webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Viber-Auth-Token': token,
      },
      body: JSON.stringify({
        url: webhookUrl,
        event_types: ['conversation_started', 'message', 'subscribed'],
        send_name: true,
      }),
    })
    const raw: unknown = (await res.json()) as unknown
    const parsed: ViberApiResponse | null = parseViberResponse(raw)
    if (parsed === null || parsed.status !== 0) {
      const description: string = parsed?.status_message ?? 'Unknown error'
      return { ok: false, description }
    }
    return { ok: true }
  } catch (err: unknown) {
    const message: string = err instanceof Error ? err.message : String(err)
    return { ok: false, description: message }
  }
}

// ─── Получить информацию о боте (для проверки токена) ─────────────────────────

export async function getViberBotInfo(
  token: string,
): Promise<{ ok: boolean; name?: string; uri?: string }> {
  try {
    const res = await fetch(`${BASE}/get_account_info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Viber-Auth-Token': token,
      },
      body: JSON.stringify({}),
    })
    const raw: unknown = (await res.json()) as unknown
    const parsed: ViberApiResponse | null = parseViberResponse(raw)
    if (parsed === null || parsed.status !== 0) {
      return { ok: false }
    }
    const out: { ok: boolean; name?: string; uri?: string } = { ok: true }
    if (parsed.name) out.name = parsed.name
    if (parsed.uri) out.uri = parsed.uri
    return out
  } catch (_err: unknown) {
    return { ok: false }
  }
}

// ─── Шаблоны сообщений (те же что в Telegram, но без HTML-тегов) ──────────────
// Viber поддерживает только простой текст в базовом режиме

export function tplNewBooking(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  employeeName?: string | undefined
  source?: string | undefined
}): string {
  const source = opts.source === 'online' ? ' (online)' : ''
  return [
    `📅 New booking${source}`,
    ``,
    `👤 Client: ${opts.clientName}`,
    `✂️ Service: ${opts.serviceName}`,
    `🕐 ${opts.date} at ${opts.time}`,
    opts.employeeName ? `👷 Employee: ${opts.employeeName}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function tplReminder(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  isOneHour?: boolean | undefined
}): string {
  const when = opts.isOneHour ? 'in 1 hour ⏰' : 'tomorrow 📅'
  return [
    `🔔 Appointment ${when}`,
    ``,
    `👤 ${opts.clientName}`,
    `✂️ ${opts.serviceName}`,
    `🕐 ${opts.date} at ${opts.time}`,
  ].join('\n')
}

export function tplLowStock(opts: {
  itemName: string
  quantity: number
  unit: string
  threshold: number
}): string {
  return [
    `⚠️ Low stock alert`,
    ``,
    `📦 ${opts.itemName}`,
    `Current: ${opts.quantity} ${opts.unit} (threshold: ${opts.threshold})`,
  ].join('\n')
}

export function tplThankYou(opts: { clientName: string; serviceName: string }): string {
  return [
    `✅ Visit completed`,
    ``,
    `👤 ${opts.clientName}`,
    `✂️ ${opts.serviceName}`,
    `Thank-you message sent to client.`,
  ].join('\n')
}

// ─── Шаблоны для клиентов ─────────────────────────────────────────────────────

export function tplReminderClient(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  businessName: string
  address?: string | undefined
  isOneHour?: boolean | undefined
}): string {
  const when = opts.isOneHour ? 'через 1 час ⏰' : 'завтра 📅'
  const lines = [
    `🔔 Напоминание о записи ${when}`,
    ``,
    `👤 ${opts.clientName}`,
    `✂️ ${opts.serviceName}`,
    `🕐 ${opts.date} в ${opts.time}`,
    `🏠 ${opts.businessName}`,
  ]
  if (opts.address) lines.push(`📍 ${opts.address}`)
  return lines.join('\n')
}

export function tplThankYouClient(opts: {
  clientName: string
  serviceName: string
  businessName: string
  bookingUrl?: string | undefined
}): string {
  const lines = [
    `✅ Спасибо за визит, ${opts.clientName}!`,
    ``,
    `✂️ ${opts.serviceName}`,
    `🏠 ${opts.businessName}`,
    ``,
    `Будем рады видеть вас снова!`,
  ]
  if (opts.bookingUrl) lines.push(`📅 Записаться: ${opts.bookingUrl}`)
  return lines.join('\n')
}

export function tplReactivation(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string | undefined
}): string {
  const lines = [
    `👋 ${opts.clientName}, давно не виделись!`,
    ``,
    `Приходите снова в ${opts.businessName} — будем рады!`,
  ]
  if (opts.bookingUrl) lines.push(`📅 Записаться: ${opts.bookingUrl}`)
  return lines.join('\n')
}

export function tplBirthday(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string | undefined
}): string {
  const lines = [
    `🎂 С днём рождения, ${opts.clientName}!`,
    ``,
    `Команда ${opts.businessName} поздравляет вас и желает всего самого лучшего! 🎉`,
  ]
  if (opts.bookingUrl) lines.push(`🎁 Записаться на визит: ${opts.bookingUrl}`)
  return lines.join('\n')
}
