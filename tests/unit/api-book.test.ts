import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '1.1.1.1' }))
import { POST } from '@/app/api/book/route'
describe('book', () => {
  it('rate limited', async () => {
    const r = await POST({
      headers: { get: () => '' },
      json: async () => ({
        businessId: '00000000-0000-4000-a000-000000000001',
        serviceId: '00000000-0000-4000-a000-000000000002',
        date: '2026-01-15',
        time: '10:00',
        name: 'A',
        phone: '123',
      }),
    } as any)
    expect(r.status).toBe(429)
  })
})
