import { describe, it, expect } from 'vitest'

import {
  calculateEarnPoints,
  calculateRedeemValue,
  canRedeem,
  insufficientCheck,
} from '@/lib/loyalty'

describe('loyalty', () => {
  it('earn 1pt per 1k COP', () => {
    expect(calculateEarnPoints(0)).toBe(0)
    expect(calculateEarnPoints(999)).toBe(0)
    expect(calculateEarnPoints(1000)).toBe(1)
    expect(calculateEarnPoints(45000)).toBe(45)
    expect(calculateEarnPoints(123456)).toBe(123)
  })
  it('earn with custom rate', () => {
    expect(calculateEarnPoints(2000, 500)).toBe(4)
  })
  it('redeem 100pts = 10k COP', () => {
    expect(calculateRedeemValue(0)).toBe(0)
    expect(calculateRedeemValue(100)).toBe(10000)
    expect(calculateRedeemValue(45)).toBe(4500)
    expect(calculateRedeemValue(120)).toBe(12000)
  })
  it('redeem with custom rates', () => {
    expect(calculateRedeemValue(100, 100, 10000)).toBe(10000)
    expect(calculateRedeemValue(50, 50, 5000)).toBe(5000)
  })
  it('canRedeem checks insufficient', () => {
    expect(canRedeem(120, 100)).toBe(true)
    expect(canRedeem(50, 100)).toBe(false)
    expect(canRedeem(100, 0)).toBe(false)
  })
  it('insufficientCheck', () => {
    expect(insufficientCheck(100, 50).ok).toBe(true)
    expect(insufficientCheck(50, 100).ok).toBe(false)
    expect(insufficientCheck(50, 100).reason).toBe('insufficient_points')
    expect(insufficientCheck(100, -5).ok).toBe(false)
  })
})
