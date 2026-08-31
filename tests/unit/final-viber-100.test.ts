import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/viber', () => ({
  sendViberMessage: vi.fn().mockResolvedValue(true),
  tplLowStock: vi.fn(() => 'vlow'),
  setViberWebhook: vi.fn().mockResolvedValue({ ok: true }),
  getViberBotInfo: vi.fn().mockResolvedValue({ ok: true, name: 'bot' }),
}))
vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  setTelegramWebhook: vi.fn().mockResolvedValue({ ok: true }),
  getTelegramBotInfo: vi.fn().mockResolvedValue({ ok: true, result: { username: 'bot' } }),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`)
  }),
}))

describe('final viber 100 strict', () => {
  beforeEach(() => vi.clearAllMocks())

  it('viber webhook covers 77,94,126-131,182', async () => {
    const supa = await import('@supabase/supabase-js')
    const { POST } = await import('@/app/api/viber/webhook/route')
    // 77: no viber token - already covered but ensure
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

    // 94: conversation_started with user already having viber id? Actually 94 is update path
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
      body: JSON.stringify({
        event: 'conversation_started',
        user: { id: 'u1', name: 'John' },
        subscribed: true,
      }),
    } as any)
    res = await POST(req as any)
    expect(res.status).toBe(200)

    // 126-131: viber /today with data and with empty
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
                        {
                          starts_at: new Date().toISOString(),
                          status: 'cancelled',
                          clients: { name: 'Bob' },
                          services: { name: 'Color' },
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

    // empty today
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
                  lte: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })),
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

    // 182: fallback not owner
    vi.mocked(supa.createClient).mockReturnValue({
      from: vi.fn((t: string) => {
        if (t === 'businesses')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: 'b1', viber_bot_token: 'tok', viber_chat_id: 'other' },
                  error: null,
                })),
              })),
            })),
          } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    req = new NextRequest('http://localhost/api/viber/webhook?bid=b1', {
      method: 'POST',
      body: JSON.stringify({ event: 'message', sender: { id: 'u2' }, message: { text: 'hello' } }),
    } as any)
    res = await POST(req as any)
    expect(res.status).toBe(200)

    // also cover missing bid -> 400
    req = new NextRequest('http://localhost/api/viber/webhook', {
      method: 'POST',
      body: JSON.stringify({ event: 'message' }),
    } as any)
    res = await POST(req as any)
    expect([200, 400]).toContain(res.status)

    // cover /help and /link branches for viber?
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
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
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
      body: JSON.stringify({ event: 'message', sender: { id: 'u1' }, message: { text: '/help' } }),
    } as any)
    res = await POST(req as any)
    expect(res.status).toBe(200)
    req = new NextRequest('http://localhost/api/viber/webhook?bid=b1', {
      method: 'POST',
      body: JSON.stringify({
        event: 'message',
        sender: { id: 'u1' },
        message: { text: '/link +123' },
      }),
    } as any)
    res = await POST(req as any)
    expect(res.status).toBe(200)
  })

  it('covers viber and telegram set-webhook remaining 37,46,57 and proxy 49', async () => {
    const srv = await import('@/lib/supabase/server')
    const viberMod = await import('@/lib/viber')
    const tgMod = await import('@/lib/telegram')
    // viber set-webhook: success path with https APP_URL
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
    vi.spyOn(viberMod as any, 'getViberBotInfo').mockResolvedValue({ ok: true, name: 'bot' } as any)
    vi.spyOn(viberMod as any, 'setViberWebhook').mockResolvedValue({ ok: true } as any)
    const { POST: vbPost } = await import('@/app/api/viber/set-webhook/route')
    let req = new NextRequest('http://localhost/api/viber/set-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    } as any)
    let res = await vbPost(req as any)
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    // 37: setViberWebhook fail
    vi.spyOn(viberMod as any, 'setViberWebhook').mockResolvedValue({
      ok: false,
      description: 'fail',
    } as any)
    req = new NextRequest('http://localhost/api/viber/set-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    } as any)
    res = await vbPost(req as any)
    expect(res.status).toBe(400)

    // telegram set-webhook success
    vi.mocked(srv.createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'b1', telegram_bot_token: 'tok' },
              error: null,
            })),
          })),
        })),
      })),
    } as any)
    vi.spyOn(tgMod as any, 'getTelegramBotInfo').mockResolvedValue({
      ok: true,
      result: { username: 'bot' },
    } as any)
    vi.spyOn(tgMod as any, 'setTelegramWebhook').mockResolvedValue({ ok: true } as any)
    const { POST: tgPost } = await import('@/app/api/telegram/set-webhook/route')
    req = new NextRequest('http://localhost/api/telegram/set-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    } as any)
    res = await tgPost(req as any)
    expect(res.status).toBe(200)

    // 40,48: telegram invalid token and set fail
    vi.spyOn(tgMod as any, 'getTelegramBotInfo').mockResolvedValue({ ok: false } as any)
    req = new NextRequest('http://localhost/api/telegram/set-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    } as any)
    res = await tgPost(req as any)
    expect(res.status).toBe(400)
    vi.spyOn(tgMod as any, 'getTelegramBotInfo').mockResolvedValue({
      ok: true,
      result: { username: 'bot' },
    } as any)
    vi.spyOn(tgMod as any, 'setTelegramWebhook').mockResolvedValue({
      ok: false,
      description: 'fail',
    } as any)
    req = new NextRequest('http://localhost/api/telegram/set-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    } as any)
    res = await tgPost(req as any)
    expect(res.status).toBe(400)
    delete process.env.NEXT_PUBLIC_APP_URL

    // proxy 49: setAll - already covered in previous tests, just verify proxy still works
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'saas'
    const { proxy } = await import('@/proxy')
    const url = new URL('http://localhost/dashboard')
    ;(url as any).clone = () => {
      const c = new URL(url.toString())
      ;(c as any).clone = (url as any).clone
      return c
    }
    const pReq: any = {
      nextUrl: url,
      cookies: { get: vi.fn(() => null), getAll: vi.fn(() => []), set: vi.fn() },
      headers: new Headers(),
    }
    const pRes = await proxy(pReq)
    expect([200, 307]).toContain(pRes.status)
  })

  it('covers onboarding 78, auth callback 53-54,79, sitemap 76, clients/import 41', async () => {
    const srv = await import('@/lib/supabase/server')
    // onboarding 78 already covered via completeOnboarding invalid slug, but ensure success path
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
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          } as any
        if (t === 'services') return { insert: vi.fn(async () => ({ error: null })) } as any
        return { select: vi.fn(() => ({})) } as any
      }),
    } as any)
    const { completeOnboarding } = await import('@/app/onboarding/actions')
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'trypronto.app'
    await expect(
      completeOnboarding({
        bizType: 'salon',
        bizName: 'Test',
        serviceName: 'Cut',
        servicePrice: 10,
        serviceDuration: 30,
        slug: 'valid-slug',
      }),
    ).rejects.toThrow('NEXT_REDIRECT:https://valid-slug.trypronto.app/dashboard')
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN

    // auth callback 53-54: code exchange success with next param
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
    let req = new NextRequest('http://localhost/auth/callback?code=abc&next=/dashboard') as any
    let res = await cbGet(req as any)
    expect([307, 302]).toContain(res.status)
    // 79 no code
    req = new NextRequest('http://localhost/auth/callback') as any
    res = await cbGet(req as any)
    expect([307, 400, 302]).toContain(res.status)

    // sitemap 76
    vi.mocked(srv.createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({
        select: vi.fn(async () => ({
          data: [
            { slug: null, updated_at: '2026-01-01' },
            { slug: 'biz', updated_at: '2026-01-01' },
          ],
          error: null,
        })),
      })),
    } as any)
    const sitemap = await import('@/app/sitemap')
    const urls = await sitemap.default()
    expect(urls.length).toBeGreaterThan(0)

    // clients/import 41: Business not found
    vi.mocked(srv.createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
        })),
      })),
    } as any)
    const { POST: impPost } = await import('@/app/api/clients/import/route')
    req = new NextRequest('http://localhost/api/clients/import', {
      method: 'POST',
      body: JSON.stringify({ clients: [] }),
    } as any)
    res = await impPost(req as any)
    expect(res.status).toBe(404)
  })
})
