import { describe, it, expect, vi } from 'vitest'

import 'fake-indexeddb/auto'
import { computeEffectiveHours, checkSlotWithinHours } from '@/lib/booking-availability'
import { calcCommission } from '@/lib/commission'
import { buildGCalUrl, buildGCalUrlFromISO } from '@/lib/gcal'
import { sanitizeBusinessName, getFromAddress } from '@/lib/mailer'
import { isModuleEnabled } from '@/lib/modules'
import {
  queueTransaction,
  getPendingTransactions,
  cacheData,
  getCachedData,
  getPendingCount,
} from '@/lib/offline-db'
import { checkClientLimit } from '@/lib/plan-limits'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { getSupabaseUrl, getDatabaseUrl } from '@/lib/supabase/getUrl'
import * as telegram from '@/lib/telegram'
import {
  cn,
  formatDate,
  formatTime,
  uses12HourClock,
  formatInBusinessTimezone,
  slugify,
  getTenantSlug,
} from '@/lib/utils'
import * as viber from '@/lib/viber'
import * as whatsapp from '@/lib/whatsapp'

describe('comprehensive exhaustive', () => {
  it('rateLimit exhaustive', () => {
    const k = `a-${Math.random()}`
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(true)
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(false)
    expect(
      getIp(new Request('http://test', { headers: { 'x-forwarded-for': '1.1.1.1,2.2.2.2' } })),
    ).toBe('1.1.1.1')
    expect(getIp(new Request('http://test'))).toBe('unknown')
    expect(rateLimit('', { limit: 0, windowMs: 1000 })).toBe(false)
    expect(rateLimit(`b-${Math.random()}`, { limit: 1, windowMs: -1000 })).toBe(true)
  })
  it('gcal exhaustive', () => {
    expect(
      buildGCalUrl({
        businessName: 'B',
        serviceName: 'S',
        date: '2026-01-31',
        time: '23:00',
        durationMin: 120,
      }),
    ).toContain('20260201')
    expect(
      buildGCalUrl({
        businessName: 'B',
        serviceName: 'S',
        date: '2026-12-31',
        time: '23:30',
        durationMin: 60,
      }),
    ).toContain('20270101')
    expect(
      buildGCalUrl({
        businessName: 'B',
        serviceName: 'S',
        date: '2024-02-28',
        time: '23:00',
        durationMin: 120,
      }),
    ).toContain('20240229')
    expect(
      buildGCalUrl({ businessName: 'B', serviceName: 'S', date: '', time: '', durationMin: NaN }),
    ).toContain('calendar.google.com')
    expect(
      buildGCalUrlFromISO({
        businessName: 'B',
        serviceName: 'S',
        startsAt: 'invalid',
        durationMin: 30,
        timezone: 'UTC',
      }),
    ).toContain('19700101')
    expect(
      buildGCalUrlFromISO({
        businessName: 'B',
        serviceName: 'S',
        startsAt: '2026-01-15T14:00:00Z',
        durationMin: NaN,
        timezone: 'Invalid/Zone',
      }),
    ).toContain('19700101')
  })
  it('utils exhaustive', () => {
    expect(slugify('Hello World')).toBe('hello-world')
    expect(slugify(' ')).toBe('')
    expect(slugify('café ñoño')).toBe('caf-oo')
    expect(slugify('a'.repeat(500))).toBe('a'.repeat(500))
    expect(getTenantSlug('a.trypronto.app')).toBe('a')
    expect(getTenantSlug('localhost:3000')).toBe(null)
    expect(getTenantSlug('a.b.trypronto.app')).toBe(null)
    expect(getTenantSlug('')).toBe(null)
    expect(formatDate('invalid')).toBe('Invalid Date')
    expect(formatDate('2026-01-15T12:00:00Z')).not.toBe('Invalid Date')
    expect(formatTime('invalid')).toBe('Invalid Date')
    expect(uses12HourClock('invalid-xxx')).toBe(false)
    expect(formatInBusinessTimezone('invalid', 'UTC')).toBe('Invalid Date')
    expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'Invalid/Zone')).toBe('Invalid Date')
    expect(cn('a', 'b')).toContain('a')
    expect(cn('text-red-500', 'text-blue-500')).not.toContain('text-red-500')
  })
  it('modules exhaustive', () => {
    expect(isModuleEnabled(['pos'], 'pos')).toBe(true)
    expect(isModuleEnabled(null as any, 'pos')).toBe(false)
    expect(isModuleEnabled([], 'pos')).toBe(false)
    expect(isModuleEnabled(['pos'], null as any)).toBe(false)
    expect(isModuleEnabled(['POS'], 'pos')).toBe(false)
  })
  it('supabase getUrl', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.IS_DOCKER = 'true'
    expect(getSupabaseUrl()).toContain('host.docker.internal')
    delete process.env.IS_DOCKER
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    process.env.MIGRATE_SSL = 'false'
    expect(getDatabaseUrl()).toContain('host.docker.internal')
    delete process.env.MIGRATE_SSL
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    expect(getSupabaseUrl()).toBe('')
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  })
  it('plan-limits', async () => {
    expect((await checkClientLimit(null, 'biz', 'self')).allowed).toBe(true)
    expect((await checkClientLimit(null, null as any, 'self')).allowed).toBe(true)
  })
  it('offline-db exhaustive', async () => {
    const tx = await queueTransaction({
      business_id: 'biz',
      client_id: null,
      employee_id: null,
      amount: 10,
      payment_method: 'cash',
      items: [],
    })
    expect(tx.id).toBeTruthy()
    const cnt = await getPendingCount()
    expect(typeof cnt).toBe('number')
    await cacheData('services_cache', [
      { id: 's1', name: 'C', price: 10, duration_min: 30, category: null },
    ])
    expect((await getCachedData('services_cache')).length).toBeGreaterThan(0)
    await expect(cacheData('services_cache', [])).resolves.toBeUndefined()
    const orig = globalThis.indexedDB
    ;(globalThis as any).indexedDB = undefined
    expect(await getCachedData('services_cache')).toEqual([])
    globalThis.indexedDB = orig
    const origCrypto = (globalThis.crypto as any)?.randomUUID
    if (globalThis.crypto) (globalThis.crypto as any).randomUUID = undefined
    const tx2 = await queueTransaction({
      business_id: 'biz',
      client_id: null,
      employee_id: null,
      amount: 1,
      payment_method: 'cash',
      items: [],
    })
    expect(tx2.id).toMatch(/fallback-/)
    if (origCrypto) (globalThis.crypto as any).randomUUID = origCrypto
    const orig2 = globalThis.indexedDB
    ;(globalThis as any).indexedDB = undefined
    await expect(
      queueTransaction({
        business_id: 'b',
        client_id: null,
        employee_id: null,
        amount: 1,
        payment_method: 'cash',
        items: [],
      }),
    ).rejects.toThrow('IndexedDB not available')
    globalThis.indexedDB = orig2
  })
  it('commission', () => {
    expect(calcCommission(100, 10, null).amount).toBe(10)
    expect(calcCommission(100, null, 5).amount).toBe(5)
    expect(calcCommission(100, null, null).amount).toBe(0)
    expect(calcCommission(100, 0, 0).amount).toBe(0)
  })
  it('booking-availability', () => {
    const h = computeEffectiveHours([])
    expect(h.length).toBe(7)
    expect(
      checkSlotWithinHours(
        { day_of_week: 1, is_open: false, open_time: '09:00', close_time: '20:00' },
        '10:00',
        30,
      ).ok,
    ).toBe(false)
    expect(
      checkSlotWithinHours(
        {
          day_of_week: 1,
          is_open: true,
          open_time: '09:00',
          close_time: '20:00',
          break_start: '12:00',
          break_end: '13:00',
        },
        '12:30',
        30,
      ).ok,
    ).toBe(false)
    expect(checkSlotWithinHours(undefined, '10:00', 30).ok).toBe(false)
  })
  it('mailer', async () => {
    expect(sanitizeBusinessName('<b>John</b>')).toBe('John')
    expect(sanitizeBusinessName('a\nb')).toBe('ab')
    expect(getFromAddress('Test')).toContain('Test')
    expect(getFromAddress('   ')).toBe('Pronto <noreply@trypronto.app>')
    expect(getFromAddress()).toBe('Pronto <noreply@trypronto.app>')
    delete process.env.SMTP_HOST
    delete process.env.RESEND_API_KEY
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.id).toBe('dev-console-fallback')
  })
  it('telegram/whatsapp/viber', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 0 }) } as any)
    global.fetch = mockFetch as any
    expect(await telegram.sendTelegramMessage('tok', 'chat', 'hi')).toBe(true)
    expect(
      telegram.tplNewBooking({ clientName: '<script>', serviceName: 'S', date: 'd', time: 't' }),
    ).not.toContain('<script>')
    expect(
      telegram.tplLowStock({ itemName: '<b>', quantity: 1, unit: 'pcs', threshold: 5 }),
    ).toContain('&lt;b&gt;')
    expect(telegram.tplThankYou({ clientName: '<b>', serviceName: '<i>' })).toContain('&lt;b&gt;')
    expect(
      await whatsapp.sendWhatsAppMessage('123', 'hi', { phoneNumberId: 'id', accessToken: 'tok' }),
    ).toBe(true)
    expect(
      whatsapp.tplBookingConfirmation({
        clientName: 'A',
        serviceName: 'S',
        date: 'd',
        time: 't',
        businessName: 'B',
      }),
    ).toContain('Booking confirmed')
    expect(await viber.sendViberMessage('tok', 'user', 'hi')).toBe(true)
    expect(
      viber.tplNewBooking({ clientName: 'A', serviceName: 'S', date: 'd', time: 't' }),
    ).toContain('New booking')
  })
})
