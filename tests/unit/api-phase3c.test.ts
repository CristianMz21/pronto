import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => true), getIp: vi.fn(() => '1.1.1.1') }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: vi.fn((s: string) => s.replace(/<[^>]*>/g, '').trim()) },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }))

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
const SVC = '44444444-4444-4444-a444-444444444444'
const LOC = '55555555-5555-4555-a555-555555555555'

describe('api-phase3c crm/service-combos/services/apply/cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue(true)
    vi.mocked(getIp).mockReturnValue('1.1.1.1')
  })

  describe('crm segments', () => {
    it('GET 429', async () => {
      const { GET } = await import('@/app/api/crm/segments/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = new NextRequest('http://localhost/api/crm/segments?segment=all')
      const res = await GET(req as any)
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('GET 422 validation', async () => {
      const { GET } = await import('@/app/api/crm/segments/route')
      const req = new NextRequest('http://localhost/api/crm/segments?segment=invalid')
      const res = await GET(req as any)
      expect(res.status).toBe(422)
    })
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/crm/segments/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new NextRequest('http://localhost/api/crm/segments?segment=all')
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('GET 404 no business', async () => {
      const { GET } = await import('@/app/api/crm/segments/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const req = new NextRequest('http://localhost/api/crm/segments?segment=all')
      const res = await GET(req as any)
      expect(res.status).toBe(404)
    })
    it('GET 200 all', async () => {
      const { GET } = await import('@/app/api/crm/segments/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'clients')
            return makeChain({
              data: [
                {
                  id: CLI,
                  name: 'Test',
                  birthday: '2000-01-01',
                  tags: ['vip'],
                  last_visit_at: null,
                  location_id: null,
                },
              ],
              error: null,
            })
          if (t === 'transactions') return makeChain({ data: [], error: null })
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/crm/segments?segment=all')
      const res = await GET(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.segment).toBe('all')
    })
    it('GET 200 with location_id', async () => {
      const { GET } = await import('@/app/api/crm/segments/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'clients') return makeChain({ data: [], error: null })
          if (t === 'transactions') return makeChain({ data: [], error: null })
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest(
        `http://localhost/api/crm/segments?segment=vip&location_id=${LOC}`,
      )
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('GET 200 with transactions enrichment', async () => {
      const { GET } = await import('@/app/api/crm/segments/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'clients')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [
                        {
                          id: CLI,
                          name: 'A',
                          birthday: null,
                          tags: [],
                          last_visit_at: '2026-01-01',
                          location_id: null,
                        },
                      ],
                      error: null,
                    })),
                    eq: vi.fn(() => ({}) as any),
                  })),
                })),
              })),
            } as any
          if (t === 'transactions')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    in: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn(async () => ({
                          data: [{ client_id: CLI, created_at: '2026-08-01T00:00:00Z' }],
                          error: null,
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/crm/segments?segment=all')
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
  })

  describe('service-combos', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/service-combos/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await GET()
      expect(res.status).toBe(401)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/service-combos/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? makeChain({ data: { id: BIZ }, error: null })
            : makeChain({ data: [{ id: 'c1' }], error: null }),
        ),
      } as any)
      const res = await GET()
      expect(res.status).toBe(200)
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/service-combos/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        jsonReq('http://localhost/api/service-combos', {
          name: 'Combo',
          service_ids: [SVC],
          price: 100,
          duration_min: 30,
        }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/service-combos/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/service-combos', {
          name: 'Combo',
          service_ids: [SVC],
          price: 100,
          duration_min: 30,
        }) as any,
      )
      expect(res.status).toBe(401)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/service-combos/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/service-combos', {
          name: '',
          service_ids: [],
          price: -1,
          duration_min: 0,
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 404 service_not_found', async () => {
      const { POST } = await import('@/app/api/service-combos/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'services')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/service-combos', {
          name: 'Combo',
          service_ids: [SVC],
          price: 100,
          duration_min: 30,
        }) as any,
      )
      expect(res.status).toBe(404)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/service-combos/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'services')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({ data: [{ id: SVC }], error: null })),
                })),
              })),
            } as any
          if (t === 'service_combos')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'c1' }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        jsonReq('http://localhost/api/service-combos', {
          name: 'Combo',
          service_ids: [SVC],
          price: 100,
          duration_min: 30,
        }) as any,
      )
      expect(res.status).toBe(201)
    })
    it('POST 400 invalid json', async () => {
      const { POST } = await import('@/app/api/service-combos/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(badJsonReq() as any)
      expect(res.status).toBe(400)
    })
  })

  describe('services GET/POST', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await GET(new Request('http://localhost/api/services') as any)
      expect(res.status).toBe(401)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? makeChain({ data: { id: BIZ }, error: null })
            : makeChain({ data: [{ id: SVC }], error: null }),
        ),
      } as any)
      const res = await GET(new Request('http://localhost/api/services') as any)
      expect(res.status).toBe(200)
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/services/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const res = await POST(
        new Request('http://localhost/api/services', {
          method: 'POST',
          body: JSON.stringify({ name: 'Cut', price: 100 }),
        }) as any,
      )
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const res = await POST(
        new Request('http://localhost/api/services', {
          method: 'POST',
          body: JSON.stringify({ name: 'Cut', price: 100 }),
        }) as any,
      )
      expect(res.status).toBe(401)
    })
    it('POST 400 invalid json', async () => {
      const { POST } = await import('@/app/api/services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(badJsonReq() as any)
      expect(res.status).toBe(400)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const res = await POST(
        new Request('http://localhost/api/services', {
          method: 'POST',
          body: JSON.stringify({ name: '', price: -1 }),
        }) as any,
      )
      expect(res.status).toBe(422)
    })
    it('POST 201 success', async () => {
      const { POST } = await import('@/app/api/services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'services')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: SVC }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const res = await POST(
        new Request('http://localhost/api/services', {
          method: 'POST',
          body: JSON.stringify({ name: 'Cut', price: 5000, duration_min: 30 }),
        }) as any,
      )
      expect(res.status).toBe(201)
    })
    it('POST 500 insert error', async () => {
      const { POST } = await import('@/app/api/services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'services')
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
        new Request('http://localhost/api/services', {
          method: 'POST',
          body: JSON.stringify({ name: 'Cut', price: 5000 }),
        }) as any,
      )
      expect(res.status).toBe(500)
    })
  })

  describe('services [id] PATCH/DELETE', () => {
    it('PATCH 429', async () => {
      const { PATCH } = await import('@/app/api/services/[id]/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = new Request(`http://localhost/api/services/${SVC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New' }),
      }) as any
      const res = await PATCH(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('PATCH 401', async () => {
      const { PATCH } = await import('@/app/api/services/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      } as any)
      const req = new Request(`http://localhost/api/services/${SVC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New' }),
      }) as any
      const res = await PATCH(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(401)
    })
    it('PATCH 404 no business', async () => {
      const { PATCH } = await import('@/app/api/services/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: null, error: null })),
      } as any)
      const req = new Request(`http://localhost/api/services/${SVC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New' }),
      }) as any
      const res = await PATCH(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(404)
    })
    it('PATCH 400 invalid json', async () => {
      const { PATCH } = await import('@/app/api/services/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = badJsonReq() as any
      const res = await PATCH(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(400)
    })
    it('PATCH 422 validation', async () => {
      const { PATCH } = await import('@/app/api/services/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = new Request(`http://localhost/api/services/${SVC}`, {
        method: 'PATCH',
        body: JSON.stringify({ price: -5 }),
      }) as any
      const res = await PATCH(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(422)
    })
    it('PATCH 400 no_updates', async () => {
      const { PATCH } = await import('@/app/api/services/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn(() => makeChain({ data: { id: BIZ }, error: null })),
      } as any)
      const req = new Request(`http://localhost/api/services/${SVC}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      }) as any
      const res = await PATCH(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(400)
    })
    it('PATCH 200 success', async () => {
      const { PATCH } = await import('@/app/api/services/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'services')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({ data: { id: SVC }, error: null })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request(`http://localhost/api/services/${SVC}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Cut' }),
      }) as any
      const res = await PATCH(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(200)
    })
    it('DELETE 200', async () => {
      const { DELETE } = await import('@/app/api/services/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
        from: vi.fn((t: string) => {
          if (t === 'businesses') return makeChain({ data: { id: BIZ }, error: null })
          if (t === 'services')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new Request(`http://localhost/api/services/${SVC}`, { method: 'DELETE' }) as any
      const res = await DELETE(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(200)
    })
    it('DELETE 429', async () => {
      const { DELETE } = await import('@/app/api/services/[id]/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = new Request(`http://localhost/api/services/${SVC}`, { method: 'DELETE' }) as any
      const res = await DELETE(req, { params: Promise.resolve({ id: SVC }) })
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
  })

  describe('apply', () => {
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/apply/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/apply', {
        business_name: 'Test',
        owner_name: 'Owner',
        email: 'a@b.com',
      })
      const res = await POST(req as any)
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 400 invalid json', async () => {
      const { POST } = await import('@/app/api/apply/route')
      const res = await POST(badJsonReq() as any)
      expect(res.status).toBe(400)
    })
    it('POST 422 validation', async () => {
      const { POST } = await import('@/app/api/apply/route')
      const req = jsonReq('http://localhost/api/apply', {
        business_name: '',
        owner_name: '',
        email: 'bad',
      })
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })
    it('POST 400 turnstile_failed when secret set', async () => {
      const { POST } = await import('@/app/api/apply/route')
      const orig = process.env.TURNSTILE_SECRET_KEY
      process.env.TURNSTILE_SECRET_KEY = 'secret'
      const origFetch = global.fetch
      global.fetch = vi.fn(async () => ({ json: async () => ({ success: false }) }) as any)
      const req = jsonReq('http://localhost/api/apply', {
        business_name: 'Barber',
        owner_name: 'Owner',
        email: 'a@test.com',
      })
      const res = await POST(req as any)
      expect(res.status).toBe(400)
      const j = await res.json()
      expect(j.error).toBe('turnstile_failed')
      global.fetch = origFetch
      if (orig) process.env.TURNSTILE_SECRET_KEY = orig
      else delete process.env.TURNSTILE_SECRET_KEY
    })
    it('POST 201 success when turnstile bypass (no secret)', async () => {
      const { POST } = await import('@/app/api/apply/route')
      delete process.env.TURNSTILE_SECRET_KEY
      // mock supabase admin client
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn((t: string) => {
          if (t === 'barbershop_applications')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'app1' }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/apply', {
        business_name: 'Barber',
        owner_name: 'Owner',
        email: 'a@test.com',
      })
      const res = await POST(req as any)
      expect(res.status).toBe(201)
    })
    it('POST 409 already_pending', async () => {
      const { POST } = await import('@/app/api/apply/route')
      delete process.env.TURNSTILE_SECRET_KEY
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn((t: string) => {
          if (t === 'barbershop_applications')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'app1', status: 'pending' },
                    error: null,
                  })),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'app1' }, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/apply', {
        business_name: 'Barber',
        owner_name: 'Owner',
        email: 'a@test.com',
      })
      const res = await POST(req as any)
      expect(res.status).toBe(409)
    })
    it('POST 500 insert_failed', async () => {
      const { POST } = await import('@/app/api/apply/route')
      delete process.env.TURNSTILE_SECRET_KEY
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn((t: string) => {
          if (t === 'barbershop_applications')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: { message: 'fail' } })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = jsonReq('http://localhost/api/apply', {
        business_name: 'Barber',
        owner_name: 'Owner',
        email: 'a@test.com',
      })
      const res = await POST(req as any)
      expect(res.status).toBe(500)
    })
  })

  describe('cron recurring-generate', () => {
    it('GET 401 without auth', async () => {
      const { GET } = await import('@/app/api/cron/recurring-generate/route')
      process.env.CRON_SECRET = 'secret'
      const req = new NextRequest('http://localhost/api/cron/recurring-generate')
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('GET 429 rate limited', async () => {
      const { GET } = await import('@/app/api/cron/recurring-generate/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = new NextRequest('http://localhost/api/cron/recurring-generate', {
        headers: { authorization: 'Bearer secret' },
      })
      process.env.CRON_SECRET = 'secret'
      const res = await GET(req as any)
      expect(res.status).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('GET 200 with valid secret no due', async () => {
      const { GET } = await import('@/app/api/cron/recurring-generate/route')
      process.env.CRON_SECRET = 'secret'
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn((t: string) => {
          if (t === 'recurring_appointments')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: [], error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/cron/recurring-generate', {
        headers: { authorization: 'Bearer secret' },
      })
      const res = await GET(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.ok).toBe(true)
    })
    it('GET deactivates expired series', async () => {
      const { GET } = await import('@/app/api/cron/recurring-generate/route')
      process.env.CRON_SECRET = 'secret'
      const expiredId = '88888888-8888-4888-a888-888888888888'
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn((t: string) => {
          if (t === 'recurring_appointments') {
            // first select due series, then update deactivate
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [
                        {
                          id: expiredId,
                          business_id: BIZ,
                          until: '2020-01-01T00:00:00Z',
                          is_active: true,
                          next_at: '2020-01-01T00:00:00Z',
                        },
                      ],
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          if (t === 'appointments')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/cron/recurring-generate', {
        headers: { authorization: 'Bearer secret' },
      })
      const res = await GET(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.deactivated).toBe(1)
    })
    it('GET updates next_at for active series', async () => {
      const { GET } = await import('@/app/api/cron/recurring-generate/route')
      process.env.CRON_SECRET = 'secret'
      const activeId = '99999999-9999-4999-a999-999999999999'
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn((t: string) => {
          if (t === 'recurring_appointments') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [
                        {
                          id: activeId,
                          business_id: BIZ,
                          until: null,
                          is_active: true,
                          next_at: new Date().toISOString(),
                        },
                      ],
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          if (t === 'appointments')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({
                          data: { starts_at: new Date(Date.now() + 86400000).toISOString() },
                          error: null,
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      } as any)
      const req = new NextRequest('http://localhost/api/cron/recurring-generate', {
        headers: { authorization: 'Bearer secret' },
      })
      const res = await GET(req as any)
      expect(res.status).toBe(200)
    })
    it('POST delegates to GET 200', async () => {
      const { POST } = await import('@/app/api/cron/recurring-generate/route')
      process.env.CRON_SECRET = 'secret'
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              lte: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        })),
      } as any)
      const req = new NextRequest('http://localhost/api/cron/recurring-generate', {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
      })
      const res = await POST(req as any)
      expect(res.status).toBe(200)
    })
    it('GET 500 on select error', async () => {
      const { GET } = await import('@/app/api/cron/recurring-generate/route')
      process.env.CRON_SECRET = 'secret'
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              lte: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: null, error: { message: 'fail' } })),
              })),
            })),
          })),
        })),
      } as any)
      const req = new NextRequest('http://localhost/api/cron/recurring-generate', {
        headers: { authorization: 'Bearer secret' },
      })
      const res = await GET(req as any)
      expect(res.status).toBe(500)
    })
  })
})
