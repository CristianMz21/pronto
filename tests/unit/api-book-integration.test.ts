import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), getIp: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (s: string) => s.replace(/<[^>]*>/g, '').trim() },
}))

import { POST } from '@/app/api/book/route'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'

const BIZ_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const SVC_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  if ((p as any).finally) c.finally = (p as any).finally.bind(p)
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'or',
    'in',
    'single',
    'maybeSingle',
    'order',
    'limit',
    'range',
    'ilike',
    'gte',
    'lte',
    'gt',
    'lt',
  ]
  methods.forEach((m) => {
    c[m] = vi.fn((..._a: any[]) => c)
  })
  return c
}

type BookMockOpts = {
  service?: any | null
  biz?: any | null
  businessHours?: any[] | null
  clientsMatches?: any[] | null
  clientInsert?: { data: any; error: any } | null
  appointment?: { data: any; error: any } | null
}

function setupBook(opts: BookMockOpts = {}) {
  const service =
    opts.service !== undefined ? opts.service : { id: SVC_ID, duration_min: 30, price: 100 }
  const biz =
    opts.biz !== undefined
      ? opts.biz
      : { timezone: 'UTC', min_advance_minutes: 30, booking_lead_time_enabled: true }
  const hours = opts.businessHours !== undefined ? opts.businessHours : []
  const matches = opts.clientsMatches !== undefined ? opts.clientsMatches : []
  const clientInsert =
    opts.clientInsert !== undefined
      ? opts.clientInsert
      : { data: { id: 'client-new' }, error: null }
  const appt =
    opts.appointment !== undefined ? opts.appointment : { data: { id: 'appt-1' }, error: null }

  const serviceChain = makeChain({ data: service, error: null })
  const bizChain = makeChain({ data: biz, error: null })
  const bhChain = makeChain({ data: hours, error: null })
  const clientsSelectChain = makeChain({ data: matches, error: null })
  const clientsInsertChain = makeChain(clientInsert as any)
  const apptChain = makeChain(appt as any)
  const _clientsUpdateChain = makeChain({ data: null, error: null })

  let clientsIdx = 0
  const from = vi.fn((table: string) => {
    if (table === 'services') return serviceChain
    if (table === 'businesses') return bizChain
    if (table === 'business_hours') return bhChain
    if (table === 'clients') {
      const idx = clientsIdx++
      if (idx === 0) return clientsSelectChain
      return clientsInsertChain
    }
    if (table === 'appointments') return apptChain
    return makeChain({ data: null, error: null })
  })
  const mockClient: any = { from }
  mockClient._chains = {
    serviceChain,
    bizChain,
    bhChain,
    clientsSelectChain,
    clientInsertChain: clientsInsertChain,
    apptChain,
  }
  vi.mocked(createServiceClient).mockReturnValue(mockClient)
  return { mockClient, chains: mockClient._chains, from }
}

function req(body: any) {
  return new NextRequest('http://localhost/api/book', {
    method: 'POST',
    headers: { 'x-forwarded-for': '1.1.1.1' } as any,
    body: JSON.stringify(body),
  })
}

function payload(overrides: any = {}) {
  return {
    businessId: BIZ_ID,
    serviceId: SVC_ID,
    date: '2099-06-15',
    time: '10:00',
    name: 'Test User',
    phone: '+123456789',
    email: 'test@example.com',
    ...overrides,
  }
}

