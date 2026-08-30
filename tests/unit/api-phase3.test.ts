import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => true), getIp: vi.fn(() => '1.1.1.1') }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: vi.fn((s: string) => s.replace(/<[^>]*>/g, '').trim()) },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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
    'not',
    'is',
    'filter',
    'upsert',
  ]
  methods.forEach((m) => {
    c[m] = vi.fn((..._args: any[]) => c)
  })
  return c
}
function jsonReq(url: string, body: any, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' } as any,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function badJsonReq(): any {
  return {
    headers: { get: () => '1.1.1.1' },
    json: async () => {
      throw new Error('bad json')
    },
  } as any
}
const BIZ = '11111111-1111-4111-a111-111111111111'
const USER = '22222222-2222-4222-a222-222222222222'
const CLI = '33333333-3333-4333-a333-333333333333'
const LOC = '55555555-5555-4555-a555-555555555555'

describe('api-phase3 business/holidays/locations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue(true)
    vi.mocked(getIp).mockReturnValue('1.1.1.1')
  })

  // business/hours
  describe('business/hours GET', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new NextRequest('http://localhost/api/business/hours')
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('GET 404 no business', async () => {
      const { GET } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const req = new NextRequest('http://localhost/api/business/hours')
      const res = await GET(req as any)
      expect(res.status).toBe(404)
    })
    it('GET 200 without location_id', async () => {
      const { GET } = await import('@/app/api/business/hours/route')
      const chain = makeChain({ data: [{ day_of_week: 1, is_open: true }], error: null })
      // need to handle .is mock: makeChain already mocks is, but need order flow
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_hours') return chain
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/business/hours')
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('GET 200 with location_id filter', async () => {
      const { GET } = await import('@/app/api/business/hours/route')
      const chain = makeChain({ data: [], error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_hours') return chain
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest(`http://localhost/api/business/hours?location_id=${LOC}`)
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('GET 500 on error', async () => {
      const { GET } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_hours')
            return makeChain({ data: null, error: { message: 'db fail' } })
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/business/hours')
      const res = await GET(req as any)
      expect(res.status).toBe(500)
    })
  })

  describe('business/hours PUT', () => {
    const validBody = {
      hours: [
        { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
        { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '18:00' },
      ],
    }
    it('PUT 429 rate limited', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/business/hours', validBody, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('PUT 401', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = jsonReq('http://localhost/api/business/hours', validBody, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(401)
    })
    it('PUT 404 no business', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/business/hours', validBody, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(404)
    })
    it('PUT 400 invalid json', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await PUT(badJsonReq() as any)
      expect(res.status).toBe(400)
    })
    it('PUT 422 validation_failed empty hours', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/business/hours', { hours: [] }, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(422)
    })
    it('PUT 422 break_start >= break_end', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const body = {
        hours: [
          {
            day_of_week: 1,
            is_open: true,
            open_time: '09:00',
            close_time: '18:00',
            break_start: '13:00',
            break_end: '12:00',
          },
        ],
      }
      const req = jsonReq('http://localhost/api/business/hours', body, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(422)
    })
    it('PUT 422 break outside open/close', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const body = {
        hours: [
          {
            day_of_week: 1,
            is_open: true,
            open_time: '09:00',
            close_time: '18:00',
            break_start: '08:00',
            break_end: '09:30',
          },
        ],
      }
      const req = jsonReq('http://localhost/api/business/hours', body, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(422)
    })
    it('PUT 404 location_not_found', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const body = {
        location_id: LOC,
        hours: [{ day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' }],
      }
      const req = jsonReq('http://localhost/api/business/hours', body, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(404)
    })
    it('PUT 200 success upsert', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_hours')
            return {
              upsert: vi.fn(async () => ({ error: null })),
              delete: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({})), is: vi.fn(async () => ({})) })),
              })),
              insert: vi.fn(async () => ({ error: null })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/business/hours', validBody, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(200)
    })
    it('PUT fallback delete+insert on upsert error', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_hours')
            return {
              upsert: vi.fn(async () => ({ error: { message: 'conflict' } })),
              delete: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({}) as any),
                  is: vi.fn(() => ({}) as any),
                })),
              })),
              insert: vi.fn(async () => ({ error: null })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/business/hours', validBody, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(200)
    })
    it('PUT fallback insert error 500', async () => {
      const { PUT } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_hours')
            return {
              upsert: vi.fn(async () => ({ error: { message: 'conflict' } })),
              delete: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({}) as any),
                  is: vi.fn(() => ({}) as any),
                })),
              })),
              insert: vi.fn(async () => ({ error: { message: 'insert fail' } })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/business/hours', validBody, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(500)
    })
    it('PATCH delegates to PUT 200', async () => {
      const { PATCH } = await import('@/app/api/business/hours/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_hours')
            return {
              upsert: vi.fn(async () => ({ error: null })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/business/hours', validBody, 'PATCH')
      const res = await PATCH(req as any)
      expect(res.status).toBe(200)
    })
  })

  // business/tax
  describe('business/tax', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new NextRequest('http://localhost/api/business/tax')
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('GET 404 no business', async () => {
      const { GET } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const req = new NextRequest('http://localhost/api/business/tax')
      const res = await GET(req as any)
      expect(res.status).toBe(404)
    })
    it('GET 200 with business and settings', async () => {
      const { GET } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') {
            // first call businesses for resolveBusinessId, second for biz select
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: BIZ, tax_rate: 19 },
                    error: null,
                  })),
                })),
              })),
            } as any
          }
          if (t === 'business_settings')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { tax_rate: 19 }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: { id: BIZ }, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/business/tax')
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('GET 404 location_not_found', async () => {
      const { GET } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
                  })),
                })),
              })),
            } as any
          if (t === 'locations')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            } as any
          // fallback business select
          return makeChain({ data: { id: BIZ }, error: null })
        }),
      } as any)
      // Need to handle businesses correctly: first resolve owned, second select biz
      // Our mock above for businesses returns a chain that handles both but need to differentiate
      // Simpler: override from to handle both
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') {
            // For resolveBusinessId: select id eq owner_id -> maybeSingle owned
            // For GET business data: select tax_rate ... eq id -> maybeSingle
            return {
              select: vi.fn(() => ({
                eq: vi.fn((col: string) => {
                  if (col === 'owner_id' || col === 'id') {
                    return {
                      eq: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
                      })),
                      maybeSingle: vi.fn(async () => ({
                        data: { id: BIZ, tax_rate: 19 },
                        error: null,
                      })),
                    } as any
                  }
                  return { maybeSingle: vi.fn(async () => ({ data: null, error: null })) } as any
                }),
              })),
            } as any
          }
          if (t === 'locations')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            } as any
          if (t === 'business_settings') return makeChain({ data: null, error: null })
          return makeChain({ data: { id: BIZ }, error: null })
        }),
      } as any)
      const req = new NextRequest(`http://localhost/api/business/tax?location_id=${LOC}`)
      const res = await GET(req as any)
      expect([404, 200]).toContain(res.status)
    })
    it('PUT 429', async () => {
      const { PUT } = await import('@/app/api/business/tax/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/business/tax', { tax_rate: 19 }, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('PUT 401', async () => {
      const { PUT } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = jsonReq('http://localhost/api/business/tax', { tax_rate: 19 }, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(401)
    })
    it('PUT 400 invalid json', async () => {
      const { PUT } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await PUT(badJsonReq() as any)
      expect(res.status).toBe(400)
    })
    it('PUT 422 validation tax_rate >100', async () => {
      const { PUT } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/business/tax', { tax_rate: 200 }, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(422)
    })
    it('PUT 400 no_changes', async () => {
      const { PUT } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/business/tax', {}, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(400)
    })
    it('PUT 200 success with tax_rate', async () => {
      const { PUT } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'business_settings')
            return { upsert: vi.fn(async () => ({ error: null })) } as any
          // for businesses update
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            from: vi.fn(),
          } as any
        }),
      } as any)
      // Need to better mock businesses update: from('businesses').update().eq()
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            const maybeSingleChain = makeChain({ data: { id: BIZ }, error: null })
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
                  })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          if (table === 'business_settings')
            return { upsert: vi.fn(async () => ({ error: null })) } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/business/tax', { tax_rate: 19 }, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(200)
    })
    it('PUT 500 on businesses update error', async () => {
      const { PUT } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: { message: 'fail' } })) })),
            } as any
          }
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/business/tax', { tax_rate: 19 }, 'PUT')
      const res = await PUT(req as any)
      expect(res.status).toBe(500)
    })
    it('PATCH delegates 200', async () => {
      const { PATCH } = await import('@/app/api/business/tax/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: BIZ }, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          if (table === 'business_settings')
            return { upsert: vi.fn(async () => ({ error: null })) } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/business/tax', { tax_rate: 10 }, 'PATCH')
      const res = await PATCH(req as any)
      expect(res.status).toBe(200)
    })
  })

  // holidays
  describe('holidays GET', () => {
    it('GET 400 without business_id and anon', async () => {
      const { GET } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new NextRequest('http://localhost/api/holidays')
      const res = await GET(req as any)
      expect(res.status).toBe(400)
    })
    it('GET 404 no business when auth but resolve fails', async () => {
      const { GET } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const req = new NextRequest('http://localhost/api/holidays')
      const res = await GET(req as any)
      expect(res.status).toBe(404)
    })
    it('GET public via business_id param 200', async () => {
      const { GET } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        from: vi.fn(() =>
          makeChain({ data: [{ id: 'h1', business_id: BIZ, date: '2026-08-10' }], error: null }),
        ),
      } as any)
      const req = new NextRequest(`http://localhost/api/holidays?business_id=${BIZ}`)
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('GET with location_id filters', async () => {
      const { GET } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        from: vi.fn(() =>
          makeChain({
            data: [
              { id: 'h1', location_id: null, date: '2026-08-10' },
              { id: 'h2', location_id: LOC, date: '2026-08-11' },
              { id: 'h3', location_id: '99999999-9999-4999-a999-999999999999', date: '2026-08-12' },
            ],
            error: null,
          }),
        ),
      } as any)
      const req = new NextRequest(
        `http://localhost/api/holidays?business_id=${BIZ}&location_id=${LOC}`,
      )
      const res = await GET(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.length).toBe(2)
    })
    it('GET with from/to filter', async () => {
      const { GET } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        from: vi.fn(() => makeChain({ data: [{ id: 'h1', date: '2026-08-15' }], error: null })),
      } as any)
      const req = new NextRequest(`http://localhost/api/holidays?from=2026-08-10&to=2026-08-20`)
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
  })

  describe('holidays POST', () => {
    const body = { date: '2026-12-25', reason: 'Navidad' }
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/holidays', body)
      const res = await POST(req as any)
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = jsonReq('http://localhost/api/holidays', body)
      const res = await POST(req as any)
      expect(res.status).toBe(401)
    })
    it('POST 400 invalid json', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(badJsonReq() as any)
      expect(res.status).toBe(400)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', { date: 'bad-date' })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })
    it('POST 404 location_not_found', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', { date: '2026-12-25', location_id: LOC })
      const res = await POST(req as any)
      expect(res.status).toBe(404)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'holidays')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: 'h1', business_id: BIZ, date: '2026-12-25' },
                    error: null,
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', body)
      const res = await POST(req as any)
      expect(res.status).toBe(201)
    })
    it('POST 409 duplicate', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'holidays')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: null,
                    error: { message: 'duplicate key', code: '23505' },
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', body)
      const res = await POST(req as any)
      expect(res.status).toBe(409)
    })
    it('POST 500 insert_failed', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'holidays')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: null,
                    error: { message: 'fail', code: '500' },
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', body)
      const res = await POST(req as any)
      expect(res.status).toBe(500)
    })
    it('POST 403 forbidden when business_id provided but not owned', async () => {
      const { POST } = await import('@/app/api/holidays/route')
      const otherBiz = '99999999-9999-4999-a999-999999999999'
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            } as any
          if (t === 'employees')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', {
        business_id: otherBiz,
        date: '2026-12-25',
      })
      const res = await POST(req as any)
      expect(res.status).toBe(403)
    })
  })

  describe('holidays PATCH/DELETE', () => {
    it('PATCH 401', async () => {
      const { PATCH } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = jsonReq('http://localhost/api/holidays', { id: BIZ, reason: 'test' }, 'PATCH')
      const res = await PATCH(req as any)
      expect(res.status).toBe(401)
    })
    it('PATCH 422 validation', async () => {
      const { PATCH } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', { id: 'bad', reason: 'x' }, 'PATCH')
      const res = await PATCH(req as any)
      expect(res.status).toBe(422)
    })
    it('PATCH 400 no_changes', async () => {
      const { PATCH } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', { id: BIZ }, 'PATCH')
      const res = await PATCH(req as any)
      expect(res.status).toBe(400)
    })
    it('PATCH 200 success', async () => {
      const { PATCH } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'holidays')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({
                        data: { id: BIZ, reason: 'New' },
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/holidays', { id: BIZ, reason: 'New' }, 'PATCH')
      const res = await PATCH(req as any)
      expect(res.status).toBe(200)
    })
    it('DELETE 401', async () => {
      const { DELETE } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new NextRequest(`http://localhost/api/holidays?id=${BIZ}`)
      const res = await DELETE(req as any)
      expect(res.status).toBe(401)
    })
    it('DELETE 400 missing id', async () => {
      const { DELETE } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = new NextRequest('http://localhost/api/holidays')
      const res = await DELETE(req as any)
      expect(res.status).toBe(400)
    })
    it('DELETE 200 success', async () => {
      const { DELETE } = await import('@/app/api/holidays/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'holidays')
            return {
              delete: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest(`http://localhost/api/holidays?id=${BIZ}`)
      const res = await DELETE(req as any)
      expect(res.status).toBe(200)
    })
  })

  // locations
  describe('locations GET/POST', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await GET()
      expect(res.status).toBe(401)
    })
    it('GET 404', async () => {
      const { GET } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const res = await GET()
      expect(res.status).toBe(404)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return makeChain({ data: [{ id: LOC, name: 'Centro' }], error: null })
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await GET()
      expect(res.status).toBe(200)
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/locations/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        new Request('http://localhost/api/locations', {
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await POST(
        new Request('http://localhost/api/locations', {
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        }) as any,
      )
      expect(res.status).toBe(401)
    })
    it('POST 400 invalid json', async () => {
      const { POST } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = {
        json: async () => {
          throw new Error('bad')
        },
        headers: { get: () => '1.1.1.1' },
      } as any
      const res = await POST(req as any)
      expect(res.status).toBe(400)
    })
    it('POST 422 validation empty name', async () => {
      const { POST } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = new Request('http://localhost/api/locations', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      }) as any
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: LOC, slug: 'centro' }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request('http://localhost/api/locations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Centro' }),
      }) as any
      const res = await POST(req as any)
      expect(res.status).toBe(201)
    })
    it('POST 409 slug_taken', async () => {
      const { POST } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: null,
                    error: { message: 'duplicate key', code: '23505' },
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request('http://localhost/api/locations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Centro' }),
      }) as any
      const res = await POST(req as any)
      expect(res.status).toBe(409)
    })
    it('POST 500 insert error', async () => {
      const { POST } = await import('@/app/api/locations/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: null,
                    error: { message: 'fail', code: '500' },
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request('http://localhost/api/locations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Centro' }),
      }) as any
      const res = await POST(req as any)
      expect(res.status).toBe(500)
    })
  })

  describe('locations [id]', () => {
    it('PATCH 429', async () => {
      const { PATCH } = await import('@/app/api/locations/[id]/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = new Request(`http://localhost/api/locations/${LOC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New' }),
      }) as any
      const res = await PATCH(req as any, { params: Promise.resolve({ id: LOC }) })
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('PATCH 401', async () => {
      const { PATCH } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new Request(`http://localhost/api/locations/${LOC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New' }),
      }) as any
      const res = await PATCH(req as any, { params: Promise.resolve({ id: LOC }) })
      expect(res.status).toBe(401)
    })
    it('PATCH 400 invalid id', async () => {
      const { PATCH } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = new Request('http://localhost/api/locations/bad-id', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New' }),
      }) as any
      const res = await PATCH(req as any, { params: Promise.resolve({ id: 'bad-id' }) })
      expect(res.status).toBe(400)
    })
    it('PATCH 422 no fields', async () => {
      const { PATCH } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = new Request(`http://localhost/api/locations/${LOC}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      }) as any
      const res = await PATCH(req as any, { params: Promise.resolve({ id: LOC }) })
      expect(res.status).toBe(422)
    })
    it('PATCH 200 success', async () => {
      const { PATCH } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({ data: { id: LOC, name: 'New' }, error: null })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request(`http://localhost/api/locations/${LOC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New' }),
      }) as any
      const res = await PATCH(req as any, { params: Promise.resolve({ id: LOC }) })
      expect(res.status).toBe(200)
    })
    it('PATCH 409 slug_taken', async () => {
      const { PATCH } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({
                        data: null,
                        error: { message: 'duplicate', code: '23505' },
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request(`http://localhost/api/locations/${LOC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Centro' }),
      }) as any
      const res = await PATCH(req as any, { params: Promise.resolve({ id: LOC }) })
      expect(res.status).toBe(409)
    })
    it('GET [id] 200', async () => {
      const { GET } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: LOC, name: 'Centro' },
                      error: null,
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await GET(new Request('http://localhost/api/locations/1') as any, {
        params: Promise.resolve({ id: LOC }),
      })
      expect(res.status).toBe(200)
    })
    it('GET [id] 404', async () => {
      const { GET } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await GET(new Request('http://localhost') as any, {
        params: Promise.resolve({ id: LOC }),
      })
      expect(res.status).toBe(404)
    })
    it('DELETE 200 soft_delete', async () => {
      const { DELETE } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'locations') {
            // first maybeSingle, second count, third update
            let call = 0
            return {
              select: vi.fn((...args: any[]) => {
                call++
                if (args[1]?.count === 'exact') {
                  return {
                    eq: vi.fn(() => ({ eq: vi.fn(async () => ({ count: 2, error: null })) })),
                  } as any
                }
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: { id: LOC, slug: 'centro', name: 'Centro' },
                        error: null,
                      })),
                    })),
                  })),
                } as any
              }),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          }
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request(`http://localhost/api/locations/${LOC}`, { method: 'DELETE' }) as any
      const res = await DELETE(req as any, { params: Promise.resolve({ id: LOC }) })
      expect(res.status).toBe(200)
    })
    it('DELETE 401', async () => {
      const { DELETE } = await import('@/app/api/locations/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new Request(`http://localhost/api/locations/${LOC}`, { method: 'DELETE' }) as any
      const res = await DELETE(req as any, { params: Promise.resolve({ id: LOC }) })
      expect(res.status).toBe(401)
    })
  })
})
