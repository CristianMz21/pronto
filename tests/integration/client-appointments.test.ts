import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => true), getIp: vi.fn(() => '1.1.1.1') }))
vi.mock('@/lib/waitlist', () => ({ notifyNext: vi.fn(async () => null) }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (s: string) => s.replace(/<[^>]*>/g, '') },
}))

import { PATCH as ClientPATCH, PUT as ClientPUT } from '@/app/api/client/appointments/[id]/route'

function makeChain(result: unknown) {
  const c: Record<string, unknown> = {}
  const p = Promise.resolve(result as { data: unknown; error: unknown })
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

describe('integration — PATCH cancel libera slot + PUT reprogram slot_taken 409 (client)', () => {
  const businessId = '11111111-1111-4111-a111-111111111111'
  const apptId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  const clientId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
  const userId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
  const employeeId = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'
  const serviceId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'

  const allOpenHours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    day_of_week: d,
    is_open: d !== 0,
    open_time: '09:00',
    close_time: '20:00',
    break_start: null,
    break_end: null,
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  async function mockAuth() {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
  }

  function futureIso(hoursAhead: number) {
    return new Date(Date.now() + hoursAhead * 3600000).toISOString()
  }

  it('PATCH cancel libera slot — fuera de 2h sin cargo y dispara waitlist.notifyNext', async () => {
    await mockAuth()
    const starts = futureIso(3) // 3h ahead => not too_soon for cancel_lead 120
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      starts_at: starts,
      ends_at: new Date(new Date(starts).getTime() + 45 * 60_000).toISOString(),
      status: 'confirmed',
      business_id: businessId,
      service_id: serviceId,
      location_id: null,
      employee_id: employeeId,
    }
    const mockClient = { id: clientId, user_id: userId }

    const { createServiceClient } = await import('@/lib/supabase/service')
    const { notifyNext } = await import('@/lib/waitlist')

    const supa = {
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockAppt, error: null })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          } as unknown as never
        }
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'businesses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    timezone: 'UTC',
                    min_advance_minutes: 30,
                    booking_lead_time_enabled: true,
                    cancel_lead_time: 120,
                  },
                  error: null,
                })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'business_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            })),
          } as unknown as never
        }
        return makeChain({ data: null, error: null })
      }),
    } as unknown as ReturnType<typeof createServiceClient>
    vi.mocked(createServiceClient).mockReturnValue(supa as unknown as never)

    const req = new NextRequest(`http://localhost/api/client/appointments/${apptId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel' }),
    })
    const res = await ClientPATCH(
      req as unknown as never,
      { params: Promise.resolve({ id: apptId }) } as never,
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; cancelled_late: boolean; charge: number }
    expect(j.ok).toBe(true)
    expect(j.cancelled_late).toBe(false)
    expect(j.charge).toBe(0)
    // waitlist.notifyNext disparado al liberar slot
    expect(vi.mocked(notifyNext)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ business_id: businessId }),
    )
  })

  it('PATCH cancel dentro de 2h => cancelled_late true con cargo $10k', async () => {
    await mockAuth()
    const starts = futureIso(1) // 1h ahead => too_soon
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      starts_at: starts,
      ends_at: new Date(new Date(starts).getTime() + 45 * 60_000).toISOString(),
      status: 'confirmed',
      business_id: businessId,
      service_id: serviceId,
      location_id: null,
      employee_id: employeeId,
    }
    const mockClient = { id: clientId, user_id: userId }
    const { createServiceClient } = await import('@/lib/supabase/service')
    const supa = {
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockAppt, error: null })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          } as unknown as never
        }
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'businesses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    timezone: 'UTC',
                    min_advance_minutes: 30,
                    booking_lead_time_enabled: true,
                    cancel_lead_time: 120,
                  },
                  error: null,
                })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'business_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            })),
          } as unknown as never
        }
        return makeChain({ data: null, error: null })
      }),
    } as unknown as ReturnType<typeof createServiceClient>
    vi.mocked(createServiceClient).mockReturnValue(supa as unknown as never)

    const req = new NextRequest(`http://localhost/api/client/appointments/${apptId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel' }),
    })
    const res = await ClientPATCH(
      req as unknown as never,
      { params: Promise.resolve({ id: apptId }) } as never,
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { cancelled_late: boolean; charge: number }
    expect(j.cancelled_late).toBe(true)
    expect(j.charge).toBe(10000)
  })

  it('PATCH cancel en cita pasada => 400 in_past', async () => {
    await mockAuth()
    const starts = new Date(Date.now() - 3600000).toISOString() // 1h ago
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      starts_at: starts,
      ends_at: starts,
      status: 'confirmed',
      business_id: businessId,
      service_id: serviceId,
      location_id: null,
      employee_id: employeeId,
    }
    const mockClient = { id: clientId, user_id: userId }
    const { createServiceClient } = await import('@/lib/supabase/service')
    const supa = {
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockAppt, error: null })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          } as unknown as never
        }
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        return makeChain({ data: null, error: null })
      }),
    } as unknown as ReturnType<typeof createServiceClient>
    vi.mocked(createServiceClient).mockReturnValue(supa as unknown as never)

    const req = new NextRequest(`http://localhost/api/client/appointments/${apptId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel' }),
    })
    const res = await ClientPATCH(
      req as unknown as never,
      { params: Promise.resolve({ id: apptId }) } as never,
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('in_past')
  })

  it('PUT reprogram a slot libre => 200 (slot liberado puede reprogramar)', async () => {
    await mockAuth()
    // appointment existing tomorrow, reprogram to day after tomorrow 10:00
    const existingStarts = futureIso(24) // tomorrow
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      starts_at: existingStarts,
      status: 'confirmed',
      business_id: businessId,
      service_id: serviceId,
      location_id: null,
      employee_id: employeeId,
      services: { duration_min: 45 },
    }
    const mockClient = { id: clientId, user_id: userId }
    // target slot: 2 days ahead, 10:00 UTC, monday-like -> ensure not break
    const targetDate = new Date(Date.now() + 2 * 86400000)
    // avoid sunday (0) -> if sunday, shift to monday
    if (targetDate.getUTCDay() === 0) targetDate.setDate(targetDate.getDate() + 1)
    const dateStr = targetDate.toISOString().slice(0, 10)
    const timeStr = '10:00'

    const { createServiceClient } = await import('@/lib/supabase/service')
    const supa = {
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockAppt, error: null })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          } as unknown as never
        }
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'businesses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    timezone: 'UTC',
                    min_advance_minutes: 30,
                    booking_lead_time_enabled: true,
                    cancel_lead_time: 120,
                  },
                  error: null,
                })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'business_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            })),
          } as unknown as never
        }
        if (table === 'business_hours') {
          return makeChain({ data: allOpenHours, error: null })
        }
        if (table === 'holidays') {
          return makeChain({ data: [], error: null })
        }
        return makeChain({ data: null, error: null })
      }),
    } as unknown as ReturnType<typeof createServiceClient>
    vi.mocked(createServiceClient).mockReturnValue(supa as unknown as never)

    const req = new NextRequest(`http://localhost/api/client/appointments/${apptId}`, {
      method: 'PUT',
      body: JSON.stringify({ date: dateStr, time: timeStr }),
    })
    const res = await ClientPUT(
      req as unknown as never,
      { params: Promise.resolve({ id: apptId }) } as never,
    )
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean }
    expect(j.ok).toBe(true)
  })

  it('PUT reprogram conflict => 409 slot_taken (slot ya ocupado)', async () => {
    await mockAuth()
    const existingStarts = futureIso(24)
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      starts_at: existingStarts,
      status: 'confirmed',
      business_id: businessId,
      service_id: serviceId,
      location_id: null,
      employee_id: employeeId,
      services: { duration_min: 45 },
    }
    const mockClient = { id: clientId, user_id: userId }
    const targetDate = new Date(Date.now() + 2 * 86400000)
    if (targetDate.getUTCDay() === 0) targetDate.setDate(targetDate.getDate() + 1)
    const dateStr = targetDate.toISOString().slice(0, 10)
    const timeStr = '10:00'

    const { createServiceClient } = await import('@/lib/supabase/service')
    const supa = {
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockAppt, error: null })),
              })),
            })),
            // second call update returns slot_already_booked error
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: { message: 'slot_already_booked' } })),
            })),
          } as unknown as never
        }
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'businesses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    timezone: 'UTC',
                    min_advance_minutes: 30,
                    booking_lead_time_enabled: true,
                    cancel_lead_time: 120,
                  },
                  error: null,
                })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'business_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            })),
          } as unknown as never
        }
        if (table === 'business_hours') return makeChain({ data: allOpenHours, error: null })
        if (table === 'holidays') return makeChain({ data: [], error: null })
        return makeChain({ data: null, error: null })
      }),
    } as unknown as ReturnType<typeof createServiceClient>
    vi.mocked(createServiceClient).mockReturnValue(supa as unknown as never)

    const req = new NextRequest(`http://localhost/api/client/appointments/${apptId}`, {
      method: 'PUT',
      body: JSON.stringify({ date: dateStr, time: timeStr }),
    })
    const res = await ClientPUT(
      req as unknown as never,
      { params: Promise.resolve({ id: apptId }) } as never,
    )
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('slot_taken')
  })

  it('PUT reprogram break => 400 outside_availability break (lib/booking-availability)', async () => {
    await mockAuth()
    const existingStarts = futureIso(24)
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      starts_at: existingStarts,
      status: 'confirmed',
      business_id: businessId,
      service_id: serviceId,
      location_id: null,
      employee_id: employeeId,
      services: { duration_min: 45 },
    }
    const mockClient = { id: clientId, user_id: userId }
    // use break hours: 13:00-14:00
    const breakHours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      is_open: d !== 0,
      open_time: '09:00',
      close_time: '20:00',
      break_start: '13:00',
      break_end: '14:00',
    }))
    // target tomorrow but at break time 13:30
    const targetDate = new Date(Date.now() + 2 * 86400000)
    if (targetDate.getUTCDay() === 0) targetDate.setDate(targetDate.getDate() + 1)
    const dateStr = targetDate.toISOString().slice(0, 10)

    const { createServiceClient } = await import('@/lib/supabase/service')
    const supa = {
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockAppt, error: null })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          } as unknown as never
        }
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'businesses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    timezone: 'UTC',
                    min_advance_minutes: 30,
                    booking_lead_time_enabled: true,
                    cancel_lead_time: 120,
                  },
                  error: null,
                })),
              })),
            })),
          } as unknown as never
        }
        if (table === 'business_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            })),
          } as unknown as never
        }
        if (table === 'business_hours') return makeChain({ data: breakHours, error: null })
        if (table === 'holidays') return makeChain({ data: [], error: null })
        return makeChain({ data: null, error: null })
      }),
    } as unknown as ReturnType<typeof createServiceClient>
    vi.mocked(createServiceClient).mockReturnValue(supa as unknown as never)

    const req = new NextRequest(`http://localhost/api/client/appointments/${apptId}`, {
      method: 'PUT',
      body: JSON.stringify({ date: dateStr, time: '13:30' }),
    })
    const res = await ClientPUT(
      req as unknown as never,
      { params: Promise.resolve({ id: apptId }) } as never,
    )
    expect(res.status).toBe(400)
    const j = (await res.json()) as { error: string; reason: string }
    expect(j.error).toBe('outside_availability')
    expect(j.reason).toBe('break')
  })
})
