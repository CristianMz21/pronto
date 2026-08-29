import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendReminder: vi.fn().mockResolvedValue({}),
  sendThankYou: vi.fn().mockResolvedValue({}),
  sendReactivation: vi.fn().mockResolvedValue({}),
  sendBirthday: vi.fn().mockResolvedValue({}),
  formatEmailDate: vi.fn(() => 'Jan 15'),
  formatEmailTime: vi.fn(() => '10:00'),
}))
vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  tplThankYou: vi.fn(() => 'thank'),
  tplReactivation: vi.fn(() => 'react'),
  tplBirthday: vi.fn(() => 'bday'),
  tplReminderClient: vi.fn(() => 'rem'),
  tplThankYouClient: vi.fn(() => 'tq'),
  tplReactivationClient: vi.fn(() => 're'),
  tplBirthdayClient: vi.fn(() => 'bd'),
}))
vi.mock('@/lib/viber', () => ({
  sendViberMessage: vi.fn().mockResolvedValue(true),
  tplThankYou: vi.fn(() => 'tq'),
  tplReminderClient: vi.fn(() => 'rem'),
  tplThankYouClient: vi.fn(() => 'tq c'),
  tplReactivation: vi.fn(() => 're'),
  tplBirthday: vi.fn(() => 'bd'),
}))
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
  tplReminder: vi.fn(() => 'wa rem'),
  tplThankYou: vi.fn(() => 'wa thank'),
  tplReactivation: vi.fn(() => 'wa react'),
  tplBirthday: vi.fn(() => 'wa bday'),
}))

