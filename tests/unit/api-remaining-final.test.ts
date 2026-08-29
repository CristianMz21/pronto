import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    const e: any = new Error(`NEXT_REDIRECT:${url}`)
    e.digest = `NEXT_REDIRECT;${url}`
    throw e
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/create-business', () => ({
  insertOwnerAsEmployee: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (s: string) => s.replace(/<[^>]*>/g, '').trim() },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => true), getIp: vi.fn(() => '1.1.1.1') }))
vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  setTelegramWebhook: vi.fn().mockResolvedValue({ ok: true, result: { username: 'bot' } }),
  getTelegramBotInfo: vi.fn().mockResolvedValue({ ok: true, result: { username: 'bot' } }),
}))
vi.mock('@/lib/viber', () => ({
  sendViberMessage: vi.fn().mockResolvedValue(true),
  setViberWebhook: vi.fn().mockResolvedValue({ ok: true }),
  getViberBotInfo: vi.fn().mockResolvedValue({ ok: true, name: 'bot' }),
}))
vi.mock('@/lib/email', () => ({
  sendLowStockAlert: vi.fn().mockResolvedValue({}),
  sendBookingConfirmation: vi.fn(),
  formatEmailDate: vi.fn(() => 'Jan 15'),
  formatEmailTime: vi.fn(() => '10:00'),
}))
vi.mock('@/lib/gcal', () => ({ buildGCalUrlFromISO: vi.fn(() => 'https://cal.com') }))

function expectRedirect(fn: () => Promise<any>, expected: string) {
  return expect(fn()).rejects.toThrow(expected)
}

