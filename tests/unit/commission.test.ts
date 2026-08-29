import { describe, expect, it } from 'vitest'

import { calcCommission } from '@/lib/commission'

describe('calcCommission — lib/commission.ts (043 trigger)', () => {
  it('percentage 50% of 30000 = 15000', () => {
    expect(calcCommission(30000, 50, null)).toEqual({ amount: 15000, type: 'percentage' })
  })
  it('percentage 50% of 45000 = 22500', () => {
    expect(calcCommission(45000, 50, null)).toEqual({ amount: 22500, type: 'percentage' })
  })
  it('fixed 10000 takes priority over rate', () => {
    expect(calcCommission(20000, 50, 10000)).toEqual({ amount: 10000, type: 'fixed' })
  })
  it('fixed 0 ignored, uses percentage', () => {
    expect(calcCommission(30000, 50, 0)).toEqual({ amount: 15000, type: 'percentage' })
  })
  it('no rate nor fixed => 0', () => {
    expect(calcCommission(30000, null, null)).toEqual({ amount: 0, type: null })
    expect(calcCommission(30000, 0, null)).toEqual({ amount: 0, type: null })
  })
  it('rounds to 2 decimals', () => {
    expect(calcCommission(100, 33.33, null).amount).toBe(33.33)
    expect(calcCommission(10, 33.333, null).amount).toBe(3.33)
  })
})
