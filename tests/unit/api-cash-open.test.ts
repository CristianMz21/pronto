import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } }),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => true, getIp: () => '1.1.1.1' }))

import { POST } from '@/app/api/cash/open/route'

describe('cash-open', () => {
  it('unauth', async () => {
    const r = await POST({
      headers: { get: () => '1.1.1.1' },
      json: async () => ({ opening_cash: 100 }),
    } as any)
    expect(r.status).toBe(401)
  })
})