describe('cron 100', () => {
  beforeEach(() => vi.clearAllMocks())

  it('covers all 5 windows', async () => {
    process.env.CRON_SECRET = 'secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    const { createClient } = await import('@supabase/supabase-js')
    const now = new Date()
    const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const biz = {
      name: 'Biz',
      address: 'Addr',
      slug: 'biz',
      timezone: 'UTC',
      telegram_bot_token: 'tg',
      telegram_chat_id: 'tc',
      viber_bot_token: 'vb',
      viber_chat_id: 'vc',
      meta_whatsapp_phone_number_id: 'pid',
      meta_whatsapp_access_token: 'tok',
    }
    const appt = {
      id: 'a1',
      starts_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
      business_id: 'b1',
      services: { name: 'Cut' },
      employees: { name: 'John' },
      clients: {
        name: 'Client',
        email: 'c@test.com',
        whatsapp_number: '123',
        viber_user_id: 'v1',
        telegram_id: 't1',
      },
    }
    const appt1h = {
      ...appt,
      id: 'a2',
      starts_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    }
    const completed = {
      id: 'a3',
      business_id: 'b1',
      services: { name: 'Cut' },
      clients: {
        name: 'Client',
        email: 'c@test.com',
        whatsapp_number: '123',
        viber_user_id: 'v1',
        telegram_id: 't1',
      },
    }
    const dormant = {
      id: 'c1',
      name: 'Dormant',
      email: 'd@test.com',
      whatsapp_number: '123',
      viber_user_id: 'v1',
      telegram_id: 't1',
      business_id: 'b1',
      last_visit_at: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
    }
    const bdayClient = {
      id: 'c2',
      name: 'Bday',
      email: 'b@test.com',
      whatsapp_number: '123',
      viber_user_id: 'v1',
      telegram_id: 't1',
      business_id: 'b1',
      birthday: `2000-${todayMD}`,
    }

    let apptCall = 0
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          apptCall++
          if (apptCall === 1) {
            // 24h
            const c: any = {}
            ;['select', 'gte', 'lte', 'eq'].forEach((m) => (c[m] = vi.fn(() => c)))
            c.then = (r: any) => Promise.resolve({ data: [appt], error: null }).then(r)
            return c
          }
          if (apptCall === 2) {
            // 1h
            const c: any = {}
            ;['select', 'gte', 'lte', 'eq'].forEach((m) => (c[m] = vi.fn(() => c)))
            c.then = (r: any) => Promise.resolve({ data: [appt1h], error: null }).then(r)
            return c
          }
          if (apptCall === 3) {
            // thankyou
            const c: any = {}
            ;['select', 'eq', 'gte', 'lte'].forEach((m) => (c[m] = vi.fn(() => c)))
            c.then = (r: any) => Promise.resolve({ data: [completed], error: null }).then(r)
            return c
          }
        }
        if (table === 'clients') {
          // For reactivation: select where last_visit_at
          // For birthday: select all with birthday not null
          const c: any = {}
          ;['select', 'gte', 'lte', 'not', 'is'].forEach((m) => (c[m] = vi.fn(() => c)))
          // Determine which call: first for reactivation, second for birthday
          // We need to track
          c.then = (r: any) => {
            // Check if caller is reactivation (has gte) vs birthday (has not)
            // For reactivation, we want to return dormant
            // For birthday, return bdayClient
            // We can inspect call stack? Simpler: return both for all, but filter in code does slice(5) === todayMD, so we need to return bdayClient for birthday query, and dormant for reactivation.
            // To distinguish, check if c.not was called? For birthday, code does .not('birthday','is',null)
            // Our mock always returns same, but we can make then return data that contains both types, and the code will filter correctly for birthday?
            // For reactivation, code expects dormant where last_visit_at between 30 days, we return dormant
            // For birthday, it expects allClientsWithBday then filter slice(5) === todayMD
            // So we need to return data that satisfies both: for reactivation query, return [dormant], for birthday return [bdayClient]
            // We can use a counter
            return Promise.resolve({ data: [], error: null }).then(r)
          }
          // Actually we need to handle two different client queries:
          // We'll use a closure counter
          const _clientCall = 0
          const _origNot = c.not
          // Override to track
          return c
        }
        if (table === 'businesses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: biz, error: null })) })),
            })),
          } as any
        }
        if (table === 'notification_log') {
          return { insert: vi.fn(async () => ({ error: null })) } as any
        }
        const c: any = {}
        ;['select', 'gte', 'lte', 'eq', 'not', 'is', 'single', 'insert'].forEach(
          (m) => (c[m] = vi.fn(() => c)),
        )
        c.then = (r: any) => Promise.resolve({ data: [], error: null }).then(r)
        return c
      }),
    } as any)

    // More precise mock for clients to handle both queries
    let clientQueryCount = 0
    const mockCreate = vi.mocked(createClient)
    mockCreate.mockImplementation(() => {
      return {
        from: vi.fn((table: string) => {
          if (table === 'appointments') {
            apptCall++
            if (apptCall === 1) {
              const c: any = {}
              ;['select', 'gte', 'lte', 'eq'].forEach((m) => (c[m] = vi.fn(() => c)))
              c.then = (r: any) => Promise.resolve({ data: [appt], error: null }).then(r)
              return c
            }
            if (apptCall === 2) {
              const c: any = {}
              ;['select', 'gte', 'lte', 'eq'].forEach((m) => (c[m] = vi.fn(() => c)))
              c.then = (r: any) => Promise.resolve({ data: [appt1h], error: null }).then(r)
              return c
            }
            if (apptCall === 3) {
              const c: any = {}
              ;['select', 'eq', 'gte', 'lte'].forEach((m) => (c[m] = vi.fn(() => c)))
              c.then = (r: any) => Promise.resolve({ data: [completed], error: null }).then(r)
              return c
            }
          }
          if (table === 'clients') {
            clientQueryCount++
            if (clientQueryCount === 1) {
              // reactivation
              const c: any = {}
              ;['select', 'gte', 'lte'].forEach((m) => (c[m] = vi.fn(() => c)))
              c.then = (r: any) => Promise.resolve({ data: [dormant], error: null }).then(r)
              return c
            } else {
              // birthday
              const c: any = {}
              ;['select', 'not', 'is'].forEach((m) => (c[m] = vi.fn(() => c)))
              c.not = vi.fn(() => ({
                is: vi.fn(async () => ({ data: [bdayClient], error: null })),
              }))
              return c
            }
          }
          if (table === 'businesses') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: biz, error: null })) })),
              })),
            } as any
          }
          if (table === 'notification_log') {
            return { insert: vi.fn(async () => ({ error: null })) } as any
          }
          const c: any = {}
          ;['select', 'gte', 'lte', 'eq'].forEach((m) => (c[m] = vi.fn(() => c)))
          c.then = (r: any) => Promise.resolve({ data: [], error: null }).then(r)
          return c
        }),
      } as any
    })

    const { GET } = await import('@/app/api/cron/notify/route')
    const req = new NextRequest('http://localhost/api/cron/notify', {
      headers: { authorization: 'Bearer secret' },
    } as any)
    const res = await GET(req as any)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.sent).toBeGreaterThan(0)
    // Should have sent at least 4 types
    expect(j.results.length).toBeGreaterThanOrEqual(4)
  })

  it('cron handles no contact skip and already logged', async () => {
    process.env.CRON_SECRET = 'secret'
    const { createClient } = await import('@supabase/supabase-js')
    const apptNoContact = {
      id: 'a1',
      starts_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      business_id: 'b1',
      services: { name: 'Cut' },
      employees: { name: 'John' },
      clients: {
        name: 'NoContact',
        email: null,
        whatsapp_number: null,
        viber_user_id: null,
        telegram_id: null,
      },
    }
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          const c: any = {}
          ;['select', 'gte', 'lte', 'eq'].forEach((m) => (c[m] = vi.fn(() => c)))
          c.then = (r: any) => Promise.resolve({ data: [apptNoContact], error: null }).then(r)
          return c
        }
        if (table === 'notification_log') {
          return {
            insert: vi.fn(async () => ({ error: { code: '23505', message: 'dup' } })),
          } as any
        }
        const c: any = {}
        ;['select', 'gte', 'lte', 'eq', 'not', 'is'].forEach((m) => (c[m] = vi.fn(() => c)))
        c.then = (r: any) => Promise.resolve({ data: [], error: null }).then(r)
        return c
      }),
    } as any)
    const { GET } = await import('@/app/api/cron/notify/route')
    const req = new NextRequest('http://localhost/api/cron/notify', {
      headers: { authorization: 'Bearer secret' },
    } as any)
    const res = await GET(req as any)
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.sent).toBe(0)
  })
})