describe('api/book integration — configurable lead time (054)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue(true)
    vi.mocked(getIp).mockReturnValue('1.1.1.1')
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '', json: async () => ({}) } as any) as any
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    process.env.INTERNAL_API_SECRET = 'secret'
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('in_past: booking wall time already passed => 400 in_past', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-15T10:00:00.000Z'))
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 30, booking_lead_time_enabled: true },
    })
    const res = await POST(req(payload({ date: '2030-01-15', time: '09:00' })) as any)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('in_past')
  })

  it('too_soon with lead 15: 10 min ahead => too_soon, 15 min ahead => ok', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-15T10:00:00.000Z'))
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    // lead 15
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 15, booking_lead_time_enabled: true },
    })
    const resTooSoon = await POST(req(payload({ date: '2030-01-15', time: '10:10' })) as any)
    expect(resTooSoon.status).toBe(400)
    const jSoon = await resTooSoon.json()
    expect(jSoon.error).toBe('too_soon')
    expect(jSoon.message).toContain('15')

    // exactly 15 should pass
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 15, booking_lead_time_enabled: true },
    })
    const resOk = await POST(req(payload({ date: '2030-01-15', time: '10:15' })) as any)
    expect(resOk.status).toBe(200)
  })

  it('too_soon with lead 60: 30 min ahead => too_soon, 60 min ahead => ok', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-15T10:00:00.000Z'))
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 60, booking_lead_time_enabled: true },
    })
    const resTooSoon = await POST(req(payload({ date: '2030-01-15', time: '10:30' })) as any)
    expect(resTooSoon.status).toBe(400)
    const j60 = await resTooSoon.json()
    expect(j60.error).toBe('too_soon')
    expect(j60.message).toContain('60')

    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 60, booking_lead_time_enabled: true },
    })
    const resOk = await POST(req(payload({ date: '2030-01-15', time: '11:00' })) as any)
    expect(resOk.status).toBe(200)
  })

  it('lead disabled: even 5 min ahead allowed (only past blocked)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-15T10:00:00.000Z'))
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 60, booking_lead_time_enabled: false },
    })
    const res = await POST(req(payload({ date: '2030-01-15', time: '10:05' })) as any)
    expect(res.status).toBe(200)

    // past still blocked even when disabled
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 60, booking_lead_time_enabled: false },
    })
    const resPast = await POST(req(payload({ date: '2030-01-15', time: '09:59' })) as any)
    expect(resPast.status).toBe(400)
    expect((await resPast.json()).error).toBe('in_past')
  })

  it('outside_hours: time before open => 400 outside_availability', async () => {
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({ businessHours: allOpen })
    const res = await POST(req(payload({ date: '2099-06-15', time: '08:00' })) as any)
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.error).toBe('outside_availability')
    expect(j.reason).toBe('outside_hours')
  })

  it('closed: business closed that weekday => 400 closed', async () => {
    const allClosed = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: false,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({ businessHours: allClosed })
    const res = await POST(req(payload({ date: '2099-06-15', time: '10:00' })) as any)
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.error).toBe('outside_availability')
    expect(j.reason).toBe('closed')
  })

  it('break time => 400 break', async () => {
    const withBreak = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: '12:00',
      break_end: '13:00',
    }))
    setupBook({ businessHours: withBreak })
    const res = await POST(req(payload({ date: '2099-06-15', time: '12:30' })) as any)
    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('break')
  })

  it('éxito: valid future booking with custom lead 15 passes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 15, booking_lead_time_enabled: true },
      clientsMatches: [],
    })
    const res = await POST(req(payload({ date: '2099-06-15', time: '10:00' })) as any)
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.appointmentId).toBe('appt-1')
  })

  it('lead 0 with enabled true allows immediate future (only past blocked)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-15T10:00:00.000Z'))
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'UTC', min_advance_minutes: 0, booking_lead_time_enabled: true },
    })
    const res = await POST(req(payload({ date: '2030-01-15', time: '10:01' })) as any)
    expect(res.status).toBe(200)
  })

  it('timezone: Bogota lead 30 respects wall time conversion', async () => {
    // Now 10:00 Bogota = 15:00 UTC. Booking 10:20 Bogota = 15:20 UTC => 20 min lead <30 => too_soon
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-15T15:00:00.000Z')) // 10:00 Bogota
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'America/Bogota', min_advance_minutes: 30, booking_lead_time_enabled: true },
    })
    const resTooSoon = await POST(req(payload({ date: '2030-01-15', time: '10:20' })) as any)
    expect(resTooSoon.status).toBe(400)
    expect((await resTooSoon.json()).error).toBe('too_soon')

    setupBook({
      businessHours: allOpen,
      biz: { timezone: 'America/Bogota', min_advance_minutes: 30, booking_lead_time_enabled: true },
    })
    const resOk = await POST(req(payload({ date: '2030-01-15', time: '10:30' })) as any)
    expect(resOk.status).toBe(200)
  })
})
