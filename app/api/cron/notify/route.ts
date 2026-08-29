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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendReminder,
  sendThankYou,
  sendReactivation,
  sendBirthday,
  formatEmailDate,
  formatEmailTime,
} from '@/lib/email'
import {
  sendTelegramMessage,
  tplThankYou,
  tplReactivation as tgTplReactivation,
  tplBirthday as tgTplBirthday,
  tplReminderClient as tgTplReminderClient,
  tplThankYouClient as tgTplThankYouClient,
  tplReactivationClient as tgTplReactivationClient,
  tplBirthdayClient as tgTplBirthdayClient,
} from '@/lib/telegram'
import {
  sendViberMessage,
  tplThankYou as viberTplThankYou,
  tplReminderClient as viberTplReminderClient,
  tplThankYouClient as viberTplThankYouClient,
  tplReactivation as viberTplReactivation,
  tplBirthday as viberTplBirthday,
} from '@/lib/viber'
import {
  sendWhatsAppMessage,
  tplReminder as waTplReminder,
  tplThankYou as waTplThankYou,
  tplReactivation as waTplReactivation,
  tplBirthday as waTplBirthday,
} from '@/lib/whatsapp'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function GET(req: NextRequest) {
  // Принимаем секрет только через заголовок Authorization: Bearer {secret}
  // Query-параметр ?secret= намеренно убран — он виден в логах серверов и прокси.
  // Используйте pg_cron или cron-job.org с заголовком Authorization.
  const authHeader = req.headers.get('authorization') ?? ''
  const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Service role — cron запускается без сессии пользователя, RLS должен быть обойдён
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const now = new Date()
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
  const from24 = new Date(now.getTime() + 23 * 3600_000).toISOString()
  const to24   = new Date(now.getTime() + 25 * 3600_000).toISOString()
  debug.window_24h = { from: from24, to: to24 }

  const { data: appts24, error: err24 } = await supabase
    .from('appointments')
    .select('id, starts_at, business_id, services(name), employees(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)')
    .gte('starts_at', from24)
    .lte('starts_at', to24)
    .eq('status', 'confirmed')
  debug.appts24 = { count: appts24?.length ?? 0, error: err24?.message ?? null }

  for (const a of appts24 ?? []) {
    const client = a.clients as unknown as { name: string; email: string | null; whatsapp_number: string | null; viber_user_id: string | null; telegram_id: string | null } | null
    // Skip without logging if client has no contact channels at all.
    // This prevents burning a notification_log entry for a booking that can never
    // be delivered — which would permanently block retries once contact info is added.
    if (!client?.telegram_id && !client?.email && !client?.viber_user_id && !client?.whatsapp_number) continue
    if (!await logged(a.business_id, a.id, 'reminder_24h')) continue

    const { data: biz } = await supabase
      .from('businesses')
      .select('name, address, timezone, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
      .eq('id', a.business_id).single()

    const service  = a.services  as unknown as { name: string } | null
    const employee = a.employees as unknown as { name: string } | null
    const tz = biz?.timezone ?? 'UTC'
    const date = formatEmailDate(a.starts_at, tz)
    const time = formatEmailTime(a.starts_at, tz)
    const waCredentials = biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
      ? { phoneNumberId: biz.meta_whatsapp_phone_number_id, accessToken: biz.meta_whatsapp_access_token }
      : undefined

    // Telegram → клиенту (владельцу reminder не нужен — он уже получил уведомление при создании записи)
    if (biz?.telegram_bot_token && client?.telegram_id) {
      await sendTelegramMessage(biz.telegram_bot_token, client.telegram_id,
        tgTplReminderClient({ clientName: client.name, serviceName: service?.name ?? '—', date, time, businessName: biz.name, address: biz.address ?? undefined })
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && client?.viber_user_id) {
      await sendViberMessage(biz.viber_bot_token, client.viber_user_id,
        viberTplReminderClient({ clientName: client.name, serviceName: service?.name ?? '—', date, time, businessName: biz.name, address: biz.address ?? undefined })
      )
    }
    // WhatsApp → клиенту
    if (client?.whatsapp_number) {
      await sendWhatsAppMessage(client.whatsapp_number,
        waTplReminder({ clientName: client.name, serviceName: service?.name ?? '—', date, time, businessName: biz?.name ?? '' }),
        waCredentials
      )
    }
    // Email → клиенту
    if (client?.email) {
      try {
        await sendReminder({
          to: client.email, clientName: client.name,
          businessName: biz?.name ?? '', serviceName: service?.name ?? '—',
          date, time,
          employeeName: employee?.name ?? undefined,
          address: biz?.address ?? undefined,
        })
      } catch (err) {
        console.error('[cron/notify] sendReminder 24h error:', err)
      }
    }
    results.push(`reminder_24h:${a.id}`)
  }

  // ── 2. 1h reminders ─────────────────────────────────────────────────────────
  const from1h = new Date(now.getTime() + 45 * 60_000).toISOString()
  const to1h   = new Date(now.getTime() + 75 * 60_000).toISOString()
  debug.window_1h = { from: from1h, to: to1h }

  const { data: appts1h, error: err1h } = await supabase
    .from('appointments')
    .select('id, starts_at, business_id, services(name), employees(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)')
    .gte('starts_at', from1h)
    .lte('starts_at', to1h)
    .eq('status', 'confirmed')
  debug.appts1h = { count: appts1h?.length ?? 0, error: err1h?.message ?? null }

  for (const a of appts1h ?? []) {
    const client = a.clients as unknown as { name: string; email: string | null; whatsapp_number: string | null; viber_user_id: string | null; telegram_id: string | null } | null
    // Skip without logging if client has no contact channels at all.
    // This prevents burning a notification_log entry for a booking that can never
    // be delivered — which would permanently block retries once contact info is added.
    if (!client?.telegram_id && !client?.email && !client?.viber_user_id && !client?.whatsapp_number) continue
    if (!await logged(a.business_id, a.id, 'reminder_1h')) continue

    const { data: biz } = await supabase
      .from('businesses')
      .select('name, address, timezone, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
      .eq('id', a.business_id).single()

    const service  = a.services  as unknown as { name: string } | null
    const employee = a.employees as unknown as { name: string } | null
    const tz = biz?.timezone ?? 'UTC'
    const date = formatEmailDate(a.starts_at, tz)
    const time = formatEmailTime(a.starts_at, tz)
    const waCredentials = biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
      ? { phoneNumberId: biz.meta_whatsapp_phone_number_id, accessToken: biz.meta_whatsapp_access_token }
      : undefined

    // Telegram → клиенту (владельцу reminder не нужен — он уже получил уведомление при создании записи)
    if (biz?.telegram_bot_token && client?.telegram_id) {
      await sendTelegramMessage(biz.telegram_bot_token, client.telegram_id,
        tgTplReminderClient({ clientName: client.name, serviceName: service?.name ?? '—', date, time, businessName: biz.name, address: biz.address ?? undefined, isOneHour: true })
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && client?.viber_user_id) {
      await sendViberMessage(biz.viber_bot_token, client.viber_user_id,
        viberTplReminderClient({ clientName: client.name, serviceName: service?.name ?? '—', date, time, businessName: biz.name, address: biz.address ?? undefined, isOneHour: true })
      )
    }
    // WhatsApp → клиенту
    if (client?.whatsapp_number) {
      await sendWhatsAppMessage(client.whatsapp_number,
        waTplReminder({ clientName: client.name, serviceName: service?.name ?? '—', date, time, businessName: biz?.name ?? '', isOneHour: true }),
        waCredentials
      )
    }
    // Email → клиенту
    if (client?.email) {
      try {
        await sendReminder({
          to: client.email, clientName: client.name,
          businessName: biz?.name ?? '', serviceName: service?.name ?? '—',
          date, time,
          employeeName: employee?.name ?? undefined,
          address: biz?.address ?? undefined,
          isOneHour: true,
        })
      } catch (err) {
        console.error('[cron/notify] sendReminder 1h error:', err)
      }
    }
    results.push(`reminder_1h:${a.id}`)
  }

  // ── 3. Thank-you ─────────────────────────────────────────────────────────────
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000).toISOString()
  debug.window_thankyou = { from: twoHoursAgo, to: now.toISOString() }

  const { data: completed, error: errTy } = await supabase
    .from('appointments')
    .select('id, business_id, services(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)')
    .eq('status', 'completed')
    .gte('ends_at', twoHoursAgo)
    .lte('ends_at', now.toISOString())
  debug.thankyou = { count: completed?.length ?? 0, error: errTy?.message ?? null }

  for (const a of completed ?? []) {
    if (!await logged(a.business_id, a.id, 'thankyou')) continue

    const { data: biz } = await supabase
      .from('businesses')
      .select('name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
      .eq('id', a.business_id).single()

    const client  = a.clients  as unknown as { name: string; email: string | null; whatsapp_number: string | null; viber_user_id: string | null; telegram_id: string | null } | null
    const service = a.services as unknown as { name: string } | null
    const bookingUrl = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
    const waCredentials = biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
      ? { phoneNumberId: biz.meta_whatsapp_phone_number_id, accessToken: biz.meta_whatsapp_access_token }
      : undefined

    // Telegram → владельцу
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      await sendTelegramMessage(biz.telegram_bot_token, biz.telegram_chat_id,
        tplThankYou({ clientName: client?.name ?? 'Walk-in', serviceName: service?.name ?? '—' })
      )
    }
    // Telegram → клиенту
    if (biz?.telegram_bot_token && client?.telegram_id) {
      await sendTelegramMessage(biz.telegram_bot_token, client.telegram_id,
        tgTplThankYouClient({ clientName: client.name, serviceName: service?.name ?? '—', businessName: biz.name, bookingUrl })
      )
    }
    // Viber → владельцу
    if (biz?.viber_bot_token && biz?.viber_chat_id) {
      await sendViberMessage(biz.viber_bot_token, biz.viber_chat_id,
        viberTplThankYou({ clientName: client?.name ?? 'Walk-in', serviceName: service?.name ?? '—' })
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && client?.viber_user_id) {
      await sendViberMessage(biz.viber_bot_token, client.viber_user_id,
        viberTplThankYouClient({ clientName: client.name, serviceName: service?.name ?? '—', businessName: biz.name, bookingUrl })
      )
    }
    // WhatsApp → клиенту
    if (client?.whatsapp_number) {
      await sendWhatsAppMessage(client.whatsapp_number,
        waTplThankYou({ clientName: client.name, serviceName: service?.name ?? '—', businessName: biz?.name ?? '', bookingUrl }),
        waCredentials
      )
    }
    // Email → клиенту
    if (client?.email) {
      await sendThankYou({
        to: client.email, clientName: client.name,
        businessName: biz?.name ?? '',
        serviceName: service?.name ?? '—',
        bookingUrl,
      })
    }
    results.push(`thankyou:${a.id}`)
  }

  // ── 4. Re-activation ─────────────────────────────────────────────────────────
  const reactivStart = new Date(now)
  reactivStart.setDate(reactivStart.getDate() - 30)
  reactivStart.setHours(0, 0, 0, 0)
  const reactivEnd = new Date(reactivStart)
  reactivEnd.setHours(23, 59, 59, 999)

  debug.window_reactivation = { from: reactivStart.toISOString(), to: reactivEnd.toISOString() }

  const { data: dormant, error: errRe } = await supabase
    .from('clients')
    .select('id, name, email, whatsapp_number, viber_user_id, telegram_id, business_id')
    .gte('last_visit_at', reactivStart.toISOString())
    .lte('last_visit_at', reactivEnd.toISOString())
  debug.reactivation = { count: dormant?.length ?? 0, error: errRe?.message ?? null }

  for (const c of dormant ?? []) {
    if (!c.email && !c.whatsapp_number && !c.viber_user_id && !c.telegram_id) continue
    if (!await logged(c.business_id, c.id, 'reactivation')) continue

    const { data: biz } = await supabase.from('businesses').select('name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, meta_whatsapp_phone_number_id, meta_whatsapp_access_token').eq('id', c.business_id).single()
    const bookingUrl = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
    const waCredentials = biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
      ? { phoneNumberId: biz.meta_whatsapp_phone_number_id, accessToken: biz.meta_whatsapp_access_token }
      : undefined

    // Telegram → владельцу
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      await sendTelegramMessage(biz.telegram_bot_token, biz.telegram_chat_id,
        tgTplReactivation({ clientName: c.name })
      )
    }
    // Telegram → клиенту
    if (biz?.telegram_bot_token && c.telegram_id) {
      await sendTelegramMessage(biz.telegram_bot_token, c.telegram_id,
        tgTplReactivationClient({ clientName: c.name, businessName: biz.name, bookingUrl })
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && c.viber_user_id) {
      await sendViberMessage(biz.viber_bot_token, c.viber_user_id,
        viberTplReactivation({ clientName: c.name, businessName: biz.name, bookingUrl })
      )
    }
    // WhatsApp → клиенту
    if (c.whatsapp_number) {
      await sendWhatsAppMessage(c.whatsapp_number,
        waTplReactivation({ clientName: c.name, businessName: biz?.name ?? '', bookingUrl }),
        waCredentials
      )
    }
    // Email → клиенту
    if (c.email) {
      await sendReactivation({
        to: c.email, clientName: c.name,
        businessName: biz?.name ?? '',
        bookingUrl,
      })
    }
    results.push(`reactivation:${c.id}`)
  }

  // ── 5. Birthday ───────────────────────────────────────────────────────────────
  // .like() не работает на колонке типа date в PostgREST — фильтруем в JS
  const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const { data: allClientsWithBday } = await supabase
    .from('clients')
    .select('id, name, email, whatsapp_number, viber_user_id, telegram_id, birthday, business_id')
    .not('birthday', 'is', null)

  const bdays = (allClientsWithBday ?? []).filter(
    (c) => typeof c.birthday === 'string' && c.birthday.slice(5) === todayMD
  )

  for (const c of bdays ?? []) {
    if (!c.email && !c.whatsapp_number && !c.viber_user_id && !c.telegram_id) continue
    const year = now.getFullYear()
    if (!await logged(c.business_id, `${c.id}_bday_${year}`, 'birthday')) continue

    const { data: biz } = await supabase.from('businesses').select('name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, meta_whatsapp_phone_number_id, meta_whatsapp_access_token').eq('id', c.business_id).single()
    const bookingUrl = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
    const waCredentials = biz?.meta_whatsapp_phone_number_id && biz?.meta_whatsapp_access_token
      ? { phoneNumberId: biz.meta_whatsapp_phone_number_id, accessToken: biz.meta_whatsapp_access_token }
      : undefined

    // Telegram → владельцу
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      await sendTelegramMessage(biz.telegram_bot_token, biz.telegram_chat_id,
        tgTplBirthday({ clientName: c.name })
      )
    }
    // Telegram → клиенту
    if (biz?.telegram_bot_token && c.telegram_id) {
      await sendTelegramMessage(biz.telegram_bot_token, c.telegram_id,
        tgTplBirthdayClient({ clientName: c.name, businessName: biz.name, bookingUrl })
      )
    }
    // Viber → клиенту
    if (biz?.viber_bot_token && c.viber_user_id) {
      await sendViberMessage(biz.viber_bot_token, c.viber_user_id,
        viberTplBirthday({ clientName: c.name, businessName: biz.name, bookingUrl })
      )
    }
    // WhatsApp → клиенту
    if (c.whatsapp_number) {
      await sendWhatsAppMessage(c.whatsapp_number,
        waTplBirthday({ clientName: c.name, businessName: biz?.name ?? '', bookingUrl }),
        waCredentials
      )
    }
    // Email → клиенту
    if (c.email) {
      await sendBirthday({
        to: c.email, clientName: c.name,
        businessName: biz?.name ?? '',
        bookingUrl,
      })
    }
    results.push(`birthday:${c.id}`)
  }

  // ── 6. Waitlist expire (US7 T068) ────────────────────────────────────────────
  try {
    const waitlistCutoff = new Date(now.getTime() - 30 * 60_000).toISOString()
    const { data: toExpireNotified } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'notified')
      .lt('notified_at', waitlistCutoff)
    if (toExpireNotified && toExpireNotified.length > 0) {
      const ids = toExpireNotified.map((r) => (r as { id: string }).id)
      await supabase.from('waitlist').update({ status: 'expired' }).in('id', ids)
      results.push(`waitlist_expired_notified:${ids.length}`)
      debug.waitlist_expired_notified = ids.length
    }
    const nowIso = now.toISOString()
    const { data: toExpireWaiting } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'waiting')
      .lt('desired_at', nowIso)
    if (toExpireWaiting && toExpireWaiting.length > 0) {
      const ids = toExpireWaiting.map((r) => (r as { id: string }).id)
      await supabase.from('waitlist').update({ status: 'expired' }).in('id', ids)
      results.push(`waitlist_expired_waiting:${ids.length}`)
      debug.waitlist_expired_waiting = ids.length
    }
  } catch (e) {
    debug.waitlist_expire_error = String((e as Error).message ?? e).slice(0, 200)
  }

  // ── 7. Holiday reminder (US7 T068) — notify clients with appointments tomorrow that tomorrow is holiday → warn? ──
  // For MVP we just add debug entry for upcoming holidays in next 7 days per business (no send yet, avoids spam).
  try {
    const nextWeek = new Date(now)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const todayStr = now.toISOString().slice(0, 10)
    const nextWeekStr = nextWeek.toISOString().slice(0, 10)
    const { data: upcomingHolidays } = await supabase
      .from('holidays')
      .select('business_id, date, reason, is_open')
      .gte('date', todayStr)
      .lte('date', nextWeekStr)
      .eq('is_open', false)
      .limit(50)
    if (upcomingHolidays && upcomingHolidays.length > 0) {
      debug.upcoming_holidays = upcomingHolidays.length
      // For observability we push a result per holiday (no actual send to avoid duplicate holiday spam; actual blocking is at booking time)
      for (const h of upcomingHolidays as { business_id: string; date: string }[]) {
        results.push(`holiday:${h.business_id}:${h.date}`)
      }
    }
  } catch (e) {
    debug.holiday_error = String((e as Error).message ?? e).slice(0, 200)
  }

  // ── 8. CRM inactive_42 + birthday_7 campaigns auto-send (T073) ─────────────
  // Runs daily; uses dedup via notification_log 1h window and campaign logic.
  try {
    const { filterClientsBySegment } = await import('@/lib/campaigns')
    const campaignTodayStr = now.toISOString().slice(0, 10) // dedup daily CRM auto run
    // Process per business (limit 20 to avoid timeout)
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name, slug, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
      .limit(20)

    for (const bizRaw of (businesses as unknown as { id: string; name: string; slug: string | null; meta_whatsapp_phone_number_id: string | null; meta_whatsapp_access_token: string | null }[] | null) ?? []) {
      const biz = bizRaw as { id: string; name: string; slug: string | null; meta_whatsapp_phone_number_id: string | null; meta_whatsapp_access_token: string | null }
      const waCreds = biz.meta_whatsapp_phone_number_id && biz.meta_whatsapp_access_token
        ? { phoneNumberId: biz.meta_whatsapp_phone_number_id, accessToken: biz.meta_whatsapp_access_token }
        : undefined
      const bookingUrl = biz.slug ? `${APP_URL}/book/${biz.slug}` : undefined

      // Helper to send segment campaign if not already sent today (via notification_log)
      async function processSegment(segment: 'inactive_42' | 'birthday_7') {
        const eventType = `crm_auto_${segment}:${biz.id}:${campaignTodayStr}`
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

        const clients = (clientsRaw as unknown as { id: string; name: string; phone: string | null; whatsapp_number: string | null; email: string | null; birthday: string | null; tags: string[] | null; last_visit_at: string | null }[] | null) ?? []
        // Enrich with transaction stats for visits
        const ids = clients.map((c) => c.id)
        const statsMap: Record<string, { total_visits: number; last_visit_at: string | null }> = {}
        if (ids.length > 0) {
          const { data: txs } = await supabase
            .from('transactions')
            .select('client_id, created_at')
            .eq('business_id', biz.id)
            .eq('status', 'completed')
            .in('client_id', ids)
            .order('created_at', { ascending: false })
            .limit(1000) as unknown as { data: { client_id: string; created_at: string }[] | null }
          for (const tx of txs ?? []) {
            if (!tx.client_id) continue
            if (!statsMap[tx.client_id]) statsMap[tx.client_id] = { total_visits: 0, last_visit_at: null }
            statsMap[tx.client_id].total_visits++
            if (!statsMap[tx.client_id].last_visit_at) statsMap[tx.client_id].last_visit_at = tx.created_at
          }
        }
        const enriched = clients.map((c) => ({
          id: c.id,
          birthday: c.birthday,
          tags: c.tags,
          last_visit_at: statsMap[c.id]?.last_visit_at ?? c.last_visit_at ?? null,
          total_visits: statsMap[c.id]?.total_visits ?? 0,
        }))
        const filtered = filterClientsBySegment(enriched, segment, now)
        const filteredIds = new Set(filtered.map((f) => f.id))
        const recipients = clients.filter((c) => filteredIds.has(c.id))
        if (recipients.length === 0) return

        let template: string
        if (segment === 'inactive_42') {
          template = `Hola {{name}} 👋 te extrañamos en ${biz.name}. ¡Tenés 20% en tu próximo corte esta semana!${bookingUrl ? ` Reserva: ${bookingUrl}` : ''}`
        } else {
          template = `¡Feliz cumple {{name}}! 🎂 ${biz.name} te desea un gran día. ¡Tenés un regalo esperando!${bookingUrl ? ` Reserva: ${bookingUrl}` : ''}`
        }

        let sentCount = 0
        for (const c of recipients.slice(0, 100)) { // cap 100 per run to avoid timeout
          const dedupKey = `campaign_auto:${segment}:${c.id}`
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
          const { data: recent } = await supabase
            .from('notification_log')
            .select('id')
            .eq('business_id', biz.id)
            .eq('ref_id', c.id)
            .eq('type', dedupKey)
            .gte('sent_at', oneHourAgo)
            .limit(1) as unknown as { data: unknown[] | null }
          if ((recent as unknown[])?.length) continue

          const body = template.replaceAll('{{name}}', c.name).replaceAll('{{business}}', biz.name)
          const to = c.whatsapp_number ?? c.phone
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
  } catch (e) {
    debug.crm_auto_error = String((e as Error).message ?? e).slice(0, 300)
  }

  // ── 9. Campaign rebooked attribution sweep (T073) ──────────────────────────
  // Find appointments created in last 24h with source=campaign and flip recipients to rebooked.
  try {
    const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
    const { data: recentCampaignAppts } = await supabase
      .from('appointments')
      .select('id, client_id, business_id, campaign_id, created_at, source')
      .gte('created_at', since)
      .in('source', ['campaign', 'campaign_auto'])
      .limit(100)

    for (const a of (recentCampaignAppts as unknown as { id: string; client_id: string | null; business_id: string; campaign_id: string | null; source: string }[] | null) ?? []) {
      if (!a.client_id) continue
      try {
        if (a.campaign_id) {
          const { data: existing } = await supabase
            .from('campaign_recipients')
            .select('status')
            .eq('campaign_id', a.campaign_id)
            .eq('client_id', a.client_id)
            .maybeSingle() as unknown as { data: { status: string } | null }
          if (existing && existing.status !== 'rebooked') {
            await supabase.from('campaign_recipients').update({ status: 'rebooked' }).eq('campaign_id', a.campaign_id).eq('client_id', a.client_id)
            const { data: camp } = await supabase.from('campaigns').select('stats').eq('id', a.campaign_id).maybeSingle() as unknown as { data: { stats: Record<string, number> } | null }
            if (camp?.stats) {
              const next = { ...camp.stats, rebooked: (camp.stats.rebooked ?? 0) + 1 }
              await supabase.from('campaigns').update({ stats: next }).eq('id', a.campaign_id)
            }
            results.push(`campaign_rebooked:${a.campaign_id}:${a.client_id}`)
          }
        } else {
          // No campaign_id, attribute to most recent sent campaign for this client
          const { attributeRebooking } = await import('@/lib/campaigns')
          await attributeRebooking(supabase as unknown as Parameters<typeof attributeRebooking>[0], { clientId: a.client_id, businessId: a.business_id })
          results.push(`campaign_rebooked_auto:${a.client_id}`)
        }
      } catch {}
    }
    // Also sweep: any client with a new completed transaction? Could extend but cron sweep above covers appointments.
  } catch (e) {
    debug.campaign_rebooked_error = String((e as Error).message ?? e).slice(0, 300)
  }

  return NextResponse.json({ ok: true, sent: results.length, results, debug })
}
