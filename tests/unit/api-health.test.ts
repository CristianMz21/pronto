import { describe, it, expect } from 'vitest'

import { GET } from '@/app/api/health/route'
describe('health', () => {
  it('a', async () => {
    const r = await GET()
    expect(r.status).toBe(200)
  })
})
