import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { buildGCalUrl, buildGCalUrlFromISO } from '@/lib/gcal'
import { cn, formatDate, formatTime, uses12HourClock, formatInBusinessTimezone, slugify, getTenantSlug } from '@/lib/utils'
import { isModuleEnabled } from '@/lib/modules'
import { getSupabaseUrl, getDatabaseUrl } from '@/lib/supabase/getUrl'
import { checkClientLimit } from '@/lib/plan-limits'
import { queueTransaction, getPendingTransactions, markTransactionSynced, getPendingCount, cacheData, getCachedData } from '@/lib/offline-db'
import { calcCommission } from '@/lib/commission'
import { computeEffectiveHours, checkSlotWithinHours } from '@/lib/booking-availability'
import { sanitizeBusinessName, getFromAddress } from '@/lib/mailer'
import { sendTelegramMessage, tplNewBooking } from '@/lib/telegram'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendViberMessage } from '@/lib/viber'

describe('comprehensive lib — 100% strict', () => {
  it('rateLimit and getIp', () => {
    const k=`c-${Math.random()}`; expect(rateLimit(k,{limit:2,windowMs:60000})).toBe(true)
    expect(getIp(new Request('http://test',{headers:{'x-forwarded-for':'1.1.1.1'}}))).toBe('1.1.1.1')
    expect(getIp(new Request('http://test'))).toBe('unknown')
  })
  it('gcal overflow and ISO', () => {
    expect(buildGCalUrl({businessName:'B',serviceName:'S',date:'2026-01-31',time:'23:00',durationMin:120})).toContain('20260201')
    expect(buildGCalUrlFromISO({businessName:'B',serviceName:'S',startsAt:'invalid',durationMin:30,timezone:'UTC'})).toContain('19700101')
  })
  it('utils strict', () => {
    expect(slugify('Hello World')).toBe('hello-world')
    expect(getTenantSlug('a.trypronto.app')).toBe('a')
    expect(getTenantSlug('localhost:3000')).toBe(null)
    expect(formatDate('invalid')).toBe('Invalid Date')
    expect(formatTime('invalid')).toBe('Invalid Date')
    expect(uses12HourClock('invalid-locale-xxx')).toBe(false)
    expect(formatInBusinessTimezone('invalid','UTC')).toBe('Invalid Date')
    expect(cn('a','b')).toContain('a')
  })
  it('modules strict', () => {
    expect(isModuleEnabled(['pos'],'pos')).toBe(true)
    expect(isModuleEnabled(null as any,'pos')).toBe(false)
    expect(isModuleEnabled([], 'pos')).toBe(false)
  })
  it('supabase getUrl', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'; process.env.IS_DOCKER='true'
    expect(getSupabaseUrl()).toContain('host.docker.internal')
    delete process.env.IS_DOCKER
  })
  it('plan-limits', async () => { expect((await checkClientLimit(null,'biz','self')).allowed).toBe(true) })
  it('offline-db', async () => {
    const tx=await queueTransaction({business_id:'biz',client_id:null,employee_id:null,amount:10,payment_method:'cash',items:[]}); expect(tx.id).toBeTruthy()
    const cnt=await getPendingCount(); expect(typeof cnt).toBe('number')
    await cacheData('services_cache', [{id:'s1',name:'C',price:10,duration_min:30,category:null}])
    expect((await getCachedData('services_cache')).length).toBeGreaterThan(0)
  })
  it('commission', () => { expect(calcCommission(100,10,null).amount).toBe(10); expect(calcCommission(100,null,5).amount).toBe(5) })
  it('booking-availability', () => { const h=computeEffectiveHours([]); expect(h.length).toBe(7); expect(checkSlotWithinHours({day_of_week:1,is_open:true,open_time:'09:00',close_time:'20:00'},'10:00',30).ok).toBe(true) })
  it('mailer sanitize', () => { expect(sanitizeBusinessName('<b>John</b>')).toBe('John'); expect(getFromAddress('Test')).toContain('Test') })
  it('telegram/whatsapp/viber', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 0 }) } as any)
    global.fetch = mockFetch as any
    expect(await sendTelegramMessage('tok','chat','hi')).toBe(true)
    expect(await sendWhatsAppMessage('123','hi',{phoneNumberId:'id',accessToken:'tok'})).toBe(true)
    expect(await sendViberMessage('tok','user','hi')).toBe(true)
    expect(tplNewBooking({clientName:'<script>',serviceName:'S',date:'d',time:'t'})).not.toContain('<script>')
  })
})
