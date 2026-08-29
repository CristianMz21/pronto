import { describe, it, expect } from 'vitest'

import { isEligible } from '@/lib/memberships'

describe('memberships.isEligible', () => {
  it('active with remaining and future expiry is eligible', () => {
    const cm = {
      remaining: 2,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'active',
    }
    expect(isEligible(cm)).toBe(true)
  })
  it('remaining 0 not eligible', () => {
    const cm = {
      remaining: 0,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'active',
    }
    expect(isEligible(cm)).toBe(false)
  })
  it('expired not eligible', () => {
    const cm = {
      remaining: 1,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      status: 'active',
    }
    expect(isEligible(cm)).toBe(false)
  })
  it('cancelled not eligible', () => {
    const cm = {
      remaining: 5,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'cancelled',
    }
    expect(isEligible(cm)).toBe(false)
  })
  it('expired status not eligible', () => {
    const cm = {
      remaining: 5,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'expired',
    }
    expect(isEligible(cm)).toBe(false)
  })
  it('custom now param works', () => {
    const future = new Date('2030-01-01T00:00:00Z').toISOString()
    const cm = { remaining: 1, expires_at: future, status: 'active' }
    expect(isEligible(cm, new Date('2029-12-31'))).toBe(true)
    expect(isEligible(cm, new Date('2030-01-02'))).toBe(false)
  })
})
