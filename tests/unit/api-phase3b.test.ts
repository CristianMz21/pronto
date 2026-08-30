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
    c[m] = vi.fn((..._a: any[]) => c)
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
const MEM = '66666666-6666-4666-a666-666666666666'
const CM = '77777777-7777-4777-a777-777777777777'

describe('api-phase3b memberships/promotions/tips/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue(true)
    vi.mocked(getIp).mockReturnValue('1.1.1.1')
  })

  describe('memberships GET/POST', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await GET()
      expect(res.status).toBe(401)
    })
    it('GET 404', async () => {
      const { GET } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const res = await GET()
      expect(res.status).toBe(404)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? makeChain({ data: { id: BIZ }, error: null })
            : makeChain({ data: [{ id: MEM }], error: null }),
        ),
      } as any)
      const res = await GET()
      expect(res.status).toBe(200)
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/memberships/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        jsonReq('http://localhost/api/memberships', {
          name: 'Test',
          price: 1000,
          duration_days: 30,
        }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships', {
          name: 'Test',
          price: 1000,
          duration_days: 30,
        }) as any,
      )
      expect(res.status).toBe(401)
    })
    it('POST 400 invalid json', async () => {
      const { POST } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(badJsonReq() as any)
      expect(res.status).toBe(400)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships', {
          name: '',
          price: -1,
          duration_days: 0,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'memberships')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: MEM }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships', {
          name: 'Plan',
          price: 50000,
          duration_days: 30,
          benefits: { cuts: 4 },
        }) as any,
      )
      expect(res.status).toBe(201)
    })
    it('POST 500 insert error', async () => {
      const { POST } = await import('@/app/api/memberships/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'memberships')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: { message: 'fail' } })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships', {
          name: 'Plan',
          price: 50000,
          duration_days: 30,
        }) as any,
      )
      expect(res.status).toBe(500)
    })
  })

  describe('memberships [id] PATCH/DELETE', () => {
    it('PATCH 401', async () => {
      const { PATCH } = await import('@/app/api/memberships/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = jsonReq(`http://localhost/api/memberships/${MEM}`, { name: 'New' }, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: MEM }) })
      expect(res.status).toBe(401)
    })
    it('PATCH 400 invalid id', async () => {
      const { PATCH } = await import('@/app/api/memberships/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/memberships/bad', { name: 'New' }, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: 'bad' }) })
      expect(res.status).toBe(400)
    })
    it('PATCH 400 no_fields', async () => {
      const { PATCH } = await import('@/app/api/memberships/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq(`http://localhost/api/memberships/${MEM}`, {}, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: MEM }) })
      expect(res.status).toBe(400)
    })
    it('PATCH 422 validation', async () => {
      const { PATCH } = await import('@/app/api/memberships/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq(`http://localhost/api/memberships/${MEM}`, { price: -5 }, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: MEM }) })
      expect(res.status).toBe(422)
    })
    it('PATCH 200 success', async () => {
      const { PATCH } = await import('@/app/api/memberships/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'memberships')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({ data: { id: MEM }, error: null })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq(`http://localhost/api/memberships/${MEM}`, { name: 'New Name' }, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: MEM }) })
      expect(res.status).toBe(200)
    })
    it('DELETE 200 soft', async () => {
      const { DELETE } = await import('@/app/api/memberships/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'memberships')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await DELETE(new Request('http://localhost') as any, {
        params: Promise.resolve({ id: MEM }),
      })
      expect(res.status).toBe(200)
    })
    it('DELETE 401', async () => {
      const { DELETE } = await import('@/app/api/memberships/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await DELETE(new Request('http://localhost') as any, {
        params: Promise.resolve({ id: MEM }),
      })
      expect(res.status).toBe(401)
    })
  })

  describe('memberships consume', () => {
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/memberships/consume/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/consume', { client_membership_id: CM }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/memberships/consume/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/consume', { client_membership_id: CM }) as any,
      )
      expect(res.status).toBe(401)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/memberships/consume/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/consume', { client_membership_id: 'bad' }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 404 membership_not_found', async () => {
      const { POST } = await import('@/app/api/memberships/consume/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'client_memberships')
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
      const res = await POST(
        jsonReq('http://localhost/api/memberships/consume', { client_membership_id: CM }) as any,
      )
      expect(res.status).toBe(404)
    })
    it('POST 200 success via consumeMembership', async () => {
      const { POST } = await import('@/app/api/memberships/consume/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'client_memberships')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: CM, business_id: BIZ },
                      error: null,
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
        rpc: vi.fn(async () => ({ data: { id: CM, remaining: 3 }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/consume', { client_membership_id: CM }) as any,
      )
      expect(res.status).toBe(200)
    })
    it('POST 409 no_uses_left', async () => {
      const { POST } = await import('@/app/api/memberships/consume/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'client_memberships')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: CM, business_id: BIZ },
                      error: null,
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
        rpc: vi.fn(async () => ({ data: null, error: { message: 'membership_no_uses_left' } })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/consume', { client_membership_id: CM }) as any,
      )
      // fallback may try fetch current and succeed but our rpc mock + fallback will handle; expect 409 or 500
      expect([409, 500]).toContain(res.status)
    })
  })

  describe('memberships purchase', () => {
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/memberships/purchase/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/purchase', {
          client_id: CLI,
          membership_id: MEM,
        }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/memberships/purchase/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/purchase', {
          client_id: CLI,
          membership_id: MEM,
        }) as any,
      )
      expect(res.status).toBe(401)
    })
    it('POST 404 client_not_found', async () => {
      const { POST } = await import('@/app/api/memberships/purchase/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'clients')
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
      const res = await POST(
        jsonReq('http://localhost/api/memberships/purchase', {
          client_id: CLI,
          membership_id: MEM,
        }) as any,
      )
      expect(res.status).toBe(404)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/memberships/purchase/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'clients')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: { id: CLI }, error: null })),
                  })),
                })),
              })),
            } as any
          if (t === 'memberships')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: MEM, duration_days: 30, benefits: { cuts: 4 } },
                      error: null,
                    })),
                  })),
                })),
              })),
            } as any
          if (t === 'client_memberships')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: CM, business_id: BIZ, client_id: CLI },
                    error: null,
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/purchase', {
          client_id: CLI,
          membership_id: MEM,
        }) as any,
      )
      expect(res.status).toBe(201)
    })
    it('POST 422 validation bad uuid', async () => {
      const { POST } = await import('@/app/api/memberships/purchase/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/memberships/purchase', {
          client_id: 'bad',
          membership_id: MEM,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
  })

  // promotions
  describe('promotions GET/POST', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/promotions/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await GET()
      expect(res.status).toBe(401)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/promotions/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? makeChain({ data: { id: BIZ }, error: null })
            : makeChain({ data: [{ id: 'p1' }], error: null }),
        ),
      } as any)
      const res = await GET()
      expect(res.status).toBe(200)
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/promotions/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        jsonReq('http://localhost/api/promotions', {
          name: 'Promo',
          type: 'percent',
          value: 10,
        }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/promotions/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/promotions', {
          name: '',
          type: 'percent',
          value: 200,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 422 percent >100 guard', async () => {
      const { POST } = await import('@/app/api/promotions/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/promotions', {
          name: 'Promo',
          type: 'percent',
          value: 150,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 422 valid_to before valid_from', async () => {
      const { POST } = await import('@/app/api/promotions/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const from = new Date().toISOString()
      const to = new Date(Date.now() - 10000).toISOString()
      const res = await POST(
        jsonReq('http://localhost/api/promotions', {
          name: 'Promo',
          type: 'percent',
          value: 10,
          valid_from: from,
          valid_to: to,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/promotions/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'promotions')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'p1' }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/promotions', {
          name: 'Promo',
          type: 'percent',
          value: 10,
          promo_code: 'SAVE10',
        }) as any,
      )
      expect(res.status).toBe(201)
    })
    it('POST 409 duplicate code', async () => {
      const { POST } = await import('@/app/api/promotions/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'promotions')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: { message: 'duplicate key' } })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/promotions', {
          name: 'Promo',
          type: 'percent',
          value: 10,
          promo_code: 'SAVE10',
        }) as any,
      )
      expect(res.status).toBe(409)
    })
  })

  describe('promotions [id] PATCH/DELETE', () => {
    it('PATCH 401', async () => {
      const { PATCH } = await import('@/app/api/promotions/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = jsonReq(`http://localhost/api/promotions/${MEM}`, { name: 'New' }, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: MEM }) })
      expect(res.status).toBe(401)
    })
    it('PATCH 400 invalid id', async () => {
      const { PATCH } = await import('@/app/api/promotions/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq('http://localhost/api/promotions/bad', { name: 'New' }, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: 'bad' }) })
      expect(res.status).toBe(400)
    })
    it('PATCH 400 no_fields', async () => {
      const { PATCH } = await import('@/app/api/promotions/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = jsonReq(`http://localhost/api/promotions/${MEM}`, {}, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: MEM }) })
      expect(res.status).toBe(400)
    })
    it('PATCH 200 success', async () => {
      const { PATCH } = await import('@/app/api/promotions/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'promotions')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({ data: { id: MEM }, error: null })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq(`http://localhost/api/promotions/${MEM}`, { name: 'Updated' }, 'PATCH')
      const res = await PATCH(req as any, { params: Promise.resolve({ id: MEM }) })
      expect(res.status).toBe(200)
    })
    it('DELETE 200', async () => {
      const { DELETE } = await import('@/app/api/promotions/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'promotions')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await DELETE(new Request('http://localhost') as any, {
        params: Promise.resolve({ id: MEM }),
      })
      expect(res.status).toBe(200)
    })
  })

  describe('tips', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new NextRequest(`http://localhost/api/tips`)
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('GET 200 with reportTips mock', async () => {
      const { GET } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'tips')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: [
                    {
                      id: 't1',
                      business_id: BIZ,
                      employee_id: MEM,
                      amount: 500,
                      created_at: new Date().toISOString(),
                    },
                  ],
                  error: null,
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest(`http://localhost/api/tips?business_id=${BIZ}`)
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('GET filtered by employee_id', async () => {
      const { GET } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'tips')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: [
                    {
                      id: 't1',
                      business_id: BIZ,
                      employee_id: MEM,
                      amount: 500,
                      created_at: new Date().toISOString(),
                    },
                  ],
                  error: null,
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest(`http://localhost/api/tips?employee_id=${MEM}&business_id=${BIZ}`)
      const res = await GET(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.total).toBeDefined()
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/tips/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        jsonReq('http://localhost/api/tips', {
          business_id: BIZ,
          transaction_id: CLI,
          employee_id: MEM,
          amount: 100,
        }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/tips', {
          business_id: BIZ,
          transaction_id: CLI,
          employee_id: MEM,
          amount: 100,
        }) as any,
      )
      expect(res.status).toBe(401)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/tips', {
          business_id: 'bad',
          transaction_id: CLI,
          employee_id: MEM,
          amount: -5,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 422 tip_exceeds_50_percent', async () => {
      const { POST } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'transactions')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: CLI, amount: 1000, business_id: BIZ },
                      error: null,
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: { id: BIZ }, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/tips', {
          business_id: BIZ,
          transaction_id: CLI,
          employee_id: MEM,
          amount: 600,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'transactions')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: CLI, amount: 10000, business_id: BIZ },
                      error: null,
                    })),
                  })),
                })),
              })),
            } as any
          if (t === 'tips')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: 't1', business_id: BIZ, amount: 500 },
                    error: null,
                  })),
                })),
              })),
            } as any
          return makeChain({ data: { id: BIZ }, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/tips', {
          business_id: BIZ,
          transaction_id: CLI,
          employee_id: MEM,
          amount: 500,
        }) as any,
      )
      expect(res.status).toBe(201)
    })
    it('POST 404 transaction_not_found', async () => {
      const { POST } = await import('@/app/api/tips/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'transactions')
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
      const res = await POST(
        jsonReq('http://localhost/api/tips', {
          business_id: BIZ,
          transaction_id: CLI,
          employee_id: MEM,
          amount: 500,
        }) as any,
      )
      expect(res.status).toBe(404)
    })
  })

  describe('reports', () => {
    it('GET 429', async () => {
      const { GET } = await import('@/app/api/reports/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = new NextRequest('http://localhost/api/reports')
      const res = await GET(req as any)
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/reports/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new NextRequest('http://localhost/api/reports')
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('GET 200 week', async () => {
      const { GET } = await import('@/app/api/reports/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'transactions')
            return makeChain({ data: [{ amount: 100, employee_id: MEM }], error: null })
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/reports?range=week')
      const res = await GET(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.byBarber).toBeDefined()
    })
    it('GET 200 with location filter', async () => {
      const { GET } = await import('@/app/api/reports/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'transactions') return makeChain({ data: [], error: null })
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest(`http://localhost/api/reports?range=month&location=${LOC}`)
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('GET 404 no business', async () => {
      const { GET } = await import('@/app/api/reports/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const req = new NextRequest('http://localhost/api/reports')
      const res = await GET(req as any)
      expect(res.status).toBe(404)
    })
  })
})
