import { describe, expect, it } from 'vitest'

import { isValidTipAmount } from '@/lib/tips'

describe('tips isValidTipAmount', () => {
  it('0 tip always ok', () => {
    expect(isValidTipAmount(0, 50000).ok).toBe(true)
  })
  it('5k on 50k ok (10%)', () => {
    expect(isValidTipAmount(5000, 50000).ok).toBe(true)
  })
  it('30k on 50k fails (>50%)', () => {
    const r = isValidTipAmount(30000, 50000)
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toBe('tip_exceeds_50_percent')
  })
  it('30k on 50k with manager override ok', () => {
    expect(isValidTipAmount(30000, 50000, { isManager: true }).ok).toBe(true)
  })
  it('negative fails', () => {
    expect(isValidTipAmount(-100, 50000).ok).toBe(false)
  })
})
