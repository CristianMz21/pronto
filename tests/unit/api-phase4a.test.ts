import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => true), getIp: vi.fn(() => '1.1.1.1') }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: vi.fn((s: string) => s.replace(/<[^>]*>/g, '').trim()) },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/campaigns', () => ({ sendCampaign: vi.fn(), getCampaignStats: vi.fn() }))

import { getCampaignStats, sendCampaign } from '@/lib/campaigns'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function makeChain(r: any) {
  const c: any = {}
  const p = Promise.resolve(r)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  if ((p as any).finally) c.finally = (p as any).finally.bind(p)
  ;[
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
  ].forEach((m) => (c[m] = vi.fn((..._a: any[]) => c)))
  return c
}
const jsonReq = (u: string, b: any, m = 'POST') =>
  new NextRequest(u, {
    method: m,
    headers: { 'content-type': 'application/json' } as any,
    body: b === undefined ? undefined : JSON.stringify(b),
  })
const badReq = (): any => ({
  headers: { get: () => '1.1.1.1' },
  json: async () => {
    throw new Error('bad')
  },
})
const B = '11111111-1111-4111-a111-111111111111',
  U = '22222222-2222-4222-a222-222222222222',
  L = '55555555-5555-4555-a555-555555555555',
  E = '66666666-6666-4666-a666-666666666666',
  C = '33333333-3333-4333-a333-333333333333',
  S = '44444444-4444-4444-a444-444444444444'
const bizOk = () => makeChain({ data: { id: B }, error: null }),
  bizNull = () => makeChain({ data: null, error: null })
