import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } }),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  }),
}))
import { GET } from '@/app/api/check-slug/route'
describe('check-slug', () => {
  it('invalid', async () => {
    const r = await GET(new Request('http://test?slug=ab'))
    expect((await r.json()).available).toBe(false)
  })
})
