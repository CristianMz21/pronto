import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } }),
}))

import { PATCH } from '@/app/api/business/modules/route'

describe('business-modules', () => {
  it('unauth', async () => {
    const r = await PATCH(
      new Request('http://test', {
        method: 'PATCH',
        body: JSON.stringify({ enabled_modules: [] }),
      }) as any,
    )
    expect(r.status).toBe(401)
  })
})
