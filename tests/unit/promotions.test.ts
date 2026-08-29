import { describe, it, expect } from 'vitest'
import { evaluatePromotion, calculateDiscount } from '@/lib/promotions'

const basePromo = {
  id: 'p1',
  business_id: 'b1',
  location_id: null,
  name: 'Test',
  type: 'percent' as const,
  value: 20,
  promo_code: null,
  valid_from: new Date(Date.now() - 86400000).toISOString(),
  valid_to: new Date(Date.now() + 86400000).toISOString(),
  rules: {} as Record<string, unknown>,
  is_active: true,
}

describe('promotions.evaluate', () => {
  it('eligible when active and no rules', () => {
    expect(evaluatePromotion(basePromo, { amount: 50000 }).eligible).toBe(true)
  })
  it('inactive not eligible', () => {
    expect(evaluatePromotion({ ...basePromo, is_active: false }, { amount: 50000 }).eligible).toBe(false)
  })
  it('expired not eligible', () => {
    expect(evaluatePromotion({ ...basePromo, valid_to: new Date(Date.now() - 1000).toISOString() }, { amount: 50000 }).eligible).toBe(false)
  })
  it('not yet started not eligible', () => {
    expect(evaluatePromotion({ ...basePromo, valid_from: new Date(Date.now() + 86400000).toISOString() }, { amount: 50000 }).eligible).toBe(false)
  })
  it('day_of_week mismatch not eligible', () => {
    const p = { ...basePromo, rules: { day_of_week: [1] } } // Monday
    // Assume today is not Monday, pick a date that is Sunday
    expect(evaluatePromotion(p, { date: '2026-01-04' }).eligible).toBe(false) // 2026-01-04 is Sunday (0)
    expect(evaluatePromotion(p, { date: '2026-01-05' }).eligible).toBe(true) // Monday
  })
  it('service_ids rule', () => {
    const p = { ...basePromo, rules: { service_ids: ['svc1'] } }
    expect(evaluatePromotion(p, { serviceIds: ['svc2'] }).eligible).toBe(false)
    expect(evaluatePromotion(p, { serviceIds: ['svc1'] }).eligible).toBe(true)
  })
  it('client_segment birthday', () => {
    const now = new Date()
    const bd = new Date(now); bd.setDate(now.getDate() + 3)
    const iso = bd.toISOString().slice(0, 10)
    const p = { ...basePromo, rules: { client_segment: 'birthday' as const } }
    expect(evaluatePromotion(p, { client: { birthday: iso } }).eligible).toBe(true)
    expect(evaluatePromotion(p, { client: { birthday: '1990-01-01' } }).eligible).toBe(false)
  })
  it('stack guard via applyPromotion throws when alreadyDiscounted', async () => {
    const { applyPromotion } = await import('@/lib/promotions')
    expect(() => applyPromotion(basePromo, { amount: 50000, alreadyDiscounted: true })).toThrow()
  })
})

describe('promotions.calculateDiscount', () => {
  it('percent', () => {
    expect(calculateDiscount({ ...basePromo, type: 'percent', value: 20 }, 10000)).toBe(2000)
    expect(calculateDiscount({ ...basePromo, type: 'percent', value: 100 }, 5000)).toBe(5000)
    expect(calculateDiscount({ ...basePromo, type: 'percent', value: 150 }, 10000)).toBe(10000) // capped 100%
  })
  it('fixed', () => {
    expect(calculateDiscount({ ...basePromo, type: 'fixed', value: 5000 }, 10000)).toBe(5000)
    expect(calculateDiscount({ ...basePromo, type: 'fixed', value: 20000 }, 10000)).toBe(10000) // capped to amount
  })
  it('combo fixed', () => {
    expect(calculateDiscount({ ...basePromo, type: 'combo', value: 15000 }, 50000)).toBe(15000)
  })
})
