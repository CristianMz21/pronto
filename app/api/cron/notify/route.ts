/**
 * GET /api/cron/notify?secret=YOUR_SECRET
 *
 * Запускать каждый час через внешний планировщик (cron-job.org, Vercel Cron и т.д.)
 *
 * Что делает каждый запуск:
 *  1. 24h reminders — appointments starting in 23-25h
 *  2. 1h  reminders — appointments starting in 55-65min
 *  3. Thank-you     — appointments completed in the last 2h
 *  4. Re-activation — clients with last_visit_at exactly 30 days ago
 *  5. Birthday      — clients whose birthday is today
 *
 * Каждое событие отправляется через все доступные каналы:
 *  - Email     → клиенту
 *  - Telegram  → владельцу (если настроен) и клиенту (если привязан)
 *  - Viber     → владельцу (если настроен) и клиенту (если привязан viber_user_id)
 *  - WhatsApp  → клиенту (если заполнен whatsapp_number; требует approved templates для продакшена)
 */

import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  formatEmailDate,
  formatEmailTime,
  sendBirthday,
  sendReactivation,
  sendReminder,
  sendThankYou,
} from '@/lib/email'
import { getIp, rateLimit } from '@/lib/rate-limit'
import type { Database } from '@/lib/supabase/database.types'
import {
  sendTelegramMessage,
  tplBirthday as tgTplBirthday,
  tplBirthdayClient as tgTplBirthdayClient,
  tplReactivation as tgTplReactivation,
  tplReactivationClient as tgTplReactivationClient,
  tplReminderClient as tgTplReminderClient,
  tplThankYouClient as tgTplThankYouClient,
  tplThankYou,
} from '@/lib/telegram'
import {
  sendViberMessage,
  tplBirthday as viberTplBirthday,
  tplReactivation as viberTplReactivation,
  tplReminderClient as viberTplReminderClient,
  tplThankYou as viberTplThankYou,
  tplThankYouClient as viberTplThankYouClient,
} from '@/lib/viber'
import {
  sendWhatsAppMessage,
  tplBirthday as waTplBirthday,
  tplReactivation as waTplReactivation,
  tplReminder as waTplReminder,
  tplThankYou as waTplThankYou,
} from '@/lib/whatsapp'

const APP_URL: string = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// ── Typed row helpers for Supabase joins ─────────────────────────────────────

interface AppointmentReminderRow {
  id: string
  starts_at: string
  business_id: string
  services: { name: string } | null
  employees: { name: string } | null
  clients: {
    name: string
    email: string | null
    whatsapp_number: string | null
    viber_user_id: string | null
    telegram_id: string | null
  } | null
}

interface BusinessReminderRow {
  name: string
  address: string | null
  timezone: string
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  viber_bot_token: string | null
  viber_chat_id: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
}

interface AppointmentThankYouRow {
  id: string
  business_id: string
  services: { name: string } | null
  clients: {
    name: string
    email: string | null
    whatsapp_number: string | null
    viber_user_id: string | null
    telegram_id: string | null
  } | null
}

interface BusinessThankYouRow {
  name: string
  slug: string | null
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  viber_bot_token: string | null
  viber_chat_id: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
}

interface ClientDormantRow {
  id: string
  name: string
  email: string | null
  whatsapp_number: string | null
  viber_user_id: string | null
  telegram_id: string | null
  business_id: string
}

interface BusinessReactivationRow {
  name: string
  slug: string | null
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  viber_bot_token: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
}

interface ClientBirthdayRow {
  id: string
  name: string
  email: string | null
  whatsapp_number: string | null
  viber_user_id: string | null
  telegram_id: string | null
  birthday: string | null
  business_id: string
}

interface WaitlistIdRow {
  id: string
}

interface HolidayRow {
  business_id: string
  date: string
  reason: string | null
  is_open: boolean
}

interface BusinessCampaignRow {
  id: string
  name: string
  slug: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
}

