import { describe, it, expect } from 'vitest'

import { getAuthUser } from '@/lib/auth-user'
describe('auth-user', () => {
  it('exists', () => {
    expect(typeof getAuthUser).toBe('function')
  })
})
