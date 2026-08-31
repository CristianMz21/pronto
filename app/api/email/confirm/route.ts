import { createClient as createAdminClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { formatEmailDate, formatEmailTime, sendBookingConfirmation } from '@/lib/email'
import { buildGCalUrlFromISO } from '@/lib/gcal'
import { getIp, rateLimit } from '@/lib/rate-limit'
import type { Database } from '@/lib/supabase/database.types'
import { sendTelegramMessage, tplNewBooking } from '@/lib/telegram'
import { sendViberMessage, tplNewBooking as viberTplNewBooking } from '@/lib/viber'
import {
  sendWhatsAppMessage,
  tplBookingConfirmation as waTplBookingConfirmation,
} from '@/lib/whatsapp'

const ConfirmBodySchema = z.object({
  appointmentId: z.string().uuid(),
  formEmail: z.string().email().nullable().optional(),
})

interface AppointmentConfirmRow {
  id: string
  starts_at: string
  business_id: string
  source: string | null
  services: { name: string; duration_min: number } | null
  employees: { name: string } | null
  clients: {
    name: string
    email: string | null
    whatsapp_number: string | null
    telegram_id: string | null
    viber_user_id: string | null
  } | null
}

interface BusinessConfirmRow {
  name: string
  address: string | null
  slug: string | null
  timezone: string | null
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  viber_bot_token: string | null
  viber_chat_id: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
}

interface NotificationLogIdRow {
  id: string
}

// Telegram confirmation template for client
function tplConfirmClient(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  businessName: string
  address?: string
}): string {
  const lines: string[] = [
    `✅ <b>Booking confirmed!</b>`,
    ``,
    `👤 ${opts.clientName}`,
    `📋 ${opts.serviceName}`,
    `🕐 ${opts.date} at ${opts.time}`,
    `🏠 ${opts.businessName}`,
  ]
  if (opts.address) lines.push(`📍 ${opts.address}`)
  lines.push(``, `We'll remind you before the appointment.`)
  return lines.join('\n')
}

