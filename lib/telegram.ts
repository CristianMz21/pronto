/**
 * lib/telegram.ts
 * Telegram Bot API — отправка сообщений и регистрация вебхука.
 */

import { isRecord } from '@/lib/supabase/typed'

const BASE = 'https://api.telegram.org/bot'

// ─── Отправить текстовое сообщение ────────────────────────────────────────────

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    })
    const raw: unknown = (await res.json()) as unknown
    if (!isRecord(raw)) return false
    const ok: unknown = raw['ok']
    return ok === true
  } catch (_err: unknown) {
    // console.error('[telegram] sendMessage exception:', err)
    return false
  }
}

// ─── Зарегистрировать вебхук ───────────────────────────────────────────────────

export async function setTelegramWebhook(
  token: string,
  webhookUrl: string,
): Promise<{ ok: boolean; description?: string }> {
  try {
    const res = await fetch(`${BASE}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    })
    const raw: unknown = (await res.json()) as unknown
    if (isRecord(raw) && typeof raw['ok'] === 'boolean') {
      const ok: boolean = raw['ok']
      const description: unknown = raw['description']
      if (typeof description === 'string') {
        return { ok, description }
      }
      return { ok }
    }
    // Fallback if shape unexpected but ok
    if (isRecord(raw)) {
      return { ok: false, description: 'Invalid response shape' }
    }
    return { ok: false, description: 'Invalid response' }
  } catch (err: unknown) {
    const message: string = err instanceof Error ? err.message : String(err)
    return { ok: false, description: message }
  }
}

// ─── Получить информацию о боте ───────────────────────────────────────────────

export async function getTelegramBotInfo(
  token: string,
): Promise<{ ok: boolean; result?: { username: string; first_name: string } }> {
  try {
    const res = await fetch(`${BASE}${token}/getMe`)
    const raw: unknown = (await res.json()) as unknown
    if (!isRecord(raw) || typeof raw['ok'] !== 'boolean') {
      return { ok: false }
    }
    const ok: boolean = raw['ok']
    if (!ok) return { ok: false }
    const result: unknown = raw['result']
    if (
      isRecord(result) &&
      typeof result['username'] === 'string' &&
      typeof result['first_name'] === 'string'
    ) {
      return {
        ok: true,
        result: { username: result['username'], first_name: result['first_name'] },
      }
    }
    // If result missing but ok true, return ok true without result
    return { ok: true }
  } catch (_err: unknown) {
    return { ok: false }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function escapeTelegramHtml(str: string): string {
  return escapeHtml(str)
}

// ─── Шаблоны сообщений ────────────────────────────────────────────────────────

export function tplNewBooking(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  employeeName?: string | undefined
  source?: string | undefined
}): string {
  const source = opts.source === 'online' ? ' 🌐 online' : ''
  return [
    `📅 <b>New booking${source}</b>`,
    ``,
    `👤 Client: ${escapeHtml(opts.clientName)}`,
    `✂️ Service: ${escapeHtml(opts.serviceName)}`,
    `🕐 ${escapeHtml(opts.date)} at ${escapeHtml(opts.time)}`,
    opts.employeeName ? `👷 Employee: ${escapeHtml(opts.employeeName)}` : '',
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
    `🔔 <b>Appointment ${when}</b>`,
    ``,
    `👤 ${escapeHtml(opts.clientName)}`,
    `✂️ ${escapeHtml(opts.serviceName)}`,
    `🕐 ${escapeHtml(opts.date)} at ${escapeHtml(opts.time)}`,
  ].join('\n')
}

export function tplLowStock(opts: {
  itemName: string
  quantity: number
  unit: string
  threshold: number
}): string {
  return [
    `⚠️ <b>Low stock alert</b>`,
    ``,
    `📦 ${escapeHtml(opts.itemName)}`,
    `Current: <b>${opts.quantity} ${escapeHtml(opts.unit)}</b> (threshold: ${opts.threshold})`,
  ].join('\n')
}

export function tplThankYou(opts: { clientName: string; serviceName: string }): string {
  return [
    `✅ <b>Visit completed</b>`,
    ``,
    `👤 ${escapeHtml(opts.clientName)}`,
    `✂️ ${escapeHtml(opts.serviceName)}`,
    `Thank-you message sent to client.`,
  ].join('\n')
}

export function tplReactivation(opts: { clientName: string }): string {
  return [
    `📤 <b>Reactivation sent</b>`,
    ``,
    `👤 ${escapeHtml(opts.clientName)}`,
    `We invited this client to return after 30 days of inactivity.`,
  ].join('\n')
}

export function tplBirthday(opts: { clientName: string }): string {
  return [
    `🎂 <b>Birthday message sent</b>`,
    ``,
    `👤 ${escapeHtml(opts.clientName)}`,
    `We sent them birthday wishes today.`,
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
  const when = opts.isOneHour ? 'in 1 hour ⏰' : 'tomorrow 📅'
  const lines = [
    `🔔 <b>Appointment reminder ${when}</b>`,
    ``,
    `👤 ${escapeHtml(opts.clientName)}`,
    `✂️ ${escapeHtml(opts.serviceName)}`,
    `🕐 ${escapeHtml(opts.date)} at ${escapeHtml(opts.time)}`,
    `🏠 ${escapeHtml(opts.businessName)}`,
  ]
  if (opts.address) lines.push(`📍 ${escapeHtml(opts.address)}`)
  return lines.join('\n')
}

export function tplThankYouClient(opts: {
  clientName: string
  serviceName: string
  businessName: string
  bookingUrl?: string | undefined
}): string {
  const lines = [
    `✅ <b>Thank you for your visit, ${escapeHtml(opts.clientName)}!</b>`,
    ``,
    `✂️ ${escapeHtml(opts.serviceName)}`,
    `🏠 ${escapeHtml(opts.businessName)}`,
    ``,
    `We'd love to see you again!`,
  ]
  if (opts.bookingUrl) lines.push(``, `📅 Book again: ${opts.bookingUrl}`)
  return lines.join('\n')
}

export function tplReactivationClient(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string | undefined
}): string {
  const lines = [
    `👋 <b>${escapeHtml(opts.clientName)}, it's been a while!</b>`,
    ``,
    `Come back to ${escapeHtml(opts.businessName)} — we'd love to see you!`,
  ]
  if (opts.bookingUrl) lines.push(``, `📅 Book now: ${opts.bookingUrl}`)
  return lines.join('\n')
}

export function tplBirthdayClient(opts: {
  clientName: string
  businessName: string
  bookingUrl?: string | undefined
}): string {
  const lines = [
    `🎂 <b>Happy Birthday, ${escapeHtml(opts.clientName)}!</b>`,
    ``,
    `The team at ${escapeHtml(opts.businessName)} wishes you all the best! 🎉`,
  ]
  if (opts.bookingUrl) lines.push(``, `🎁 Treat yourself: ${opts.bookingUrl}`)
  return lines.join('\n')
}
