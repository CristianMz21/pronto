import { describe, expect, it } from 'vitest'

import { checkClientLimit } from '@/lib/plan-limits'

describe('plan', () => {
  it('a', async () => {
    expect((await checkClientLimit(null, 'biz', 'self')).allowed).toBe(true)
  })
})
