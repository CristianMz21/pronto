/**
 * GET /api/cron/notify?secret=YOUR_SECRET
 *
 * Запускать каждый час через внешний планировщик (cron-job.org, Vercel Cron и т.д.)
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

type Supa = ReturnType<typeof createClient<Database>>

async function tryLog(
  supabase: Supa,
  businessId: string,
  refId: string,
  type: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('notification_log')
    .insert({ business_id: businessId, ref_id: refId, type, channel: 'email' })
  return !error
}

function waCreds(
  biz: {
    meta_whatsapp_phone_number_id: string | null
    meta_whatsapp_access_token: string | null
  } | null,
): WhatsAppCredentials | undefined {
  if (!biz?.meta_whatsapp_phone_number_id || !biz?.meta_whatsapp_access_token) return undefined
  return {
    phoneNumberId: biz.meta_whatsapp_phone_number_id,
    accessToken: biz.meta_whatsapp_access_token,
  }
}

function hasAnyChannel(
  client: {
    telegram_id: string | null
    email: string | null
    viber_user_id: string | null
    whatsapp_number: string | null
  } | null,
): boolean {
  if (!client) return false
  return !!(client.telegram_id || client.email || client.viber_user_id || client.whatsapp_number)
}

async function notifyReminderChannels(
  biz: BusinessReminderRow | null,
  client: AppointmentReminderRow['clients'],
  service: { name: string } | null,
  employee: { name: string } | null,
  date: string,
  time: string,
  isOneHour: boolean,
): Promise<void> {
  const creds = waCreds(biz)
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
        isOneHour,
      }),
    )
  }
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
        isOneHour,
      }),
    )
  }
  if (client?.whatsapp_number)
    await sendWhatsAppMessage(
      client.whatsapp_number,
      waTplReminder({
        clientName: client.name,
        serviceName: service?.name ?? '—',
        date,
        time,
        businessName: biz?.name ?? '',
        isOneHour,
      }),
      creds,
    )
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
        isOneHour,
      })
    } catch {}
  }
}

async function processReminderWindow(
  supabase: Supa,
  now: Date,
  debug: Record<string, unknown>,
  results: string[],
  fromOffset: number,
  toOffset: number,
  type: string,
  isOneHour: boolean,
): Promise<void> {
  const from = new Date(now.getTime() + fromOffset).toISOString()
  const to = new Date(now.getTime() + toOffset).toISOString()
  debug[`window_${type}`] = { from, to }
  const { data: appts, error } = await supabase
    .from('appointments')
    .select(
      'id, starts_at, business_id, services(name), employees(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)',
    )
    .gte('starts_at', from)
    .lte('starts_at', to)
    .eq('status', 'confirmed')
    .returns<AppointmentReminderRow[]>()
  debug[type] = { count: appts?.length ?? 0, error: error?.message ?? null }
  for (const a of appts ?? []) {
    const client = a.clients
    if (!hasAnyChannel(client)) continue
    if (!(await tryLog(supabase, a.business_id, a.id, type))) continue
    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, address, timezone, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', a.business_id)
      .single()
    const biz = bizData as BusinessReminderRow | null
    const date = formatEmailDate(a.starts_at, biz?.timezone ?? 'UTC')
    const time = formatEmailTime(a.starts_at, biz?.timezone ?? 'UTC')
    await notifyReminderChannels(biz, client, a.services, a.employees, date, time, isOneHour)
    results.push(`${type}:${a.id}`)
  }
}

async function notifyThankYouChannels(
  biz: BusinessThankYouRow | null,
  client: AppointmentThankYouRow['clients'],
  service: { name: string } | null,
): Promise<void> {
  const bookingUrl = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
  const creds = waCreds(biz)
  if (biz?.telegram_bot_token && biz?.telegram_chat_id)
    await sendTelegramMessage(
      biz.telegram_bot_token,
      biz.telegram_chat_id,
      tplThankYou({ clientName: client?.name ?? 'Walk-in', serviceName: service?.name ?? '—' }),
    )
  if (biz?.telegram_bot_token && client?.telegram_id)
    await sendTelegramMessage(
      biz.telegram_bot_token,
      client.telegram_id,
      tgTplThankYouClient({
        clientName: client!.name,
        serviceName: service?.name ?? '—',
        businessName: biz.name,
        bookingUrl,
      }),
    )
  if (biz?.viber_bot_token && biz?.viber_chat_id)
    await sendViberMessage(
      biz.viber_bot_token,
      biz.viber_chat_id,
      viberTplThankYou({
        clientName: client?.name ?? 'Walk-in',
        serviceName: service?.name ?? '—',
      }),
    )
  if (biz?.viber_bot_token && client?.viber_user_id)
    await sendViberMessage(
      biz.viber_bot_token,
      client.viber_user_id,
      viberTplThankYouClient({
        clientName: client!.name,
        serviceName: service?.name ?? '—',
        businessName: biz.name,
        bookingUrl,
      }),
    )
  if (client?.whatsapp_number)
    await sendWhatsAppMessage(
      client.whatsapp_number,
      waTplThankYou({
        clientName: client!.name,
        serviceName: service?.name ?? '—',
        businessName: biz?.name ?? '',
        bookingUrl,
      }),
      creds,
    )
  if (client?.email)
    await sendThankYou({
      to: client.email,
      clientName: client!.name,
      businessName: biz?.name ?? '',
      serviceName: service?.name ?? '—',
      bookingUrl,
    })
}

async function handleThankYouBatch(
  supabase: Supa,
  now: Date,
  debug: Record<string, unknown>,
  results: string[],
): Promise<void> {
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000).toISOString()
  debug.window_thankyou = { from: twoHoursAgo, to: now.toISOString() }
  const { data: completed, error } = await supabase
    .from('appointments')
    .select(
      'id, business_id, services(name), clients(name, email, whatsapp_number, viber_user_id, telegram_id)',
    )
    .eq('status', 'completed')
    .gte('ends_at', twoHoursAgo)
    .lte('ends_at', now.toISOString())
    .returns<AppointmentThankYouRow[]>()
  debug.thankyou = { count: completed?.length ?? 0, error: error?.message ?? null }
  for (const a of completed ?? []) {
    if (!(await tryLog(supabase, a.business_id, a.id, 'thankyou'))) continue
    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', a.business_id)
      .single()
    await notifyThankYouChannels(bizData as BusinessThankYouRow | null, a.clients, a.services)
    results.push(`thankyou:${a.id}`)
  }
}

async function notifyReactivationChannels(
  biz: BusinessReactivationRow | null,
  client: ClientDormantRow,
  bookingUrl: string | undefined,
  creds: WhatsAppCredentials | undefined,
): Promise<void> {
  if (biz?.telegram_bot_token && biz?.telegram_chat_id)
    await sendTelegramMessage(
      biz.telegram_bot_token,
      biz.telegram_chat_id,
      tgTplReactivation({ clientName: client.name }),
    )
  if (biz?.telegram_bot_token && client.telegram_id)
    await sendTelegramMessage(
      biz.telegram_bot_token,
      client.telegram_id,
      tgTplReactivationClient({ clientName: client.name, businessName: biz.name, bookingUrl }),
    )
  if (biz?.viber_bot_token && client.viber_user_id)
    await sendViberMessage(
      biz.viber_bot_token,
      client.viber_user_id,
      viberTplReactivation({ clientName: client.name, businessName: biz.name, bookingUrl }),
    )
  if (client.whatsapp_number)
    await sendWhatsAppMessage(
      client.whatsapp_number,
      waTplReactivation({ clientName: client.name, businessName: biz?.name ?? '', bookingUrl }),
      creds,
    )
  if (client.email)
    await sendReactivation({
      to: client.email,
      clientName: client.name,
      businessName: biz?.name ?? '',
      bookingUrl,
    })
}

async function handleReactivationBatch(
  supabase: Supa,
  now: Date,
  debug: Record<string, unknown>,
  results: string[],
): Promise<void> {
  const start = new Date(now)
  start.setDate(start.getDate() - 30)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  debug.window_reactivation = { from: start.toISOString(), to: end.toISOString() }
  const { data: dormant, error } = await supabase
    .from('clients')
    .select('id, name, email, whatsapp_number, viber_user_id, telegram_id, business_id')
    .gte('last_visit_at', start.toISOString())
    .lte('last_visit_at', end.toISOString())
    .returns<ClientDormantRow[]>()
  debug.reactivation = { count: dormant?.length ?? 0, error: error?.message ?? null }
  for (const c of dormant ?? []) {
    if (!c.email && !c.whatsapp_number && !c.viber_user_id && !c.telegram_id) continue
    if (!(await tryLog(supabase, c.business_id, c.id, 'reactivation'))) continue
    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', c.business_id)
      .single()
    const biz = bizData as BusinessReactivationRow | null
    const bookingUrl = biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined
    await notifyReactivationChannels(biz, c, bookingUrl, waCreds(biz))
    results.push(`reactivation:${c.id}`)
  }
}

async function notifyBirthdayChannels(
  biz: BusinessReactivationRow | null,
  client: ClientBirthdayRow,
  bookingUrl: string | undefined,
  creds: WhatsAppCredentials | undefined,
): Promise<void> {
  if (biz?.telegram_bot_token && biz?.telegram_chat_id)
    await sendTelegramMessage(
      biz.telegram_bot_token,
      biz.telegram_chat_id,
      tgTplBirthday({ clientName: client.name }),
    )
  if (biz?.telegram_bot_token && client.telegram_id)
    await sendTelegramMessage(
      biz.telegram_bot_token,
      client.telegram_id,
      tgTplBirthdayClient({ clientName: client.name, businessName: biz.name, bookingUrl }),
    )
  if (biz?.viber_bot_token && client.viber_user_id)
    await sendViberMessage(
      biz.viber_bot_token,
      client.viber_user_id,
      viberTplBirthday({ clientName: client.name, businessName: biz.name, bookingUrl }),
    )
  if (client.whatsapp_number)
    await sendWhatsAppMessage(
      client.whatsapp_number,
      waTplBirthday({ clientName: client.name, businessName: biz?.name ?? '', bookingUrl }),
      creds,
    )
  if (client.email)
    await sendBirthday({
      to: client.email,
      clientName: client.name,
      businessName: biz?.name ?? '',
      bookingUrl,
    })
}

async function handleBirthdayBatch(supabase: Supa, now: Date, results: string[]): Promise<void> {
  const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const { data: all } = await supabase
    .from('clients')
    .select('id, name, email, whatsapp_number, viber_user_id, telegram_id, birthday, business_id')
    .not('birthday', 'is', null)
    .returns<ClientBirthdayRow[]>()
  const bdays = (all ?? []).filter(
    (c) => typeof c.birthday === 'string' && c.birthday.slice(5) === todayMD,
  )
  for (const c of bdays) {
    if (!c.email && !c.whatsapp_number && !c.viber_user_id && !c.telegram_id) continue
    const year = now.getFullYear()
    if (!(await tryLog(supabase, c.business_id, `${c.id}_bday_${year}`, 'birthday'))) continue
    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'name, slug, telegram_bot_token, telegram_chat_id, viber_bot_token, meta_whatsapp_phone_number_id, meta_whatsapp_access_token',
      )
      .eq('id', c.business_id)
      .single()
    const biz = bizData as BusinessReactivationRow | null
    await notifyBirthdayChannels(
      biz,
      c,
      biz?.slug ? `${APP_URL}/book/${biz.slug}` : undefined,
      waCreds(biz),
    )
    results.push(`birthday:${c.id}`)
  }
}

async function handleWaitlistBatch(
  supabase: Supa,
  now: Date,
  debug: Record<string, unknown>,
  results: string[],
): Promise<void> {
  try {
    const cutoff = new Date(now.getTime() - 30 * 60_000).toISOString()
    const { data: toExpireNotified } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'notified')
      .lt('notified_at', cutoff)
      .returns<WaitlistIdRow[]>()
    if (toExpireNotified && toExpireNotified.length > 0) {
      const ids = toExpireNotified.map((r) => r.id)
      await supabase.from('waitlist').update({ status: 'expired' }).in('id', ids)
      results.push(`waitlist_expired_notified:${ids.length}`)
      debug.waitlist_expired_notified = ids.length
    }
    const { data: toExpireWaiting } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'waiting')
      .lt('desired_at', now.toISOString())
      .returns<WaitlistIdRow[]>()
    if (toExpireWaiting && toExpireWaiting.length > 0) {
      const ids = toExpireWaiting.map((r) => r.id)
      await supabase.from('waitlist').update({ status: 'expired' }).in('id', ids)
      results.push(`waitlist_expired_waiting:${ids.length}`)
      debug.waitlist_expired_waiting = ids.length
    }
  } catch (e: unknown) {
    debug.waitlist_expire_error = (e instanceof Error ? (e.message ?? String(e)) : String(e)).slice(
      0,
      200,
    )
  }
}

async function handleHolidayBatch(
  supabase: Supa,
  now: Date,
  debug: Record<string, unknown>,
  results: string[],
): Promise<void> {
  try {
    const nextWeek = new Date(now)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const todayStr = now.toISOString().slice(0, 10)
    const nextWeekStr = nextWeek.toISOString().slice(0, 10)
    const { data: upcoming } = await supabase
      .from('holidays')
      .select('business_id, date, reason, is_open')
      .gte('date', todayStr)
      .lte('date', nextWeekStr)
      .eq('is_open', false)
      .limit(50)
      .returns<HolidayRow[]>()
    if (upcoming && upcoming.length > 0) {
      debug.upcoming_holidays = upcoming.length
      for (const h of upcoming) results.push(`holiday:${h.business_id}:${h.date}`)
    }
  } catch (e: unknown) {
    debug.holiday_error = (e instanceof Error ? (e.message ?? String(e)) : String(e)).slice(0, 200)
  }
}

async function sendSegmentRecipients(
  supabase: Supa,
  biz: BusinessCampaignRow,
  segment: 'inactive_42' | 'birthday_7',
  recipients: ClientCampaignRow[],
  _campaignTodayStr: string,
  waCreds: WhatsAppCredentials | undefined,
  bookingUrl: string | undefined,
  results: string[],
): Promise<number> {
  let template =
    segment === 'inactive_42'
      ? `Hola {{name}} 👋 te extrañamos en ${biz.name}. ¡Tenés 20% en tu próximo corte esta semana!${bookingUrl ? ` Reserva: ${bookingUrl}` : ''}`
      : `¡Feliz cumple {{name}}! 🎂 ${biz.name} te desea un gran día. ¡Tenés un regalo esperando!${bookingUrl ? ` Reserva: ${bookingUrl}` : ''}`
  let sentCount = 0
  for (const c of recipients.slice(0, 100)) {
    const dedupKey = `campaign_auto:${segment}:${c.id}`
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
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
    const body = template.replaceAll('{{name}}', c.name).replaceAll('{{business}}', biz.name)
    const to = c.whatsapp_number ?? c.phone
    let ok = false
    if (to) {
      ok = await sendWhatsAppMessage(to, body, waCreds)
      if (!ok && !waCreds) ok = true
    }
    try {
      await supabase
        .from('notification_log')
        .insert({ business_id: biz.id, ref_id: c.id, type: dedupKey, channel: 'whatsapp' })
    } catch {}
    if (ok) {
      sentCount++
      results.push(`crm_auto_${segment}:${c.id}`)
    }
  }
  return sentCount
}

async function processCrmSegment(
  supabase: Supa,
  biz: BusinessCampaignRow,
  segment: 'inactive_42' | 'birthday_7',
  now: Date,
  campaignTodayStr: string,
  results: string[],
  debug: Record<string, unknown>,
): Promise<void> {
  const eventType = `crm_auto_${segment}:${biz.id}:${campaignTodayStr}`
  const { error: logErr } = await supabase
    .from('notification_log')
    .insert({ business_id: biz.id, ref_id: biz.id, type: eventType, channel: 'whatsapp' })
  if (logErr) return
  const { data: clientsRaw } = await supabase
    .from('clients')
    .select('id, name, phone, whatsapp_number, email, birthday, tags, last_visit_at')
    .eq('business_id', biz.id)
    .limit(300)
    .returns<ClientCampaignRow[]>()
  const clients = clientsRaw ?? []
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
      .limit(1000)
      .returns<TransactionStatRow[]>()
    for (const tx of txs ?? []) {
      if (!tx.client_id) continue
      if (!statsMap[tx.client_id]) statsMap[tx.client_id] = { total_visits: 0, last_visit_at: null }
      const entry = statsMap[tx.client_id]!
      entry.total_visits++
      if (!entry.last_visit_at) entry.last_visit_at = tx.created_at
    }
  }
  const { filterClientsBySegment } = await import('@/lib/campaigns')
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
  const wa = waCreds(biz)
  const bookingUrl = biz.slug ? `${APP_URL}/book/${biz.slug}` : undefined
  const sent = await sendSegmentRecipients(
    supabase,
    biz,
    segment,
    recipients,
    campaignTodayStr,
    wa,
    bookingUrl,
    results,
  )
  if (sent > 0) debug[`crm_auto_${segment}_${biz.id}`] = sent
}

async function handleCrmBatch(
  supabase: Supa,
  now: Date,
  debug: Record<string, unknown>,
  results: string[],
): Promise<void> {
  try {
    const campaignTodayStr = now.toISOString().slice(0, 10)
    const { data: businesses } = await supabase
      .from('businesses')
      .select('id, name, slug, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
      .limit(20)
      .returns<BusinessCampaignRow[]>()
    for (const biz of businesses ?? []) {
      await processCrmSegment(supabase, biz, 'inactive_42', now, campaignTodayStr, results, debug)
      await processCrmSegment(supabase, biz, 'birthday_7', now, campaignTodayStr, results, debug)
    }
  } catch (e: unknown) {
    debug.crm_auto_error = (e instanceof Error ? (e.message ?? String(e)) : String(e)).slice(0, 300)
  }
}

async function handleCampaignRebookedBatch(
  supabase: Supa,
  now: Date,
  debug: Record<string, unknown>,
  results: string[],
): Promise<void> {
  try {
    const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('appointments')
      .select('id, client_id, business_id, campaign_id, created_at, source')
      .gte('created_at', since)
      .in('source', ['campaign', 'campaign_auto'])
      .limit(100)
      .returns<AppointmentCampaignRow[]>()
    for (const a of recent ?? []) {
      if (!a.client_id) continue
      try {
        if (a.campaign_id) {
          const { data: existing } = await supabase
            .from('campaign_recipients')
            .select('status')
            .eq('campaign_id', a.campaign_id)
            .eq('client_id', a.client_id)
            .maybeSingle()
          if (existing && (existing as { status: string }).status !== 'rebooked') {
            await supabase
              .from('campaign_recipients')
              .update({ status: 'rebooked' })
              .eq('campaign_id', a.campaign_id)
              .eq('client_id', a.client_id)
            const { data: camp } = await supabase
              .from('campaigns')
              .select('stats')
              .eq('id', a.campaign_id)
              .maybeSingle()
            if ((camp as CampaignStatsRow | null)?.stats) {
              const next = {
                ...(camp as CampaignStatsRow).stats,
                rebooked: ((camp as CampaignStatsRow).stats.rebooked ?? 0) + 1,
              }
              await supabase.from('campaigns').update({ stats: next }).eq('id', a.campaign_id)
            }
            results.push(`campaign_rebooked:${a.campaign_id}:${a.client_id}`)
          }
        } else {
          const { attributeRebooking } = await import('@/lib/campaigns')
          await attributeRebooking(
            supabase as unknown as Parameters<typeof attributeRebooking>[0],
            { clientId: a.client_id, businessId: a.business_id },
          )
          results.push(`campaign_rebooked_auto:${a.client_id}`)
        }
      } catch {}
    }
  } catch (e: unknown) {
    debug.campaign_rebooked_error = (
      e instanceof Error ? (e.message ?? String(e)) : String(e)
    ).slice(0, 300)
  }
}

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
  const authHeader: string = req.headers.get('authorization') ?? ''
  const secret: string | null = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!secret || secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const now: Date = new Date()
  const results: string[] = []
  const debug: Record<string, unknown> = { now: now.toISOString() }
  await processReminderWindow(
    supabase,
    now,
    debug,
    results,
    23 * 3600_000,
    25 * 3600_000,
    'reminder_24h',
    false,
  )
  await processReminderWindow(
    supabase,
    now,
    debug,
    results,
    45 * 60_000,
    75 * 60_000,
    'reminder_1h',
    true,
  )
  await handleThankYouBatch(supabase, now, debug, results)
  await handleReactivationBatch(supabase, now, debug, results)
  await handleBirthdayBatch(supabase, now, results)
  await handleWaitlistBatch(supabase, now, debug, results)
  await handleHolidayBatch(supabase, now, debug, results)
  await handleCrmBatch(supabase, now, debug, results)
  await handleCampaignRebookedBatch(supabase, now, debug, results)
  return NextResponse.json({ ok: true, sent: results.length, results, debug })
}