function viberTplConfirmClient(opts: {
  clientName: string
  serviceName: string
  date: string
  time: string
  businessName: string
  address?: string
}): string {
  const lines: string[] = [
    `✅ Booking confirmed!`,
    ``,
    `👤 ${opts.clientName}`,
    `📋 ${opts.serviceName}`,
    `🕐 ${opts.date} at ${opts.time}`,
    `🏠 ${opts.businessName}`,
  ]
  if (opts.address) lines.push(`📍 ${opts.address}`)
  lines.push(``, `We'll remind you before the appointment.`)
  return lines.join('\n')
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const _ipPOST: string = getIp(req as unknown as Request)
  if (!rateLimit(`confirm-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  try {
    const authHeader: string | null = req.headers.get('authorization')
    const expectedSecret: string | undefined = process.env.INTERNAL_API_SECRET
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!expectedSecret) {
      // INTERNAL_API_SECRET not set — endpoint unprotected
    }

    const raw: unknown = (await req.json()) as unknown
    const parsed = ConfirmBodySchema.safeParse(raw)
    if (!parsed.success) {
      const hasAppointmentId =
        typeof (raw as Record<string, unknown>)?.appointmentId === 'string' &&
        ((raw as Record<string, unknown>).appointmentId as string).length > 0
      if (!hasAppointmentId) {
        return NextResponse.json({ error: 'missing appointmentId' }, { status: 400 })
      }
      return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
    }
    const appointmentId: string = parsed.data.appointmentId
    const formEmail: string | null | undefined = parsed.data.formEmail

    // Используем service role — этот роут вызывается server-to-server (из /api/book),
    // без cookies пользователя, поэтому анонимный клиент блокировался бы RLS.
    const supabase = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: apptData, error: apptErr } = await supabase
      .from('appointments')
      .select(
        'id, starts_at, business_id, source, services(name, duration_min), employees(name), clients(name, email, whatsapp_number, telegram_id, viber_user_id)',
      )
      .eq('id', appointmentId)
      .single<AppointmentConfirmRow>()

    if (apptErr) void apptErr.message
    const appt: AppointmentConfirmRow | null =
      (apptData as unknown as AppointmentConfirmRow | null) ?? null
    if (!appt) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const client: AppointmentConfirmRow['clients'] = appt.clients
    const service: AppointmentConfirmRow['services'] = appt.services
    const employee: AppointmentConfirmRow['employees'] = appt.employees

    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, address, slug, timezone, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', appt.business_id)
      .single<BusinessConfirmRow>()

    const biz: BusinessConfirmRow | null = (bizData as unknown as BusinessConfirmRow | null) ?? null

    const tz: string = biz?.timezone ?? 'UTC'
    const date: string = formatEmailDate(appt.starts_at, tz)
    const time: string = formatEmailTime(appt.starts_at, tz)

    // ── Telegram → владельцу ────────────────────────────────────────────────
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      const token: string = biz.telegram_bot_token
      const chatId: string = biz.telegram_chat_id
      const ownerTplOpts: Parameters<typeof tplNewBooking>[0] = {
        clientName: client?.name ?? 'Walk-in',
        serviceName: service?.name ?? '—',
        date,
        time,
      }
      if (employee?.name) ownerTplOpts.employeeName = employee.name
      if (appt.source) ownerTplOpts.source = appt.source
      await sendTelegramMessage(token, chatId, tplNewBooking(ownerTplOpts))
    }

    // ── Telegram → клиенту (если уже подключён) ─────────────────────────────
    if (biz?.telegram_bot_token && client?.telegram_id) {
      const token: string = biz.telegram_bot_token
      const chatId: string = client.telegram_id
      const clientTplOpts: Parameters<typeof tplConfirmClient>[0] = {
        clientName: client.name,
        serviceName: service?.name ?? '—',
        date,
        time,
        businessName: biz.name,
      }
      if (biz.address) clientTplOpts.address = biz.address
      await sendTelegramMessage(token, chatId, tplConfirmClient(clientTplOpts))
    }

    // ── Viber → владельцу ───────────────────────────────────────────────────
    if (biz?.viber_bot_token && biz?.viber_chat_id) {
      const token: string = biz.viber_bot_token
      const chatId: string = biz.viber_chat_id
      const viberOwnerOpts: Parameters<typeof viberTplNewBooking>[0] = {
        clientName: client?.name ?? 'Walk-in',
        serviceName: service?.name ?? '—',
        date,
        time,
      }
      if (employee?.name) viberOwnerOpts.employeeName = employee.name
      if (appt.source) viberOwnerOpts.source = appt.source
      await sendViberMessage(token, chatId, viberTplNewBooking(viberOwnerOpts))
    }

    // ── Viber → клиенту (если уже подключён) ────────────────────────────────
    if (biz?.viber_bot_token && client?.viber_user_id) {
      const token: string = biz.viber_bot_token
      const userId: string = client.viber_user_id
      const viberClientOpts: Parameters<typeof viberTplConfirmClient>[0] = {
        clientName: client.name,
        serviceName: service?.name ?? '—',
        date,
        time,
        businessName: biz.name,
      }
      if (biz.address) viberClientOpts.address = biz.address
      await sendViberMessage(token, userId, viberTplConfirmClient(viberClientOpts))
    }

    // ── WhatsApp → клиенту ──────────────────────────────────────────────────
    const waCredentials: { phoneNumberId: string; accessToken: string } | undefined =
      biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
        ? {
            phoneNumberId: biz.meta_whatsapp_phone_number_id,
            accessToken: biz.meta_whatsapp_access_token,
          }
        : undefined
    if (client?.whatsapp_number) {
      const to: string = client.whatsapp_number
      const waOpts: Parameters<typeof waTplBookingConfirmation>[0] = {
        clientName: client.name,
        serviceName: service?.name ?? '—',
        date,
        time,
        businessName: biz?.name ?? '',
      }
      if (employee?.name) waOpts.employeeName = employee.name
      if (biz?.address) waOpts.address = biz.address
      await sendWhatsAppMessage(to, waTplBookingConfirmation(waOpts), waCredentials)
    }

    // ── Email → клиенту ─────────────────────────────────────────────────────
    // Prefer the email submitted in the booking form (formEmail) over the one stored in DB,
    // since the DB record may belong to an existing client found by phone who has a different email.
    const recipientEmail: string | null | undefined = formEmail ?? client?.email ?? null
    if (!recipientEmail) {
      return NextResponse.json({ sent: true, email: 'skipped: no client email' })
    }

    // Check dedup BEFORE sending — log record is written only after a successful send,
    // so a failed send leaves no trace and can be retried freely.
    const { data: alreadySentData } = await supabase
      .from('notification_log')
      .select('id')
      .eq('business_id', appt.business_id)
      .eq('ref_id', appt.id)
      .eq('type', 'confirm')
      .eq('channel', 'email')
      .maybeSingle<NotificationLogIdRow>()

    const alreadySent: NotificationLogIdRow | null =
      (alreadySentData as unknown as NotificationLogIdRow | null) ?? null

    if (alreadySent) {
      return NextResponse.json({ sent: true, email: 'skipped: already sent' })
    }

    const calendarUrl: string = buildGCalUrlFromISO({
      businessName: biz?.name ?? '',
      serviceName: service?.name ?? '',
      employeeName: employee?.name ?? null,
      startsAt: appt.starts_at,
      durationMin: service?.duration_min ?? 60,
      timezone: tz,
      address: biz?.address ?? null,
    })
    const emailOpts: Parameters<typeof sendBookingConfirmation>[0] = {
      to: recipientEmail,
      clientName: client?.name ?? 'Guest',
      businessName: biz?.name ?? 'Your appointment',
      serviceName: service?.name ?? '—',
      date,
      time,
      calendarUrl,
    }
    if (employee?.name) emailOpts.employeeName = employee.name
    if (biz?.address) emailOpts.address = biz.address
    await sendBookingConfirmation(emailOpts)

    // Record only after a confirmed successful send
    const { error: logErr } = await supabase.from('notification_log').insert({
      business_id: appt.business_id,
      ref_id: appt.id,
      type: 'confirm',
      channel: 'email',
    } as Database['public']['Tables']['notification_log']['Insert'])
    if (logErr && logErr.code !== '23505') {
      void logErr.message
    }

    return NextResponse.json({ sent: true })
  } catch (_err: unknown) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
