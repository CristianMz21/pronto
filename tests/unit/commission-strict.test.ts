import fc from 'fast-check'
import { describe, it, expect } from 'vitest'

import { calcCommission } from '@/lib/commission'

describe('commission strict 100%', () => {
  it('fixed priority over rate', () => {
    expect(calcCommission(100, 10, 5)).toEqual({ amount: 5, type: 'fixed' })
    expect(calcCommission(100, 50, 1)).toEqual({ amount: 1, type: 'fixed' })
  })
  it('fixed positive', () => {
    expect(calcCommission(100, null, 5)).toEqual({ amount: 5, type: 'fixed' })
    expect(calcCommission(100, undefined, 5.555)).toEqual({ amount: 5.56, type: 'fixed' })
    expect(calcCommission(100, 0, 10.004)).toEqual({ amount: 10, type: 'fixed' })
  })
  it('fixed 0 and negative => not fixed, falls through', () => {
    expect(calcCommission(100, 10, 0)).toEqual({ amount: 10, type: 'percentage' })
    expect(calcCommission(100, 10, -5)).toEqual({ amount: 10, type: 'percentage' })
    expect(calcCommission(100, null, 0)).toEqual({ amount: 0, type: null })
    expect(calcCommission(100, null, -1)).toEqual({ amount: 0, type: null })
  })
  it('percentage', () => {
    expect(calcCommission(100, 10, null)).toEqual({ amount: 10, type: 'percentage' })
    expect(calcCommission(200, 15, null)).toEqual({ amount: 30, type: 'percentage' })
    expect(calcCommission(100, 12.5, null)).toEqual({ amount: 12.5, type: 'percentage' })
  })
  it('percentage rounding', () => {
    expect(calcCommission(100, 33.333, null).amount).toBe(33.33)
    expect(calcCommission(10, 33.333, null).amount).toBe(3.33)
  })
  it('rate 0 => null', () => {
    expect(calcCommission(100, 0, null)).toEqual({ amount: 0, type: null })
    expect(calcCommission(100, -5, null)).toEqual({ amount: 0, type: null })
  })
  it('both null => 0 null', () => {
    expect(calcCommission(100, null, null)).toEqual({ amount: 0, type: null })
    expect(calcCommission(100, undefined, undefined)).toEqual({ amount: 0, type: null })
  })
  it('amount 0 with rate => 0 percentage', () => {
    expect(calcCommission(0, 10, null)).toEqual({ amount: 0, type: 'percentage' })
  })
  it('val >0 ? val : 0 branch', () => {
    // amount * rate /100 very small => Math.round(...*100)/100 => 0
    expect(calcCommission(0.01, 1, null)).toEqual({ amount: 0, type: 'percentage' })
    expect(calcCommission(0, 10, null).amount).toBe(0)
  })
  it('large amount', () => {
    expect(calcCommission(1e6, 10, null).amount).toBe(100000)
  })
  it('fixed takes precedence even if rate larger', () => {
    expect(calcCommission(1000, 50, 5).type).toBe('fixed')
  })
  it('property: amount never negative', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (amt, rate, fixed) => {
          const r = calcCommission(amt, rate, fixed)
          expect(r.amount).toBeGreaterThanOrEqual(0)
          expect(['fixed', 'percentage', null]).toContain(r.type)
        },
      ),
    )
  })
  it('property: fixed branch rounding is 2 decimals', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1000, noNaN: true }), (fixed) => {
        const r = calcCommission(100, null, fixed)
        if (fixed > 0) {
          expect(r.amount).toBe(Math.round(fixed * 100) / 100)
        }
      }),
    )
  })
})