interface ClientCampaignRow {
  id: string
  name: string
  phone: string | null
  whatsapp_number: string | null
  email: string | null
  birthday: string | null
  tags: string[] | null
  last_visit_at: string | null
}

interface TransactionStatRow {
  client_id: string
  created_at: string
}

interface AppointmentCampaignRow {
  id: string
  client_id: string | null
  business_id: string
  campaign_id: string | null
  created_at: string
  source: string
}

interface CampaignStatsRow {
  stats: Record<string, number>
}

interface WhatsAppCredentials {
  phoneNumberId: string
  accessToken: string
}

// TODO(PR complexity): refactor to reduce cognitive complexity 154 → 20
export async function GET(req: NextRequest): Promise<NextResponse> {
  const _ipGET: string = getIp(req as unknown as Request)
  if (!rateLimit(`notify-route:get:${_ipGET}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _parsed = z
      .object({})
      .passthrough()
      .safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!_parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  // Принимаем секрет только через заголовок Authorization: Bearer {secret}
  // Query-параметр ?secret= намеренно убран — он виден в логах серверов и прокси.
  // Используйте pg_cron или cron-job.org с заголовком Authorization.
  const authHeader: string = req.headers.get('authorization') ?? ''
  const secret: string | null = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Service role — cron запускается без сессии пользователя, RLS должен быть обойдён
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const now: Date = new Date()
  const results: string[] = []
  const debug: Record<string, unknown> = { now: now.toISOString() }

  // ── helper: dedup через notification_log ────────────────────────────────────
  async function logged(businessId: string, refId: string, type: string): Promise<boolean> {
    const { error } = await supabase.from('notification_log').insert({
      business_id: businessId,
      ref_id: refId,
      type,
      channel: 'email',
    })
    return !error
  }

  // ── 1. 24h reminders ────────────────────────────────────────────────────────
  const from24: string = new Date(now.getTime() + 23 * 3600_000).toISOString()
  const to24: string = new Date(now.getTime() + 25 * 3600_000).toISOString()
  debug.window_24h = { from: from24, to: to24 }

  const { data: appts24, error: err24 } = await supabase
    .from('appointments')
    .select(
      'id, starts_at, business_id, services(name), employees(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)',
    )
    .gte('starts_at', from24)
    .lte('starts_at', to24)
    .eq('status', 'confirmed')
    .returns<AppointmentReminderRow[]>()
  debug.appts24 = { count: appts24?.length ?? 0, error: err24?.message ?? null }

  for (const a of appts24 ?? []) {
    const typedA: AppointmentReminderRow = a
    const client: AppointmentReminderRow['clients'] = typedA.clients
    // Skip without logging if client has no contact channels at all.
    // This prevents burning a notification_log entry for a booking that can never
    // be delivered — which would permanently block retries once contact info is added.
    if (
      !client?.telegram_id &&
      !client?.email &&
      !client?.viber_user_id &&
      !client?.whatsapp_number
    )
      continue
    if (!(await logged(typedA.business_id, typedA.id, 'reminder_24h'))) continue

    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, address, timezone, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', typedA.business_id)
      .single()
    const biz: BusinessReminderRow | null = bizData as BusinessReminderRow | null

    const service: { name: string } | null = typedA.services
    const employee: { name: string } | null = typedA.employees
    const tz: string = biz?.timezone ?? 'UTC'
    const date: string = formatEmailDate(typedA.starts_at, tz)
    const time: string = formatEmailTime(typedA.starts_at, tz)
    const waCredentials: WhatsAppCredentials | undefined =
      biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
        ? {
            phoneNumberId: biz.meta_whatsapp_phone_number_id,
            accessToken: biz.meta_whatsapp_access_token,
          }
        : undefined

    // Telegram → клиенту (владельцу reminder не нужен — он уже получил уведомление при создании записи)
    if (biz?.telegram_bot_token && client?.telegram_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        client.telegram_id,
        tgTplReminderClient({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          date,
          time,
          businessName: biz.name,
          address: biz.address ?? undefined,
        }),
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && client?.viber_user_id) {
      await sendViberMessage(
        biz.viber_bot_token,
        client.viber_user_id,
        viberTplReminderClient({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          date,
          time,
          businessName: biz.name,
          address: biz.address ?? undefined,
        }),
      )
    }
    // WhatsApp → клиенту
    if (client?.whatsapp_number) {
      await sendWhatsAppMessage(
        client.whatsapp_number,
        waTplReminder({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          date,
          time,
          businessName: biz?.name ?? '',
        }),
        waCredentials,
      )
    }
    // Email → клиенту
    if (client?.email) {
      try {
        await sendReminder({
          to: client.email,
          clientName: client.name,
          businessName: biz?.name ?? '',
          serviceName: service?.name ?? '—',
          date,
          time,
          employeeName: employee?.name ?? undefined,
          address: biz?.address ?? undefined,
        })
      } catch (_err: unknown) {
        // console.error('[cron/notify] sendReminder 24h error:', err)
      }
    }
    results.push(`reminder_24h:${typedA.id}`)
  }

  // ── 2. 1h reminders ─────────────────────────────────────────────────────────
  const from1h: string = new Date(now.getTime() + 45 * 60_000).toISOString()
  const to1h: string = new Date(now.getTime() + 75 * 60_000).toISOString()
  debug.window_1h = { from: from1h, to: to1h }

  const { data: appts1h, error: err1h } = await supabase
    .from('appointments')
    .select(
      'id, starts_at, business_id, services(name), employees(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)',
    )
    .gte('starts_at', from1h)
    .lte('starts_at', to1h)
    .eq('status', 'confirmed')
    .returns<AppointmentReminderRow[]>()
  debug.appts1h = { count: appts1h?.length ?? 0, error: err1h?.message ?? null }

  for (const a of appts1h ?? []) {
    const typedA: AppointmentReminderRow = a
    const client: AppointmentReminderRow['clients'] = typedA.clients
    // Skip without logging if client has no contact channels at all.
    // This prevents burning a notification_log entry for a booking that can never
    // be delivered — which would permanently block retries once contact info is added.
    if (
      !client?.telegram_id &&
      !client?.email &&
      !client?.viber_user_id &&
      !client?.whatsapp_number
    )
      continue
    if (!(await logged(typedA.business_id, typedA.id, 'reminder_1h'))) continue

    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, address, timezone, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', typedA.business_id)
      .single()
    const biz: BusinessReminderRow | null = bizData as BusinessReminderRow | null

    const service: { name: string } | null = typedA.services
    const employee: { name: string } | null = typedA.employees
    const tz: string = biz?.timezone ?? 'UTC'
    const date: string = formatEmailDate(typedA.starts_at, tz)
    const time: string = formatEmailTime(typedA.starts_at, tz)
    const waCredentials: WhatsAppCredentials | undefined =
      biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
        ? {
            phoneNumberId: biz.meta_whatsapp_phone_number_id,
            accessToken: biz.meta_whatsapp_access_token,
          }
        : undefined

    // Telegram → клиенту (владельцу reminder не нужен — он уже получил уведомление при создании записи)
    if (biz?.telegram_bot_token && client?.telegram_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        client.telegram_id,
        tgTplReminderClient({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          date,
          time,
          businessName: biz.name,
          address: biz.address ?? undefined,
          isOneHour: true,
        }),
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && client?.viber_user_id) {
      await sendViberMessage(
        biz.viber_bot_token,
        client.viber_user_id,
        viberTplReminderClient({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          date,
          time,
          businessName: biz.name,
          address: biz.address ?? undefined,
          isOneHour: true,
        }),
      )
    }
    // WhatsApp → клиенту
    if (client?.whatsapp_number) {
      await sendWhatsAppMessage(
        client.whatsapp_number,
        waTplReminder({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          date,
          time,
          businessName: biz?.name ?? '',
          isOneHour: true,
        }),
        waCredentials,
      )
    }
    // Email → клиенту
    if (client?.email) {
      try {
        await sendReminder({
          to: client.email,
          clientName: client.name,
          businessName: biz?.name ?? '',
          serviceName: service?.name ?? '—',
          date,
          time,
          employeeName: employee?.name ?? undefined,
          address: biz?.address ?? undefined,
          isOneHour: true,
        })
      } catch (_err: unknown) {
        // console.error('[cron/notify] sendReminder 1h error:', err)
      }
    }
    results.push(`reminder_1h:${typedA.id}`)
  }

  // ── 3. Thank-you ─────────────────────────────────────────────────────────────
  const twoHoursAgo: string = new Date(now.getTime() - 2 * 3600_000).toISOString()
  debug.window_thankyou = { from: twoHoursAgo, to: now.toISOString() }

  const { data: completed, error: errTy } = await supabase
    .from('appointments')
    .select(
      'id, business_id, services(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)',
    )
    .eq('status', 'completed')
    .gte('ends_at', twoHoursAgo)
    .lte('ends_at', now.toISOString())
    .returns<AppointmentThankYouRow[]>()
  debug.thankyou = { count: completed?.length ?? 0, error: errTy?.message ?? null }

  for (const a of completed ?? []) {
    const typedA: AppointmentThankYouRow = a
    if (!(await logged(typedA.business_id, typedA.id, 'thankyou'))) continue

    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', typedA.business_id)
      .single()
    const biz: BusinessThankYouRow | null = bizData as BusinessThankYouRow | null

    const client: AppointmentThankYouRow['clients'] = typedA.clients
    const service: { name: string } | null = typedA.services
    const bookingUrl: string | undefined = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
    const waCredentials: WhatsAppCredentials | undefined =
      biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
        ? {
            phoneNumberId: biz.meta_whatsapp_phone_number_id,
            accessToken: biz.meta_whatsapp_access_token,
          }
        : undefined

    // Telegram → владельцу
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        biz.telegram_chat_id,
        tplThankYou({ clientName: client?.name ?? 'Walk-in', serviceName: service?.name ?? '—' }),
      )
    }
    // Telegram → клиенту
    if (biz?.telegram_bot_token && client?.telegram_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        client.telegram_id,
        tgTplThankYouClient({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          businessName: biz.name,
          bookingUrl,
        }),
      )
    }
    // Viber → владельцу
    if (biz?.viber_bot_token && biz?.viber_chat_id) {
      await sendViberMessage(
        biz.viber_bot_token,
        biz.viber_chat_id,
        viberTplThankYou({
          clientName: client?.name ?? 'Walk-in',
          serviceName: service?.name ?? '—',
        }),
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && client?.viber_user_id) {
      await sendViberMessage(
        biz.viber_bot_token,
        client.viber_user_id,
        viberTplThankYouClient({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          businessName: biz.name,
          bookingUrl,
        }),
      )
    }
    // WhatsApp → клиенту
    if (client?.whatsapp_number) {
      await sendWhatsAppMessage(
        client.whatsapp_number,
        waTplThankYou({
          clientName: client.name,
          serviceName: service?.name ?? '—',
          businessName: biz?.name ?? '',
          bookingUrl,
        }),
        waCredentials,
      )
    }
    // Email → клиенту
    if (client?.email) {
      await sendThankYou({
        to: client.email,
        clientName: client.name,
        businessName: biz?.name ?? '',
        serviceName: service?.name ?? '—',
        bookingUrl,
      })
    }
    results.push(`thankyou:${typedA.id}`)
  }

  // ── 4. Re-activation ─────────────────────────────────────────────────────────
  const reactivStart: Date = new Date(now)
  reactivStart.setDate(reactivStart.getDate() - 30)
  reactivStart.setHours(0, 0, 0, 0)
  const reactivEnd: Date = new Date(reactivStart)
  reactivEnd.setHours(23, 59, 59, 999)

  debug.window_reactivation = { from: reactivStart.toISOString(), to: reactivEnd.toISOString() }

  const { data: dormant, error: errRe } = await supabase
    .from('clients')
    .select('id, name, email, whatsapp_number, viber_user_id, telegram_id, business_id')
    .gte('last_visit_at', reactivStart.toISOString())
    .lte('last_visit_at', reactivEnd.toISOString())
    .returns<ClientDormantRow[]>()
  debug.reactivation = { count: dormant?.length ?? 0, error: errRe?.message ?? null }

  for (const c of dormant ?? []) {
    const typedC: ClientDormantRow = c
    if (!typedC.email && !typedC.whatsapp_number && !typedC.viber_user_id && !typedC.telegram_id)
      continue
    if (!(await logged(typedC.business_id, typedC.id, 'reactivation'))) continue

    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', typedC.business_id)
      .single()
    const biz: BusinessReactivationRow | null = bizData as BusinessReactivationRow | null
    const bookingUrl: string | undefined = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
    const waCredentials: WhatsAppCredentials | undefined =
      biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
        ? {
            phoneNumberId: biz.meta_whatsapp_phone_number_id,
            accessToken: biz.meta_whatsapp_access_token,
          }
        : undefined

    // Telegram → владельцу
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        biz.telegram_chat_id,
        tgTplReactivation({ clientName: typedC.name }),
      )
    }
    // Telegram → клиенту
    if (biz?.telegram_bot_token && typedC.telegram_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        typedC.telegram_id,
        tgTplReactivationClient({ clientName: typedC.name, businessName: biz.name, bookingUrl }),
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && typedC.viber_user_id) {
      await sendViberMessage(
        biz.viber_bot_token,
        typedC.viber_user_id,
        viberTplReactivation({ clientName: typedC.name, businessName: biz.name, bookingUrl }),
      )
    }
    // WhatsApp → клиенту
    if (typedC.whatsapp_number) {
      await sendWhatsAppMessage(
        typedC.whatsapp_number,
        waTplReactivation({ clientName: typedC.name, businessName: biz?.name ?? '', bookingUrl }),
        waCredentials,
      )
    }
    // Email → клиенту
    if (typedC.email) {
      await sendReactivation({
        to: typedC.email,
        clientName: typedC.name,
        businessName: biz?.name ?? '',
        bookingUrl,
      })
    }
    results.push(`reactivation:${typedC.id}`)
  }

  // ── 5. Birthday ───────────────────────────────────────────────────────────────
  // .like() не работает на колонке типа date в PostgREST — фильтруем в JS
  const todayMD: string = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const { data: allClientsWithBday } = await supabase
    .from('clients')
    .select('id, name, email, whatsapp_number, viber_user_id, telegram_id, birthday, business_id')
    .not('birthday', 'is', null)
    .returns<ClientBirthdayRow[]>()

  const bdays: ClientBirthdayRow[] = (allClientsWithBday ?? []).filter(
    (c: ClientBirthdayRow) => typeof c.birthday === 'string' && c.birthday.slice(5) === todayMD,
  )

  for (const c of bdays) {
    if (!c.email && !c.whatsapp_number && !c.viber_user_id && !c.telegram_id) continue
    const year: number = now.getFullYear()
    if (!(await logged(c.business_id, `${c.id}_bday_${year}`, 'birthday'))) continue

    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', c.business_id)
      .single()
    const biz: BusinessReactivationRow | null = bizData as BusinessReactivationRow | null
    const bookingUrl: string | undefined = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
    const waCredentials: WhatsAppCredentials | undefined =
      biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
        ? {
            phoneNumberId: biz.meta_whatsapp_phone_number_id,
            accessToken: biz.meta_whatsapp_access_token,
          }
        : undefined

    // Telegram → владельцу
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        biz.telegram_chat_id,
        tgTplBirthday({ clientName: c.name }),
      )
    }
    // Telegram → клиенту
    if (biz?.telegram_bot_token && c.telegram_id) {
      await sendTelegramMessage(
        biz.telegram_bot_token,
        c.telegram_id,
        tgTplBirthdayClient({ clientName: c.name, businessName: biz.name, bookingUrl }),
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && c.viber_user_id) {
      await sendViberMessage(
        biz.viber_bot_token,
        c.viber_user_id,
        viberTplBirthday({ clientName: c.name, businessName: biz.name, bookingUrl }),
      )
    }
    // WhatsApp → клиенту
    if (c.whatsapp_number) {
      await sendWhatsAppMessage(
        c.whatsapp_number,
        waTplBirthday({ clientName: c.name, businessName: biz?.name ?? '', bookingUrl }),
        waCredentials,
      )
    }
    // Email → клиенту
    if (c.email) {
      await sendBirthday({
        to: c.email,
        clientName: c.name,
        businessName: biz?.name ?? '',
        bookingUrl,
      })
    }
    results.push(`birthday:${c.id}`)
  }

  // ── 6. Waitlist expire (US7 T068) ────────────────────────────────────────────
  try {
    const waitlistCutoff: string = new Date(now.getTime() - 30 * 60_000).toISOString()
    const { data: toExpireNotified } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'notified')
      .lt('notified_at', waitlistCutoff)
      .returns<WaitlistIdRow[]>()
    if (toExpireNotified && toExpireNotified.length > 0) {
      const ids: string[] = toExpireNotified.map((r: WaitlistIdRow) => r.id)
      await supabase.from('waitlist').update({ status: 'expired' }).in('id', ids)
      results.push(`waitlist_expired_notified:${ids.length}`)
      debug.waitlist_expired_notified = ids.length
    }
    const nowIso: string = now.toISOString()
    const { data: toExpireWaiting } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'waiting')
      .lt('desired_at', nowIso)
      .returns<WaitlistIdRow[]>()
    if (toExpireWaiting && toExpireWaiting.length > 0) {
      const ids: string[] = toExpireWaiting.map((r: WaitlistIdRow) => r.id)
      await supabase.from('waitlist').update({ status: 'expired' }).in('id', ids)
      results.push(`waitlist_expired_waiting:${ids.length}`)
      debug.waitlist_expired_waiting = ids.length
    }
  } catch (e: unknown) {
    const message: string = e instanceof Error ? (e.message ?? String(e)) : String(e)
    debug.waitlist_expire_error = message.slice(0, 200)
  }

  // ── 7. Holiday reminder (US7 T068) — notify clients with appointments tomorrow that tomorrow is holiday → warn? ──
  // For MVP we just add debug entry for upcoming holidays in next 7 days per business (no send yet, avoids spam).
  try {
    const nextWeek: Date = new Date(now)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const todayStr: string = now.toISOString().slice(0, 10)
    const nextWeekStr: string = nextWeek.toISOString().slice(0, 10)
    const { data: upcomingHolidays } = await supabase
      .from('holidays')
      .select('business_id, date, reason, is_open')
      .gte('date', todayStr)
      .lte('date', nextWeekStr)
      .eq('is_open', false)
      .limit(50)
      .returns<HolidayRow[]>()
    if (upcomingHolidays && upcomingHolidays.length > 0) {
      debug.upcoming_holidays = upcomingHolidays.length
      // For observability we push a result per holiday (no actual send to avoid duplicate holiday spam; actual blocking is at booking time)
      for (const h of upcomingHolidays) {
        const typedH: HolidayRow = h
        results.push(`holiday:${typedH.business_id}:${typedH.date}`)
      }
    }
  } catch (e: unknown) {
    const message: string = e instanceof Error ? (e.message ?? String(e)) : String(e)
    debug.holiday_error = message.slice(0, 200)
  }

  // ── 8. CRM inactive_42 + birthday_7 campaigns auto-send (T073) ─────────────
  // Runs daily; uses dedup via notification_log 1h window and campaign logic.
  try {
    const { filterClientsBySegment } = await import('@/lib/campaigns')
    const campaignTodayStr: string = now.toISOString().slice(0, 10) // dedup daily CRM auto run
    // Process per business (limit 20 to avoid timeout)
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name, slug, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
      .limit(20)
      .returns<BusinessCampaignRow[]>()

    for (const bizRaw of businesses ?? []) {
      const biz: BusinessCampaignRow = bizRaw
      const waCreds: WhatsAppCredentials | undefined =
        biz.meta_whatsapp_phone_number_id && biz.meta_whatsapp_access_token
          ? {
              phoneNumberId: biz.meta_whatsapp_phone_number_id,
              accessToken: biz.meta_whatsapp_access_token,
            }
          : undefined
      const bookingUrl: string | undefined = biz.slug ? `${APP_URL}/book/${biz.slug}` : undefined

      // Helper to send segment campaign if not already sent today (via notification_log)
      async function processSegment(segment: 'inactive_42' | 'birthday_7'): Promise<void> {
        const eventType: string = `crm_auto_${segment}:${biz.id}:${campaignTodayStr}`
        // Dedup: has this business already had a crm_auto run today?
        const { error: logErr } = await supabase.from('notification_log').insert({
          business_id: biz.id,
          ref_id: biz.id,
          type: eventType,
          channel: 'whatsapp',
        })
        if (logErr) {
          // Already logged today — skip to respect 1h/daily dedup
          return
        }

        // Fetch clients for segment (same enrichment as segments route)
        const { data: clientsRaw } = await supabase
          .from('clients')
          .select('id, name, phone, whatsapp_number, email, birthday, tags, last_visit_at')
          .eq('business_id', biz.id)
          .limit(300)
          .returns<ClientCampaignRow[]>()

        const clients: ClientCampaignRow[] = clientsRaw ?? []
        // Enrich with transaction stats for visits
        const ids: string[] = clients.map((c: ClientCampaignRow) => c.id)
        const statsMap: Record<string, { total_visits: number; last_visit_at: string | null }> = {}
        if (ids.length > 0) {
          const { data: txs } = await supabase
            .from('transactions')
            .select('client_id, created_at')
            .eq('business_id', biz.id)
            .eq('status', 'completed')
            .in('client_id', ids)
            .order('created_at', { ascending: false })
            .limit(1000)
            .returns<TransactionStatRow[]>()
          for (const tx of txs ?? []) {
            const typedTx: TransactionStatRow = tx
            if (!typedTx.client_id) continue
            if (!statsMap[typedTx.client_id])
              statsMap[typedTx.client_id] = { total_visits: 0, last_visit_at: null }
            const entry = statsMap[typedTx.client_id]
            if (!entry) continue
            entry.total_visits++
            if (!entry.last_visit_at) entry.last_visit_at = typedTx.created_at
          }
        }
        const enriched = clients.map((c: ClientCampaignRow) => ({
          id: c.id,
          birthday: c.birthday,
          tags: c.tags,
          last_visit_at: statsMap[c.id]?.last_visit_at ?? c.last_visit_at ?? null,
          total_visits: statsMap[c.id]?.total_visits ?? 0,
        }))
        const filtered = filterClientsBySegment(enriched, segment, now)
        const filteredIds: Set<string> = new Set(filtered.map((f) => f.id))
        const recipients: ClientCampaignRow[] = clients.filter((c: ClientCampaignRow) =>
          filteredIds.has(c.id),
        )
        if (recipients.length === 0) return

        let template: string
        if (segment === 'inactive_42') {
          template = `Hola {{name}} 👋 te extrañamos en ${biz.name}. ¡Tenés 20% en tu próximo corte esta semana!${bookingUrl ? ` Reserva: ${bookingUrl}` : ''}`
        } else {
          template = `¡Feliz cumple {{name}}! 🎂 ${biz.name} te desea un gran día. ¡Tenés un regalo esperando!${bookingUrl ? ` Reserva: ${bookingUrl}` : ''}`
        }

        let sentCount = 0
        for (const c of recipients.slice(0, 100)) {
          // cap 100 per run to avoid timeout
          const dedupKey: string = `campaign_auto:${segment}:${c.id}`
          const oneHourAgo: string = new Date(Date.now() - 60 * 60 * 1000).toISOString()
          const { data: recent } = await supabase
            .from('notification_log')
            .select('id')
            .eq('business_id', biz.id)
            .eq('ref_id', c.id)
            .eq('type', dedupKey)
            .gte('sent_at', oneHourAgo)
            .limit(1)
            .returns<{ id: string }[]>()
          if (recent && recent.length > 0) continue

          const body: string = template
            .replaceAll('{{name}}', c.name)
            .replaceAll('{{business}}', biz.name)
          const to: string | null = c.whatsapp_number ?? c.phone
          let ok = false
          if (to) {
            ok = await sendWhatsAppMessage(to, body, waCreds)
            // Stub if no creds: log but count as sent for observability
            if (!ok && !waCreds) ok = true
          }
          try {
            await supabase.from('notification_log').insert({
              business_id: biz.id,
              ref_id: c.id,
              type: dedupKey,
              channel: 'whatsapp',
            })
          } catch {}
          if (ok) {
            sentCount++
            results.push(`crm_auto_${segment}:${c.id}`)
          }
        }
        if (sentCount > 0) debug[`crm_auto_${segment}_${biz.id}`] = sentCount
      }

      await processSegment('inactive_42')
      await processSegment('birthday_7')
    }
  } catch (e: unknown) {
    const message: string = e instanceof Error ? (e.message ?? String(e)) : String(e)
    debug.crm_auto_error = message.slice(0, 300)
  }

  // ── 9. Campaign rebooked attribution sweep (T073) ──────────────────────────
  // Find appointments created in last 24h with source=campaign and flip recipients to rebooked.
  try {
    const since: string = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
    const { data: recentCampaignAppts } = await supabase
      .from('appointments')
      .select('id, client_id, business_id, campaign_id, created_at, source')
      .gte('created_at', since)
      .in('source', ['campaign', 'campaign_auto'])
      .limit(100)
      .returns<AppointmentCampaignRow[]>()

    for (const a of recentCampaignAppts ?? []) {
      const typedA: AppointmentCampaignRow = a
      if (!typedA.client_id) continue
      try {
        if (typedA.campaign_id) {
          const { data: existing } = await supabase
            .from('campaign_recipients')
            .select('status')
            .eq('campaign_id', typedA.campaign_id)
            .eq('client_id', typedA.client_id)
            .maybeSingle()
          const typedExisting: { status: string } | null = existing as {
            status: string
          } | null
          if (typedExisting && typedExisting.status !== 'rebooked') {
            await supabase
              .from('campaign_recipients')
              .update({ status: 'rebooked' })
              .eq('campaign_id', typedA.campaign_id)
              .eq('client_id', typedA.client_id)
            const { data: camp } = await supabase
              .from('campaigns')
              .select('stats')
              .eq('id', typedA.campaign_id)
              .maybeSingle()
            const typedCamp: CampaignStatsRow | null = camp as CampaignStatsRow | null
            if (typedCamp?.stats) {
              const next: Record<string, number> = {
                ...typedCamp.stats,
                rebooked: (typedCamp.stats.rebooked ?? 0) + 1,
              }
              await supabase.from('campaigns').update({ stats: next }).eq('id', typedA.campaign_id)
            }
            results.push(`campaign_rebooked:${typedA.campaign_id}:${typedA.client_id}`)
          }
        } else {
          // No campaign_id, attribute to most recent sent campaign for this client
          const { attributeRebooking } = await import('@/lib/campaigns')
          await attributeRebooking(
            supabase as unknown as Parameters<typeof attributeRebooking>[0],
            { clientId: typedA.client_id, businessId: typedA.business_id },
          )
          results.push(`campaign_rebooked_auto:${typedA.client_id}`)
        }
      } catch {}
    }
    // Also sweep: any client with a new completed transaction? Could extend but cron sweep above covers appointments.
  } catch (e: unknown) {
    const message: string = e instanceof Error ? (e.message ?? String(e)) : String(e)
    debug.campaign_rebooked_error = message.slice(0, 300)
  }

  return NextResponse.json({ ok: true, sent: results.length, results, debug })
}
