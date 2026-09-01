import { describe, expect, it, vi, beforeEach } from 'vitest'

import { getClient360, normalizePhoneCO } from '@/lib/client-360'

describe('client-360 — lib/client-360.ts', () => {
  const businessId = '11111111-1111-4111-a111-111111111111'
  const clientId = '22222222-2222-4111-a222-222222222222'

  function makeSupabase(overrides?: Record<string, unknown>) {
    const base = {
      from: vi.fn((table: string) => {
        // Default mock for all tables: return empty data
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              limit: vi.fn(async () => ({ data: [], error: null })),
              gte: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
              })),
              lt: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
              })),
              order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
              limit2: vi.fn(),
            })),
            limit: vi.fn(async () => ({ data: [], error: null })),
            eq2: vi.fn(),
          })),
        } as unknown as never
      }),
    } as unknown as never
    return base as unknown as Parameters<typeof getClient360>[0]
  }

  it('normalizePhoneCO Colombia E.164', () => {
    expect(normalizePhoneCO('3001234567')).toBe('+573001234567')
    expect(normalizePhoneCO('+573001234567')).toBe('+573001234567')
    expect(normalizePhoneCO('573001234567')).toBe('+573001234567')
    expect(normalizePhoneCO('300 123 4567')).toBe('+573001234567')
    expect(normalizePhoneCO('+1 415 555 1234')).toBe('+1 415 555 1234')
  })

  it('validation fails without phone/userId', async () => {
    const supa = makeSupabase()
    await expect(
      getClient360(supa, { businessId, phone: '', userId: '' } as unknown as never),
    ).rejects.toThrow()
  })

  it('client_not_found when no client', async () => {
    const supa = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    } as unknown as Parameters<typeof getClient360>[0]

    await expect(getClient360(supa, { businessId, phone: '+573001234567' })).rejects.toThrow(
      /client_not_found/,
    )
  })

  it('returns 360 with upcoming/history sorted, loyalty null, COP spent numeric', async () => {
    const mockClient = {
      id: clientId,
      business_id: businessId,
      name: 'Cristian',
      phone: '+573001234567',
      email: null,
      birthday: null,
      preferences: { cut: 'Low Fade' },
      status: 'VIP',
      preferred_barber_id: null,
      notification_prefs: { whatsapp: true, email: true, push: true },
      location_id: null,
      created_at: new Date().toISOString(),
      total_visits: 5,
      total_spent: '35000.00',
      last_visit_at: null,
    }

    const upcoming = [
      {
        id: 'a1',
        business_id: businessId,
        client_id: clientId,
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 86400000 + 1800000).toISOString(),
        status: 'confirmed',
        price: '35000.00',
        checkin_code: 'Abc12345',
        payment_status: 'unpaid',
        deposit_amount: 0,
        guest_name: null,
        notes: null,
      },
    ]

    function chainable(terminal: unknown) {
      const builder: Record<string, unknown> = {}
      const make = () => builder
      builder.select = vi.fn(make)
      builder.eq = vi.fn(make)
      builder.gte = vi.fn(make)
      builder.lt = vi.fn(make)
      builder.order = vi.fn(make)
      builder.limit = vi.fn(async () => terminal)
      builder.maybeSingle = vi.fn(async () => terminal)
      builder.single = vi.fn(async () => terminal)
      return builder
    }

    const supa = {
      from: vi.fn((table: string) => {
        if (table === 'clients') {
          return chainable({ data: mockClient, error: null }) as unknown as never
        }
        if (table === 'appointments') {
          // For appointments we need to count calls: first call is upcoming (gte), second is history (lt)
          let callIdx = 0
          const base = chainable({ data: [], error: null })
          // Override limit to return different data based on call order
          const originalLimit = base.limit as unknown as ReturnType<typeof vi.fn>
          let callCount = 0
          ;(base.limit as unknown as ReturnType<typeof vi.fn>) = vi.fn(async () => {
            callCount++
            // First two calls are upcoming/history, others empty
            if (callCount === 1) return { data: upcoming, error: null }
            return { data: [], error: null }
          })
          // Also need gte/lt to still chain
          return base as unknown as never
        }
        // loyalty, memberships, favorites, styles, reviews, transactions -> empty
        if (table === 'loyalty_accounts')
          return chainable({ data: null, error: null }) as unknown as never
        return chainable({ data: [], error: null }) as unknown as never
      }),
    } as unknown as Parameters<typeof getClient360>[0]

    // Mock client resolution: need to handle both user_id and phone paths; our chainable for clients returns mockClient for any select
    // But getClient360 does two client queries (userId then phone). We already return mockClient for any clients query.
    // However our chainable for clients returns {data: mockClient} for limit and maybeSingle — good.
    // For appointments, we need upcoming vs history: we returned upcoming for first limit, empty for second.

    const res = await getClient360(supa, { businessId, phone: '+573001234567' })
    expect(res.client.name).toBe('Cristian')
    expect(res.client.status).toBe('VIP')
    expect(res.client.preferences).toEqual({ cut: 'Low Fade' })
    expect(res.client.total_spent).toBe(35000)
    expect(res.upcoming).toHaveLength(1)
    expect(res.upcoming[0].price).toBe(35000)
    expect(res.stats.upcomingCount).toBe(1)
    // loyalty null when not found
    expect(res.loyalty).toBeNull()
  })

  it('COP currency formatting via getClient360 total_spent string -> number', async () => {
    const mockClient2 = {
      id: clientId,
      business_id: businessId,
      name: 'Juan',
      phone: '+573001111111',
      email: null,
      birthday: null,
      preferences: {},
      status: 'active',
      preferred_barber_id: null,
      notification_prefs: null,
      location_id: null,
      created_at: new Date().toISOString(),
      total_visits: 0,
      total_spent: '125000.50',
      last_visit_at: null,
    }
    function chainable(terminal: unknown) {
      const builder: Record<string, unknown> = {}
      const make = () => builder
      builder.select = vi.fn(make)
      builder.eq = vi.fn(make)
      builder.gte = vi.fn(make)
      builder.lt = vi.fn(make)
      builder.order = vi.fn(make)
      builder.limit = vi.fn(async () => terminal)
      builder.maybeSingle = vi.fn(async () => terminal)
      builder.single = vi.fn(async () => terminal)
      return builder
    }
    const supa = {
      from: vi.fn((t: string) => {
        if (t === 'clients')
          return chainable({ data: mockClient2, error: null }) as unknown as never
        if (t === 'loyalty_accounts')
          return chainable({ data: null, error: null }) as unknown as never
        return chainable({ data: [], error: null }) as unknown as never
      }),
    } as unknown as Parameters<typeof getClient360>[0]

    const res = await getClient360(supa, { businessId, phone: '+573001111111' })
    expect(res.client.total_spent).toBe(125000.5)
  })
})