describe('remaining robust', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('auth login actions', () => {
    it('login success redirect', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
          signInWithOAuth: vi.fn(),
        },
      } as any)
      const { login } = await import('@/app/(auth)/login/actions')
      const fd = new FormData()
      fd.set('email', 'a@b.com')
      fd.set('password', '12345678')
      fd.set('redirectTo', '/dashboard')
      await expectRedirect(() => login(fd), '/dashboard')
    })
    it('login error redirect', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: { message: 'bad' } }) },
      } as any)
      const { login } = await import('@/app/(auth)/login/actions')
      const fd = new FormData()
      fd.set('email', 'a@b.com')
      fd.set('password', 'wrong')
      await expectRedirect(() => login(fd), 'Invalid%20email%20or%20password')
    })
    it('loginWithGoogle success', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          signInWithOAuth: vi
            .fn()
            .mockResolvedValue({ data: { url: 'https://google.com' }, error: null }),
        },
      } as any)
      const { loginWithGoogle } = await import('@/app/(auth)/login/actions')
      const fd = new FormData()
      fd.set('redirectTo', '/dashboard')
      await expectRedirect(() => loginWithGoogle(fd), 'https://google.com')
    })
    it('loginWithGoogle fail', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: { message: 'fail' } }),
        },
      } as any)
      const { loginWithGoogle } = await import('@/app/(auth)/login/actions')
      const fd = new FormData()
      await expectRedirect(() => loginWithGoogle(fd), 'Google%20sign-in%20failed')
    })
  })

  describe('register', () => {
    it('businessName required', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({ auth: {} } as any)
      const { register } = await import('@/app/(auth)/register/actions')
      const fd = new FormData()
      fd.set('email', 'a@b.com')
      fd.set('password', '12345678')
      fd.set('business_name', '   ')
      await expectRedirect(() => register(fd), 'Business+name+is+required')
    })
    it('signUp error', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { signUp: vi.fn().mockResolvedValue({ data: {}, error: { message: 'exists' } }) },
      } as any)
      const { register } = await import('@/app/(auth)/register/actions')
      const fd = new FormData()
      fd.set('email', 'a@b.com')
      fd.set('password', '12345678')
      fd.set('business_name', 'Biz')
      await expectRedirect(() => register(fd), 'exists')
    })
    it('success with slug collision and onboarding', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { createClient: createAdmin } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          signUp: vi
            .fn()
            .mockResolvedValue({
              data: {
                user: { id: 'u1', email: 'a@b.com', user_metadata: {} },
                session: { access_token: 'tok' },
              },
              error: null,
            }),
          signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        },
      } as any)
      let slugCall = 0
      vi.mocked(createAdmin).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'businesses' && slugCall++ === 0) {
            // first maybeSingle for slug check returns existing, second returns null
            let attempt = 0
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    if (attempt++ === 0) return { data: { id: 'existing' }, error: null }
                    return { data: null, error: null }
                  }),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
                })),
              })),
            } as any
          }
          if (table === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
                })),
              })),
            } as any
          return { select: vi.fn(() => ({})) } as any
        }),
      } as any)
      const { register } = await import('@/app/(auth)/register/actions')
      const fd = new FormData()
      fd.set('email', 'a@b.com')
      fd.set('password', '12345678')
      fd.set('business_name', 'My Biz')
      await expectRedirect(() => register(fd), '/onboarding')
    })
  })

  describe('forgot/reset', () => {
    it('forgot redirects with sent', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }) },
      } as any)
      const { requestPasswordReset } = await import('@/app/(auth)/forgot-password/actions')
      const fd = new FormData()
      fd.set('email', 'a@b.com')
      await expectRedirect(() => requestPasswordReset(fd), 'sent=1')
    })
    it('reset password too short', async () => {
      const { updatePassword } = await import('@/app/(auth)/reset-password/actions')
      const fd = new FormData()
      fd.set('password', 'short')
      fd.set('confirm', 'short')
      await expectRedirect(() => updatePassword(fd), 'Password+must+be+at+least')
    })
    it('reset mismatch', async () => {
      const { updatePassword } = await import('@/app/(auth)/reset-password/actions')
      const fd = new FormData()
      fd.set('password', '12345678')
      fd.set('confirm', '87654321')
      await expectRedirect(() => updatePassword(fd), 'don%27t+match')
    })
    it('reset success', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) },
      } as any)
      const { updatePassword } = await import('@/app/(auth)/reset-password/actions')
      const fd = new FormData()
      fd.set('password', '12345678')
      fd.set('confirm', '12345678')
      await expectRedirect(() => updatePassword(fd), '/dashboard')
    })
    it('reset error', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { updateUser: vi.fn().mockResolvedValue({ error: { message: 'expired' } }) },
      } as any)
      const { updatePassword } = await import('@/app/(auth)/reset-password/actions')
      const fd = new FormData()
      fd.set('password', '12345678')
      fd.set('confirm', '12345678')
      await expectRedirect(() => updatePassword(fd), 'expired')
    })
  })

  describe('onboarding completeOnboarding', () => {
    it('rejects invalid slug', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: 'b1', slug: 'old' }, error: null })),
            })),
          })),
        })),
      } as any)
      const { completeOnboarding } = await import('@/app/onboarding/actions')
      await expect(
        completeOnboarding({
          bizType: 'salon',
          bizName: 'Biz',
          serviceName: 'Cut',
          servicePrice: 30,
          serviceDuration: 30,
          slug: 'BAD SLUG!',
        }),
      ).rejects.toThrow('Invalid slug format')
    })
    it('success with service and subdomain redirect', async () => {
      process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'trypronto.app'
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
        from: vi.fn((table: string) => {
          if (table === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'b1', slug: 'old' },
                    error: null,
                  })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          if (table === 'services') return { insert: vi.fn(async () => ({ error: null })) } as any
          return { select: vi.fn(() => ({})) } as any
        }),
      } as any)
      const { completeOnboarding } = await import('@/app/onboarding/actions')
      await expectRedirect(
        () =>
          completeOnboarding({
            bizType: 'salon',
            bizName: '<b>Biz</b>',
            serviceName: 'Cut',
            servicePrice: 30,
            serviceDuration: 30,
            slug: 'my-biz',
          }),
        'my-biz.trypronto.app',
      )
      delete process.env.NEXT_PUBLIC_ROOT_DOMAIN
    })
    it('unauthorized redirects to login', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
        from: vi.fn(),
      } as any)
      const { completeOnboarding } = await import('@/app/onboarding/actions')
      await expectRedirect(
        () =>
          completeOnboarding({
            bizType: 'x',
            serviceName: 'S',
            servicePrice: 10,
            serviceDuration: 30,
          }),
        '/login',
      )
    })
  })

  describe('appointments [id] PATCH', () => {
    it('429 rate limit', async () => {
      const { rateLimit } = await import('@/lib/rate-limit')
      vi.mocked(rateLimit).mockReturnValueOnce(false)
      const { PATCH } = await import('@/app/api/appointments/[id]/route')
      const req = new NextRequest('http://localhost/api/appointments/123', {
        method: 'PATCH',
        body: JSON.stringify({}),
      } as any)
      const res = await PATCH(req as any, { params: Promise.resolve({ id: '123' }) })
      expect(res.status).toBe(429)
    })
    it('401 unauthorized', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      } as any)
      const { PATCH } = await import('@/app/api/appointments/[id]/route')
      const req = new NextRequest('http://localhost/api/appointments/123', {
        method: 'PATCH',
        body: JSON.stringify({ employee_id: null }),
      } as any)
      const res = await PATCH(req as any, { params: Promise.resolve({ id: '123' }) })
      expect(res.status).toBe(401)
    })
    it('422 validation', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
        from: vi.fn((t: string) => {
          if (t === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
                })),
              })),
            } as any
          return { select: vi.fn(() => ({})) } as any
        }),
      } as any)
      const { PATCH } = await import('@/app/api/appointments/[id]/route')
      const req = new NextRequest('http://localhost/api/appointments/123', {
        method: 'PATCH',
        body: JSON.stringify({ employee_id: 'not-uuid' }),
      } as any)
      const res = await PATCH(req as any, { params: Promise.resolve({ id: '123' }) })
      expect(res.status).toBe(422)
    })
    it('200 success', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
        from: vi.fn((table: string) => {
          if (table === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
                })),
              })),
            } as any
          if (table === 'appointments')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({
                        data: { id: '123', employees: { id: 'e1', name: 'John' } },
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
      const { PATCH } = await import('@/app/api/appointments/[id]/route')
      const req = new NextRequest('http://localhost/api/appointments/123', {
        method: 'PATCH',
        body: JSON.stringify({ employee_id: null }),
      } as any)
      const res = await PATCH(req as any, { params: Promise.resolve({ id: '123' }) })
      expect(res.status).toBe(200)
    })
  })

  describe('email low-stock', () => {
    it('401 unauthorized', async () => {
      const { createClient: createServer } = await import('@/lib/supabase/server')
      vi.mocked(createServer).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      } as any)
      const { POST } = await import('@/app/api/email/low-stock/route')
      const req = new NextRequest('http://localhost/api/email/low-stock', {
        method: 'POST',
        body: JSON.stringify({ itemId: '1' }),
      } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(401)
    })
    it('404 item not found', async () => {
      const { createClient: createServer } = await import('@/lib/supabase/server')
      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createServer).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
      } as any)
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })),
          })),
        })),
        auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: null } })) } },
      } as any)
      const { POST } = await import('@/app/api/email/low-stock/route')
      const req = new NextRequest('http://localhost/api/email/low-stock', {
        method: 'POST',
        body: JSON.stringify({ itemId: 'item1' }),
      } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(404)
    })
  })

  describe('telegram/viber set-webhook', () => {
    it('telegram set-webhook 401', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      } as any)
      const { POST } = await import('@/app/api/telegram/set-webhook/route')
      const req = new NextRequest('http://localhost/api/telegram/set-webhook', {
        method: 'POST',
      } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(401)
    })
    it('telegram set-webhook invalid token', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
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
      const { getTelegramBotInfo } = await import('@/lib/telegram')
      vi.mocked(getTelegramBotInfo).mockResolvedValue({ ok: false } as any)
      const { POST } = await import('@/app/api/telegram/set-webhook/route')
      const req = new NextRequest('http://localhost/api/telegram/set-webhook', {
        method: 'POST',
      } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(400)
    })
    it('viber webhook 401', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      } as any)
      const { POST } = await import('@/app/api/viber/set-webhook/route')
      const req = new NextRequest('http://localhost/api/viber/set-webhook', {
        method: 'POST',
      } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(401)
    })
  })

  describe('auth callback', () => {
    it('redirects to login when no code', async () => {
      const { GET } = await import('@/app/auth/callback/route')
      const req = new NextRequest('http://localhost/auth/callback' as any)
      const res = await GET(req as any)
      expect(res.headers.get('location')).toContain('/login')
    })
    it('handles code exchange success with new business', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { createClient: createAdmin } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          exchangeCodeForSession: vi
            .fn()
            .mockResolvedValue({
              data: {
                user: { id: 'u1', email: 'a@b.com', user_metadata: { business_name: 'Test Biz' } },
              },
              error: null,
            }),
        },
      } as any)
      vi.mocked(createAdmin).mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            let call = 0
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    if (call++ === 0) return { data: null, error: null } // existing
                    return { data: null, error: null } // slug check
                  }),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'b1' }, error: null })),
                })),
              })),
            } as any
          }
          return { from: vi.fn(() => ({})) } as any
        }),
      } as any)
      const { GET } = await import('@/app/auth/callback/route')
      const req = new NextRequest('http://localhost/auth/callback?code=abc' as any)
      const res = await GET(req as any)
      expect(res.headers.get('location')).toContain('/onboarding')
    })
  })
})
