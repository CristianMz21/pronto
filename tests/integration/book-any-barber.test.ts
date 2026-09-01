import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (s: string) => s.replace(/<[^>]*>/g, '') },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => true), getIp: vi.fn(() => '1.1.1.1') }))

import { POST as BookPOST } from '@/app/api/book/route'

function makeChain(result: unknown) {
  const c: Record<string, unknown> = {}
  const p = Promise.resolve(result as { data: unknown; error: unknown })
  // thenable
  ;(c as unknown as { then: unknown }).then = p.then.bind(p)
  ;(c as unknown as { catch: unknown }).catch = p.catch.bind(p)
  const methods = [
    'select',
    'insert',
    'update',
    'eq',
    'or',
    'in',
    'maybeSingle',
    'single',
    'limit',
    'order',
    'gt',
    'lt',
    'gte',
    'lte',
  ]
  methods.forEach((m) => {
    ;(c as Record<string, unknown>)[m] = vi.fn(() => c)
  })
  return c as unknown as never
}

describe('book integration — Any barber (employee_id=null) assignment & error distinction [034]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        text: async () => '',
        json: async () => ({}),
      } as unknown as Response) as unknown as typeof fetch
  })

  function valid(overrides: Record<string, unknown> = {}) {
    return {
      businessId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      serviceId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      employeeId: null,
      date: '2099-06-15',
      time: '10:00',
      name: 'Ana Pérez',
      phone: '+573001112233',
      email: '',
      ...overrides,
    }
  }

  it('employee_id=null → accepted and returns 200 assigned (Any barber)', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    const serviceChain = makeChain({
      data: { id: valid().serviceId, duration_min: 30, price: 30000 },
      error: null,
    })
    const bizChain = makeChain({
      data: {
        timezone: 'UTC',
        min_advance_minutes: 30,
        booking_lead_time_enabled: true,
        allow_guest_bookings: true,
      },
      error: null,
    })
    const bhChain = makeChain({ data: allOpen, error: null })
    const clientsChain = makeChain({ data: [], error: null })
    const clientsInsertChain = makeChain({ data: { id: 'client-1' }, error: null } as unknown)
    const apptOk = makeChain({ data: { id: 'appt-any' }, error: null })
    let cIdx = 0
    const from = vi.fn((t: string) => {
      if (t === 'services') return serviceChain
      if (t === 'businesses') return bizChain
      if (t === 'business_hours') return bhChain
      if (t === 'clients') {
        const idx = cIdx++
        if (idx === 0) return clientsChain
        return clientsInsertChain
      }
      if (t === 'appointments') return apptOk
      return makeChain({ data: null, error: null })
    })
    vi.mocked(createServiceClient).mockReturnValue({ from } as unknown as never)
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown as never)

    const req = new NextRequest('http://localhost/api/book', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.1.1.1' } as unknown as Headers,
      body: JSON.stringify(valid({ employeeId: null })),
    })
    const res = await BookPOST(req as unknown as never)
    expect(res.status).toBe(200)
    const j = (await res.json()) as { appointmentId: string }
    expect(j.appointmentId).toBe('appt-any')
  })

  it('distinguishes slot_taken vs no_staff_available (409 different error codes)', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const allOpen = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    const serviceChain = makeChain({
      data: { id: valid().serviceId, duration_min: 30, price: 30000 },
      error: null,
    })
    const bizChain = makeChain({
      data: {
        timezone: 'UTC',
        min_advance_minutes: 30,
        booking_lead_time_enabled: true,
        allow_guest_bookings: true,
      },
      error: null,
    })
    const bhChain = makeChain({ data: allOpen, error: null })
    const clientsChain = makeChain({ data: [], error: null })
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown as never)

    // slot_taken
    const apptTaken = makeChain({
      data: null,
      error: { message: 'slot_already_booked' },
    } as unknown)
    let cIdx = 0
    const fromTaken = vi.fn((t: string) => {
      if (t === 'services') return serviceChain
      if (t === 'businesses') return bizChain
      if (t === 'business_hours') return bhChain
      if (t === 'clients') return clientsChain
      if (t === 'appointments') return apptTaken
      return makeChain({ data: null, error: null })
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromTaken } as unknown as never)
    const r1 = await BookPOST(
      new NextRequest('http://localhost/api/book', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.1.1.1' } as unknown as Headers,
        body: JSON.stringify(valid()),
      }) as unknown as never,
    )
    expect(r1.status).toBe(409)
    expect(((await r1.json()) as { error: string }).error).toBe('slot_taken')

    // no_staff_available
    const apptNoStaff = makeChain({
      data: null,
      error: { message: 'no_staff_available' },
    } as unknown)
    const fromNoStaff = vi.fn((t: string) => {
      if (t === 'services') return serviceChain
      if (t === 'businesses') return bizChain
      if (t === 'business_hours') return bhChain
      if (t === 'clients') return clientsChain
      if (t === 'appointments') return apptNoStaff
      return makeChain({ data: null, error: null })
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromNoStaff } as unknown as never)
    const r2 = await BookPOST(
      new NextRequest('http://localhost/api/book', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.1.1.1' } as unknown as Headers,
        body: JSON.stringify(valid({ employeeId: null })),
      }) as unknown as never,
    )
    expect(r2.status).toBe(409)
    const j2 = (await r2.json()) as { error: string; suggest_waitlist?: boolean }
    expect(j2.error).toBe('no_staff_available')
  })
})
