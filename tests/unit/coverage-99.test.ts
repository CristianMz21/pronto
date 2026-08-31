import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({
  default: {
    sanitize: (s: string) =>
      String(s)
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 1000),
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => true), getIp: vi.fn(() => '1.1.1.1') }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
  })),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`)
  }),
}))

describe('coverage 99 strict', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clients/import covers upsert error 102 and insert error 127', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const { POST } = await import('@/app/api/clients/import/route')
    // upsert error
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
      from: vi.fn((t: string) => {
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
              })),
            })),
          } as any
        if (t === 'clients')
          return {
            upsert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: null, error: { message: 'upsert fail' } })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: 'c1' }], error: null })),
            })),
          } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    let req = new NextRequest('http://localhost/api/clients/import', {
      method: 'POST',
      body: JSON.stringify({ clients: [{ name: 'A', phone: '+1' }] }),
    } as any)
    let res = await POST(req as any)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Database error')

    // insert error (without phone)
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
      from: vi.fn((t: string) => {
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
              })),
            })),
          } as any
        if (t === 'clients')
          return {
            upsert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: 'c1' }], error: null })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: null, error: { message: 'insert fail' } })),
            })),
          } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    req = new NextRequest('http://localhost/api/clients/import', {
      method: 'POST',
      body: JSON.stringify({ clients: [{ name: 'B' }] }),
    } as any)
    res = await POST(req as any)
    expect(res.status).toBe(500)
  })

  it('cron covers 154 and 226 error logs', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const emailMod = await import('@/lib/email')
    // force sendReminder to throw for both 24h and 1h
    vi.spyOn(emailMod as any, 'sendReminder').mockImplementation(async () => {
      throw new Error('fail')
    })
    process.env.CRON_SECRET = 'secret'
    const svc = await import('@supabase/supabase-js')
    const biz = {
      name: 'Biz',
      timezone: 'UTC',
      telegram_bot_token: null,
      viber_bot_token: null,
      meta_whatsapp_phone_number_id: null,
    } as any
    const client = {
      name: 'Cli',
      email: 'c@test.com',
      whatsapp_number: null,
      viber_user_id: null,
      telegram_id: null,
    }
    const appt24 = {
      id: 'a1',
      business_id: 'b1',
      starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      services: { name: 'S' },
      employees: { name: 'E' },
      clients: client,
    }
    const appt1h = {
      id: 'a2',
      business_id: 'b1',
      starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      services: { name: 'S' },
      employees: { name: 'E' },
      clients: client,
    }
    let call = 0
    vi.mocked(svc.createClient).mockReturnValue({
      from: vi.fn((t: string) => {
        if (t === 'appointments') {
          call++
          const c: any = {}
          ;['select', 'gte', 'lte', 'eq', 'not'].forEach((m) => (c[m] = vi.fn(() => c)))
          if (call === 1)
            c.then = (r: any) => Promise.resolve({ data: [appt24], error: null }).then(r)
          else if (call === 2)
            c.then = (r: any) => Promise.resolve({ data: [appt1h], error: null }).then(r)
          else c.then = (r: any) => Promise.resolve({ data: [], error: null }).then(r)
          return c
        }
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: biz, error: null })) })),
            })),
          } as any
        if (t === 'clients') {
          const c: any = {}
          ;['select', 'gte', 'lte', 'not'].forEach((m) => (c[m] = vi.fn(() => c)))
          c.then = (r: any) => Promise.resolve({ data: [], error: null }).then(r)
          return c
        }
        if (t === 'notification_log') return { insert: vi.fn(async () => ({ error: null })) } as any
        const c: any = {}
        ;['select', 'gte', 'lte', 'eq', 'not'].forEach((m) => (c[m] = vi.fn(() => c)))
        c.then = (r: any) => Promise.resolve({ data: [], error: null }).then(r)
        return c
      }),
    } as any)
    const { GET } = await import('@/app/api/cron/notify/route')
    const req = new NextRequest('http://localhost/api/cron/notify', {
      headers: { authorization: 'Bearer secret' },
    } as any)
    const res = await GET(req as any)
    expect(res.status).toBe(200)
  })

  it('email confirm covers 239 log error and viber set-webhook 37,46,57', async () => {
    const supa = await import('@supabase/supabase-js')
    process.env.INTERNAL_API_SECRET = 's3cret'
    const appt = {
      id: 'a1',
      starts_at: '2026-01-15T10:00:00Z',
      business_id: 'b1',
      services: { name: 'Cut', duration_min: 30 },
      employees: { name: 'Bob' },
      clients: {
        name: 'Alice',
        email: 'alice@test.com',
        whatsapp_number: null,
        telegram_id: null,
        viber_user_id: null,
      },
    }
    const biz = {
      name: 'Biz',
      address: null,
      timezone: 'UTC',
      telegram_bot_token: null,
      viber_bot_token: null,
      meta_whatsapp_phone_number_id: null,
    } as any
    vi.mocked(supa.createClient).mockReturnValue({
      from: vi.fn((t: string) => {
        if (t === 'appointments')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: appt, error: null })) })),
            })),
          } as any
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: biz, error: null })) })),
            })),
          } as any
        if (t === 'notification_log')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(async () => ({
              error: { message: 'insert fail', code: '23506' },
            })),
          } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    const { POST } = await import('@/app/api/email/confirm/route')
    const req = new NextRequest('http://localhost/api/email/confirm', {
      method: 'POST',
      headers: { authorization: 'Bearer s3cret' },
      body: JSON.stringify({ appointmentId: 'a1' }),
    } as any)
    const res = await POST(req as any)
    expect(res.status).toBe(200)

    // viber set-webhook 37,46,57
    const srv = await import('@/lib/supabase/server')
    const viberMod = await import('@/lib/viber')
    // 37: APP_URL localhost -> 400 already covered but ensure, 46: invalid token, 57: set fail
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
    vi.mocked(srv.createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'b1', viber_bot_token: 'tok' },
              error: null,
            })),
          })),
        })),
      })),
    } as any)
    vi.spyOn(viberMod as any, 'getViberBotInfo').mockResolvedValue({ ok: false } as any)
    const { POST: vbPost } = await import('@/app/api/viber/set-webhook/route')
    let vbReq = new NextRequest('http://localhost/api/viber/set-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    } as any)
    let vbRes = await vbPost(vbReq as any)
    expect(vbRes.status).toBe(400)

    vi.spyOn(viberMod as any, 'getViberBotInfo').mockResolvedValue({ ok: true, name: 'bot' } as any)
    vi.spyOn(viberMod as any, 'setViberWebhook').mockResolvedValue({
      ok: false,
      description: 'fail set',
    } as any)
    vbReq = new NextRequest('http://localhost/api/viber/set-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    } as any)
    vbRes = await vbPost(vbReq as any)
    expect(vbRes.status).toBe(400)
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('covers sitemap 76, proxy 49, auth callback 53-54,79, onboarding 78', async () => {
    // sitemap: need to mock supabase for businesses with no slug
    const srv = await import('@/lib/supabase/server')
    vi.mocked(srv.createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
      from: vi.fn((t: string) => {
        if (t === 'businesses')
          return {
            select: vi.fn(async () => ({
              data: [{ slug: null, updated_at: '2026-01-01' }],
              error: null,
            })),
          } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    const sitemap = await import('@/app/sitemap')
    const urls = await sitemap.default()
    expect(Array.isArray(urls)).toBe(true)

    // proxy 49
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'saas'
    const { proxy } = await import('@/proxy')
    const { createServerClient } = await import('@supabase/ssr')
    let _setAllCalled = false
    vi.mocked(createServerClient).mockImplementation((_u: any, _k: any, opts: any) => {
      return {
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'u1', email: 'a@b.com' } },
            error: null,
          })),
        },
        // trigger setAll
        getAll: opts.cookies.getAll,
        setAll: (cookies: any[]) => {
          _setAllCalled = true
          opts.cookies.setAll(cookies)
        },
      } as any
    })
    const url = new URL('http://localhost/dashboard')
    ;(url as any).clone = () => {
      const c = new URL(url.toString())
      ;(c as any).clone = (url as any).clone
      return c
    }
    const req: any = {
      nextUrl: url,
      cookies: { get: vi.fn(() => null), getAll: vi.fn(() => []), set: vi.fn() },
      headers: new Headers(),
    }
    const res = await proxy(req)
    expect([200, 307]).toContain(res.status)

    // auth callback 53-54: exchangeCodeForSession success then redirect
    vi.mocked(srv.createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { session: { access_token: 'tok' } },
          error: null,
        })),
        getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
      },
      from: vi.fn(() => ({ select: vi.fn(() => ({})) })),
    } as any)
    const { GET: cbGet } = await import('@/app/auth/callback/route')
    let cbReq = new NextRequest('http://localhost/auth/callback?code=abc&next=/dashboard') as any
    let cbRes = await cbGet(cbReq as any)
    expect([307, 302]).toContain(cbRes.status)

    // 79: no code
    cbReq = new NextRequest('http://localhost/auth/callback') as any
    cbRes = await cbGet(cbReq as any)
    expect([400, 307, 302]).toContain(cbRes.status)

    // onboarding 78: updateError is throw
    vi.mocked(srv.createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
      from: vi.fn((t: string) => {
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'b1', slug: 'biz' }, error: null })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: { message: 'slug taken' } })),
            })),
          } as any
        if (t === 'services') return { insert: vi.fn(async () => ({ error: null })) } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    const { completeOnboarding } = await import('@/app/onboarding/actions')
    await expect(
      completeOnboarding({
        bizType: 'salon',
        bizName: 'Test',
        serviceName: 'Cut',
        servicePrice: 10,
        serviceDuration: 30,
        slug: 'valid-slug',
      }),
    ).rejects.toThrow('slug taken')
  })

  it('covers viber webhook remaining 77,94,126-131,182', async () => {
    const supa = await import('@supabase/supabase-js')
    const { POST } = await import('@/app/api/viber/webhook/route')
    // 77: no viber token
    vi.mocked(supa.createClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'b1', viber_bot_token: null }, error: null })),
          })),
        })),
      })),
    } as any)
    let req = new NextRequest('http://localhost/api/viber/webhook?bid=b1', {
      method: 'POST',
      body: JSON.stringify({ event: 'message', sender: { id: 'u1' }, message: { text: 'hi' } }),
    } as any)
    let res = await POST(req as any)
    expect(res.status).toBe(200)

    // 94: user already linked? Actually 94 is update path for existing viber id
    vi.mocked(supa.createClient).mockReturnValue({
      from: vi.fn((t: string) => {
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: 'b1', viber_bot_token: 'tok' },
                  error: null,
                })),
              })),
            })),
          } as any
        if (t === 'clients')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: 'c1' }, error: null })),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            })),
          } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    req = new NextRequest('http://localhost/api/viber/webhook?bid=b1', {
      method: 'POST',
      body: JSON.stringify({ event: 'conversation_started', user: { id: 'u1' }, subscribed: true }),
    } as any)
    res = await POST(req as any)
    expect(res.status).toBe(200)

    // 126-131: /today with data
    vi.mocked(supa.createClient).mockReturnValue({
      from: vi.fn((t: string) => {
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: 'b1', viber_bot_token: 'tok' },
                  error: null,
                })),
              })),
            })),
          } as any
        if (t === 'appointments')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    order: vi.fn(async () => ({
                      data: [
                        {
                          starts_at: new Date().toISOString(),
                          status: 'confirmed',
                          clients: { name: 'Alice' },
                          services: { name: 'Cut' },
                        },
                      ],
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    req = new NextRequest('http://localhost/api/viber/webhook?bid=b1', {
      method: 'POST',
      body: JSON.stringify({ event: 'message', sender: { id: 'u1' }, message: { text: '/today' } }),
    } as any)
    res = await POST(req as any)
    expect(res.status).toBe(200)
  })
})