const authOk = () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: U } } })) } })
const authNull = () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } })
function fFrom(m: any) {
  return vi.fn((t: string) => {
    if (t === 'businesses') return bizOk()
    if (m[t]) return m[t]
    return bizNull()
  })
}
describe('api-phase4a', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue(true)
    vi.mocked(getIp).mockReturnValue('1.1.1.1')
  })
  describe('employees', () => {
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect((await GET(new NextRequest('http://localhost') as any)).status).toBe(401)
    })
    it('GET 404', async () => {
      const { GET } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizNull()),
      } as any)
      expect((await GET(new NextRequest('http://localhost') as any)).status).toBe(404)
    })
    it('GET 500', async () => {
      const { GET } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses' ? bizOk() : makeChain({ data: null, error: { message: 'db' } }),
        ),
      } as any)
      expect((await GET(new NextRequest('http://localhost') as any)).status).toBe(500)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses' ? bizOk() : makeChain({ data: [{ id: E, name: 'Ana' }], error: null }),
        ),
      } as any)
      const r = await GET(new NextRequest('http://localhost') as any)
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual([{ id: E, name: 'Ana' }])
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/employees/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (await POST(jsonReq('http://localhost/api/employees', { name: 'A' }) as any)).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (await POST(jsonReq('http://localhost/api/employees', { name: 'A' }) as any)).status,
      ).toBe(401)
    })
    it('POST 404', async () => {
      const { POST } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizNull()),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost/api/employees', { name: 'A' }) as any)).status,
      ).toBe(404)
    })
    it('POST 400', async () => {
      const { POST } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizOk()),
      } as any)
      expect((await POST(badReq() as any)).status).toBe(400)
    })
    it('POST 422', async () => {
      const { POST } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizOk()),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost/api/employees', { name: '' }) as any)).status,
      ).toBe(422)
    })
    it('POST 201', async () => {
      const { POST } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                insert: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: E }, error: null })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await POST(
            jsonReq('http://localhost/api/employees', { name: 'Ana', role: 'barbero' }) as any,
          )
        ).status,
      ).toBe(201)
    })
    it('POST 500', async () => {
      const { POST } = await import('@/app/api/employees/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                insert: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: null, error: { message: 'dup' } })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await POST(
            jsonReq('http://localhost/api/employees', {
              name: '<b>Ana</b>',
              email: 'a@b.com',
            }) as any,
          )
        ).status,
      ).toBe(500)
    })
  })
  describe('employees [id]', () => {
    it('PATCH 429', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (
          await PATCH(jsonReq('http://localhost', {}, 'PATCH') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('PATCH 401', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (
          await PATCH(jsonReq('http://localhost', { name: 'A' }, 'PATCH') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(401)
    })
    it('PATCH 404', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizNull()),
      } as any)
      expect(
        (
          await PATCH(jsonReq('http://localhost', { name: 'A' }, 'PATCH') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(404)
    })
    it('PATCH 400', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizOk()),
      } as any)
      expect((await PATCH(badReq() as any, { params: Promise.resolve({ id: E }) })).status).toBe(
        400,
      )
    })
    it('PATCH 422', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizOk()),
      } as any)
      expect(
        (
          await PATCH(jsonReq('http://localhost', { name: '' }, 'PATCH') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(422)
    })
    it('PATCH 400 no_updates', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizOk()),
      } as any)
      expect(
        (
          await PATCH(jsonReq('http://localhost', {}, 'PATCH') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(400)
    })
    it('PATCH 200', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                update: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        single: vi.fn(async () => ({ data: { id: E }, error: null })),
                      })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await PATCH(jsonReq('http://localhost', { name: 'Bob' }, 'PATCH') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(200)
    })
    it('PATCH 500', async () => {
      const { PATCH } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                update: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        single: vi.fn(async () => ({ data: null, error: { message: 'fail' } })),
                      })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await PATCH(jsonReq('http://localhost', { name: 'Bob' }, 'PATCH') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(500)
    })
    it('DELETE 429', async () => {
      const { DELETE } = await import('@/app/api/employees/[id]/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (
          await DELETE(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('DELETE 401', async () => {
      const { DELETE } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (
          await DELETE(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(401)
    })
    it('DELETE 200', async () => {
      const { DELETE } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                update: vi.fn(() => ({
                  eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await DELETE(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(200)
    })
    it('DELETE 500', async () => {
      const { DELETE } = await import('@/app/api/employees/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                update: vi.fn(() => ({
                  eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: { message: 'fail' } })) })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await DELETE(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: E }),
          })
        ).status,
      ).toBe(500)
    })
  })
  describe('employee-services', () => {
    it('GET 400', async () => {
      const { GET } = await import('@/app/api/employee-services/route')
      expect(
        (await GET(new NextRequest('http://localhost/api/employee-services') as any)).status,
      ).toBe(400)
    })
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (
          await GET(
            new NextRequest(`http://localhost/api/employee-services?employee_id=${E}`) as any,
          )
        ).status,
      ).toBe(401)
    })
    it('GET 404', async () => {
      const { GET } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizNull()),
      } as any)
      expect(
        (
          await GET(
            new NextRequest(`http://localhost/api/employee-services?employee_id=${E}`) as any,
          )
        ).status,
      ).toBe(404)
    })
    it('GET 500', async () => {
      const { GET } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses' ? bizOk() : makeChain({ data: null, error: { message: 'fail' } }),
        ),
      } as any)
      expect(
        (
          await GET(
            new NextRequest(`http://localhost/api/employee-services?employee_id=${E}`) as any,
          )
        ).status,
      ).toBe(500)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses' ? bizOk() : makeChain({ data: [{ service_id: S }], error: null }),
        ),
      } as any)
      expect(
        (
          await GET(
            new NextRequest(`http://localhost/api/employee-services?employee_id=${E}`) as any,
          )
        ).status,
      ).toBe(200)
    })
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/employee-services/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (await POST(jsonReq('http://localhost', { employee_id: E, service_id: S }) as any)).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (await POST(jsonReq('http://localhost', { employee_id: E, service_id: S }) as any)).status,
      ).toBe(401)
    })
    it('POST 422', async () => {
      const { POST } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizOk()),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { employee_id: 'bad', service_id: S }) as any))
          .status,
      ).toBe(422)
    })
    it('POST 201', async () => {
      const { POST } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses' ? bizOk() : ({ insert: vi.fn(async () => ({ error: null })) } as any),
        ),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { employee_id: E, service_id: S }) as any)).status,
      ).toBe(201)
    })
    it('POST already', async () => {
      const { POST } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                insert: vi.fn(async () => ({ error: { message: 'dup', code: '23505' } })),
              } as any),
        ),
      } as any)
      const r = await POST(jsonReq('http://localhost', { employee_id: E, service_id: S }) as any)
      expect(r.status).toBe(200)
      expect(((await r.json()) as any).already).toBe(true)
    })
    it('POST unassign', async () => {
      const { POST } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                delete: vi.fn(() => ({
                  eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await POST(
            jsonReq('http://localhost', {
              employee_id: E,
              service_id: S,
              action: 'unassign',
            }) as any,
          )
        ).status,
      ).toBe(200)
    })
    it('POST 500', async () => {
      const { POST } = await import('@/app/api/employee-services/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({ insert: vi.fn(async () => ({ error: { message: 'fail' } })) } as any),
        ),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { employee_id: E, service_id: S }) as any)).status,
      ).toBe(500)
    })
  })
  describe('campaigns [id]', () => {
    it('GET 429', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(401)
    })
    it('GET 404 biz', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizNull()),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(404)
    })
    it('GET 404 camp', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(404)
    })
    it('GET 500', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : t === 'campaigns'
              ? ({
                  select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      eq: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({
                          data: null,
                          error: { message: 'fail' },
                        })),
                      })),
                    })),
                  })),
                } as any)
              : bizNull(),
        ),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(500)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/route')
      const camp = { id: C, business_id: B, name: 'Camp' }
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : t === 'campaigns'
              ? ({
                  select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      eq: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: camp, error: null })),
                      })),
                    })),
                  })),
                } as any)
              : t === 'campaign_recipients'
                ? ({
                    select: vi.fn(() => ({
                      eq: vi.fn(() => ({
                        limit: vi.fn(async () => ({
                          data: [{ client_id: 'x' }],
                          count: 1,
                          error: null,
                        })),
                      })),
                    })),
                  } as any)
                : bizNull(),
        ),
      } as any)
      const r = await GET(new NextRequest('http://localhost') as any, {
        params: Promise.resolve({ id: C }),
      })
      expect(r.status).toBe(200)
      expect(((await r.json()) as any).campaign.id).toBe(C)
    })
  })
  describe('campaigns send', () => {
    it('POST 429', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (
          await POST(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('POST 401', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (
          await POST(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(401)
    })
    it('POST 404 biz', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizNull()),
      } as any)
      expect(
        (
          await POST(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(404)
    })
    it('POST 404 camp', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await POST(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(404)
    })
    it('POST 409 not_draft', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: { id: C, status: 'sent' },
                        error: null,
                      })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await POST(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(409)
    })
    it('POST 200', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: { id: C, status: 'draft' },
                        error: null,
                      })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      vi.mocked(sendCampaign).mockResolvedValue({ sent: 2, failed: 0, stub: true } as any)
      const r = await POST(new NextRequest('http://localhost') as any, {
        params: Promise.resolve({ id: C }),
      })
      expect(r.status).toBe(200)
      expect(((await r.json()) as any).ok).toBe(true)
    })
    it('POST 500 throw', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: { id: C, status: 'draft' },
                        error: null,
                      })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      vi.mocked(sendCampaign).mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
      expect(
        (
          await POST(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(500)
    })
    it('POST 409 throw', async () => {
      const { POST } = await import('@/app/api/campaigns/[id]/send/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: { id: C, status: 'draft' },
                        error: null,
                      })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      vi.mocked(sendCampaign).mockRejectedValue(
        Object.assign(new Error('conflict'), { status: 409 }),
      )
      expect(
        (
          await POST(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(409)
    })
  })
  describe('campaigns stats', () => {
    it('GET 429', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/stats/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('GET 401', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/stats/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(401)
    })
    it('GET 404 biz', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/stats/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizNull()),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(404)
    })
    it('GET 200', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/stats/route')
      vi.mocked(getCampaignStats).mockResolvedValue({
        sent: 1,
        delivered: 1,
        rebooked: 0,
        failed: 0,
        recipients: 1,
        stats: { sent: 1 },
      } as any)
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: { id: C }, error: null })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(200)
    })
    it('GET 404 tenant', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/stats/route')
      vi.mocked(getCampaignStats).mockResolvedValue({ sent: 0 } as any)
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses'
            ? bizOk()
            : ({
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              } as any),
        ),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(404)
    })
    it('GET 500 throw', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/stats/route')
      vi.mocked(getCampaignStats).mockRejectedValue(new Error('fail'))
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses' ? bizOk() : makeChain({ data: { id: B }, error: null }),
        ),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(500)
    })
    it('GET 404 throw', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/stats/route')
      vi.mocked(getCampaignStats).mockRejectedValue(new Error('campaign_not_found boom'))
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn((t: string) =>
          t === 'businesses' ? bizOk() : makeChain({ data: { id: B }, error: null }),
        ),
      } as any)
      expect(
        (
          await GET(new NextRequest('http://localhost') as any, {
            params: Promise.resolve({ id: C }),
          })
        ).status,
      ).toBe(404)
    })
  })
  describe('inventory transfer', () => {
    it('429', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(rateLimit).mockReturnValue(false)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(429)
      vi.mocked(rateLimit).mockReturnValue(true)
    })
    it('401', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue(authNull() as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(401)
    })
    it('422 validation', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: vi.fn(() => bizOk()),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: 'bad', quantity: 0 }) as any)).status,
      ).toBe(422)
    })
    it('404 item', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({ inventory_items: makeChain({ data: null, error: null }) }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: null })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(404)
    })
    it('404 from_loc', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          locations: makeChain({ data: null, error: null }),
        }),
      } as any)
      expect(
        (
          await POST(
            jsonReq('http://localhost', { item_id: B, quantity: 1, from_location_id: L }) as any,
          )
        ).status,
      ).toBe(404)
    })
    it('404 to_loc', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      const bad = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          locations: makeChain({ data: null, error: null }),
        }),
      } as any)
      expect(
        (
          await POST(
            jsonReq('http://localhost', { item_id: B, quantity: 1, to_location_id: bad }) as any,
          )
        ).status,
      ).toBe(404)
    })
    it('422 same', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          locations: makeChain({ data: { id: L }, error: null }),
        }),
      } as any)
      expect(
        (
          await POST(
            jsonReq('http://localhost', {
              item_id: B,
              quantity: 1,
              from_location_id: L,
              to_location_id: L,
            }) as any,
          )
        ).status,
      ).toBe(422)
    })
    it('409 insufficient', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({ data: { id: B, business_id: B, quantity: 1 }, error: null }),
        }),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 5 }) as any)).status,
      ).toBe(409)
    })
    it('200 idempotent', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          inventory_movements: makeChain({ data: { id: 'm1' }, error: null }),
        }),
      } as any)
      expect(
        (
          await POST(
            jsonReq('http://localhost', { item_id: B, quantity: 1, idempotency_key: 'k1' }) as any,
          )
        ).status,
      ).toBe(200)
    })
    it('200 rpc', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: null })),
      } as any)
      const r = await POST(
        jsonReq('http://localhost', { item_id: B, quantity: 1, note: 'hi' }) as any,
      )
      expect(r.status).toBe(200)
      expect(((await r.json()) as any).ok).toBe(true)
    })
    it('409 rpc insufficient', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'insufficient_stock' } })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(409)
    })
    it('fallback insert 200', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          inventory_movements: {
            select: vi.fn(() => makeChain({ data: null, error: null })) as any,
            insert: vi.fn(async () => ({ error: null })),
          },
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'does not exist' } })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(200)
    })
    it('409 fresh', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      let c = 0
      const from = vi.fn((t: string) => {
        if (t === 'businesses') return bizOk()
        if (t === 'inventory_items') {
          c++
          if (c === 1)
            return makeChain({ data: { id: B, business_id: B, quantity: 10 }, error: null })
          return makeChain({ data: { quantity: 0 }, error: null })
        }
        return bizNull()
      })
      vi.mocked(createClient).mockResolvedValue({ auth: authOk().auth, from } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'does not exist' } })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 5 }) as any)).status,
      ).toBe(409)
    })
    it('fallback pair', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      let ins = 0
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          inventory_movements: {
            select: vi.fn(() => makeChain({ data: null, error: null })) as any,
            insert: vi.fn(async () => {
              ins++
              return ins === 1 ? { error: { message: 'transfer check' } } : { error: null }
            }),
          },
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'does not exist' } })),
      } as any)
      const r = await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)
      expect(r.status).toBe(200)
      expect(((await r.json()) as any).fallback).toBe(true)
    })
    it('fallback legacy', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      let ins2 = 0
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          inventory_movements: {
            select: vi.fn(() => makeChain({ data: null, error: null })) as any,
            insert: vi.fn(async () => {
              ins2++
              return ins2 === 1
                ? { error: { message: 'column from_location_id' } }
                : { error: null }
            }),
          },
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'does not exist' } })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(200)
    })
    it('500 generic', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
          inventory_movements: {
            select: vi.fn(() => makeChain({ data: null, error: null })) as any,
            insert: vi.fn(async () => ({ error: { message: 'fail' } })),
          },
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'does not exist' } })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(500)
    })
    it('422 qty positive', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'quantity_must_be_positive' } })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(422)
    })
    it('422 same_loc rpc', async () => {
      const { POST } = await import('@/app/api/inventory/transfer/route')
      vi.mocked(createClient).mockResolvedValue({
        auth: authOk().auth,
        from: fFrom({
          inventory_items: makeChain({
            data: { id: B, business_id: B, quantity: 10 },
            error: null,
          }),
        }),
      } as any)
      vi.mocked(createServiceClient).mockReturnValue({
        rpc: vi.fn(async () => ({ error: { message: 'same_location' } })),
      } as any)
      expect(
        (await POST(jsonReq('http://localhost', { item_id: B, quantity: 1 }) as any)).status,
      ).toBe(422)
    })
  })
})
