import { describe, expect, it } from 'vitest'
import { applyPromotion, calculateDiscount, evaluatePromotion } from '@/lib/promotions'

const now = new Date('2026-08-20T12:00:00Z')

function basePromo(over: Partial<import('@/lib/promotions').Promotion> = {}) {
  return {
    id: 'p1',
    business_id: 'b1',
    location_id: null,
    name: 'Test',
    type: 'percent' as const,
    value: 20,
    promo_code: null,
    valid_from: new Date('2020-01-01T00:00:00Z').toISOString(),
    valid_to: new Date('2030-01-01T00:00:00Z').toISOString(),
    rules: {},
    is_active: true,
    ...over,
  } as import('@/lib/promotions').Promotion
}

describe('promotions-phase2 exhaustive', () => {
  it('inactive, future, past and invalid dates', () => {
    expect(evaluatePromotion({ ...basePromo({ is_active: false }) }, { now }).eligible).toBe(false)
    const future = basePromo({ valid_from: new Date(now.getTime() + 100000).toISOString() })
    expect(evaluatePromotion(future, { now }).eligible).toBe(false)
    const past = basePromo({ valid_to: new Date(now.getTime() - 1000).toISOString() })
    expect(evaluatePromotion(past, { now }).eligible).toBe(false)
    const invalidFrom = basePromo({ valid_from: 'invalid-date' })
    expect(evaluatePromotion(invalidFrom, { amount: 100 }).eligible).toBe(true)
    const invalidTo = basePromo({ valid_to: 'invalid-date' })
    expect(evaluatePromotion(invalidTo, { amount: 100 }).eligible).toBe(true)
  })

  it('promo_code mismatch and case insensitive match', () => {
    const p = basePromo({ promo_code: 'WELCOME20' })
    const res1 = evaluatePromotion(p, { promoCode: 'wrong', now })
    expect(res1.eligible).toBe(false)
    expect(res1.reason).toBe('promo_code_mismatch')
    expect(evaluatePromotion(p, { promoCode: 'welcome20', now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { promoCode: null, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { promoCode: undefined, now }).eligible).toBe(true)
  })

  it('day_of_week mismatch vs match and no date', () => {
    const p = basePromo({ rules: { day_of_week: [1] } })
    const r1 = evaluatePromotion(p, { date: '2026-01-04', now })
    expect(r1.eligible).toBe(false)
    expect(r1.reason).toBe('day_of_week')
    expect(evaluatePromotion(p, { date: '2026-01-05', now }).eligible).toBe(true)
    const r2 = evaluatePromotion(p, { now } as any)
    expect(r2.eligible).toBe(false)
    expect(evaluatePromotion(p, { date: 'invalid', now }).eligible).toBe(false)
    expect(evaluatePromotion(basePromo(), { now }).eligible).toBe(true)
    expect(evaluatePromotion(basePromo({ rules: { day_of_week: [] } }), { now }).eligible).toBe(
      true,
    )
  })

  it('service_ids matching', () => {
    const sid1 = '11111111-1111-4111-a111-111111111111'
    const sid2 = '22222222-2222-4222-a222-222222222222'
    const p = basePromo({ rules: { service_ids: [sid1] } })
    const r1 = evaluatePromotion(p, { serviceIds: [sid2], now })
    expect(r1.eligible).toBe(false)
    expect(r1.reason).toBe('service_ids')
    expect(evaluatePromotion(p, { serviceIds: [sid1], now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { serviceIds: [], now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { now } as any).eligible).toBe(false)
    expect(evaluatePromotion(p, { serviceIds: [sid1, sid2], now }).eligible).toBe(true)
    expect(
      evaluatePromotion(basePromo({ rules: { service_ids: [] } }), { serviceIds: [], now })
        .eligible,
    ).toBe(true)
    expect(evaluatePromotion(basePromo(), { serviceIds: [], now }).eligible).toBe(true)
  })

  it('client_segment vip', () => {
    const p = basePromo({ rules: { client_segment: 'vip' } })
    expect(evaluatePromotion(p, { client: { tags: ['vip'] }, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { client: { tags: ['VIP'] }, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { client: { tags: ['regular'] }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { client: null, now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { client: undefined, now }).eligible).toBe(false)
  })

  it('client_segment birthday within 7 days', () => {
    const bdIn3 = new Date(now)
    bdIn3.setDate(now.getDate() + 3)
    const isoIn3 = bdIn3.toISOString().slice(0, 10)
    const p = basePromo({ rules: { client_segment: 'birthday' as const } })
    expect(evaluatePromotion(p, { client: { birthday: isoIn3 }, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { client: { birthday: '1990-01-01' }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { client: { birthday: null }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { client: null, now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { client: { birthday: 'invalid' }, now }).eligible).toBe(false)
  })

  it('client_segment new 1-2 visits vs 0 vs 3+', () => {
    const p = basePromo({ rules: { client_segment: 'new' as const } })
    expect(evaluatePromotion(p, { client: { total_visits: 1 }, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { client: { total_visits: 2 }, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { client: { total_visits: 0 }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { client: { total_visits: 3 }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p, { client: { total_visits: 10 }, now }).eligible).toBe(false)
  })

  it('client_segment frequent >=10', () => {
    const p = basePromo({ rules: { client_segment: 'frequent' as const } })
    expect(evaluatePromotion(p, { client: { total_visits: 10 }, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { client: { total_visits: 9 }, now }).eligible).toBe(false)
  })

  it('client_segment inactive_30/42/60 with last_visit and no last_visit', () => {
    const recent = new Date(now.getTime() - 5 * 86400000).toISOString()
    const old35 = new Date(now.getTime() - 35 * 86400000).toISOString()
    const old45 = new Date(now.getTime() - 45 * 86400000).toISOString()
    const old65 = new Date(now.getTime() - 65 * 86400000).toISOString()
    const p30 = basePromo({ rules: { client_segment: 'inactive_30' as const } })
    expect(evaluatePromotion(p30, { client: { last_visit_at: old35 }, now }).eligible).toBe(true)
    expect(evaluatePromotion(p30, { client: { last_visit_at: recent }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p30, { client: { last_visit_at: null }, now }).eligible).toBe(true)
    const p42 = basePromo({ rules: { client_segment: 'inactive_42' as const } })
    expect(evaluatePromotion(p42, { client: { last_visit_at: old35 }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p42, { client: { last_visit_at: old45 }, now }).eligible).toBe(true)
    const p60 = basePromo({ rules: { client_segment: 'inactive_60' as const } })
    expect(evaluatePromotion(p60, { client: { last_visit_at: old45 }, now }).eligible).toBe(false)
    expect(evaluatePromotion(p60, { client: { last_visit_at: old65 }, now }).eligible).toBe(true)
    const pall = basePromo({ rules: { client_segment: 'all' as const } })
    expect(evaluatePromotion(pall, { client: null, now }).eligible).toBe(true)
    const pNone = basePromo({ rules: {} })
    expect(evaluatePromotion(pNone, { client: null, now }).eligible).toBe(true)
  })

  it('min_amount', () => {
    const p = basePromo({ rules: { min_amount: 50000 } })
    const r1 = evaluatePromotion(p, { amount: 40000, now })
    expect(r1.eligible).toBe(false)
    expect(r1.reason).toBe('min_amount')
    expect(evaluatePromotion(p, { amount: 50000, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { amount: 60000, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { amount: undefined as any, now }).eligible).toBe(false)
  })

  it('location mismatch', () => {
    const loc = '33333333-3333-4333-a333-333333333333'
    const other = '44444444-4444-4444-a444-444444444444'
    const p = basePromo({ location_id: loc })
    const r1 = evaluatePromotion(p, { locationId: other, now })
    expect(r1.eligible).toBe(false)
    expect(r1.reason).toBe('location')
    expect(evaluatePromotion(p, { locationId: loc, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { locationId: null as any, now }).eligible).toBe(true)
    expect(evaluatePromotion(p, { now } as any).eligible).toBe(true)
    expect(
      evaluatePromotion(basePromo({ location_id: null }), { locationId: other, now }).eligible,
    ).toBe(true)
  })

  it('calculateDiscount branches', () => {
    expect(calculateDiscount(basePromo({ type: 'percent', value: 0 }), 10000)).toBe(0)
    expect(calculateDiscount(basePromo({ type: 'percent', value: 20 }), 0)).toBe(0)
    expect(calculateDiscount(basePromo({ type: 'percent', value: 20 }), -100)).toBe(0)
    expect(calculateDiscount(basePromo({ type: 'percent', value: 20 }), 10000)).toBe(2000)
    expect(calculateDiscount(basePromo({ type: 'percent', value: 100 }), 5000)).toBe(5000)
    expect(calculateDiscount(basePromo({ type: 'percent', value: 150 }), 10000)).toBe(10000)
    expect(calculateDiscount(basePromo({ type: 'percent', value: -10 }), 10000)).toBe(0)
    expect(calculateDiscount(basePromo({ type: 'fixed', value: 5000 }), 10000)).toBe(5000)
    expect(calculateDiscount(basePromo({ type: 'fixed', value: 20000 }), 10000)).toBe(10000)
    expect(calculateDiscount(basePromo({ type: 'fixed', value: 0 }), 10000)).toBe(0)
    expect(calculateDiscount(basePromo({ type: 'combo', value: 15000 }), 50000)).toBe(15000)
    expect(calculateDiscount(basePromo({ type: 'combo', value: 60000 }), 50000)).toBe(50000)
    const unknown = { ...basePromo(), type: 'unknown' } as any
    expect(calculateDiscount(unknown, 10000)).toBe(0)
  })

  it('applyPromotion happy and errors', () => {
    const p = basePromo()
    const res = applyPromotion(p, { amount: 10000, now })
    expect(res.discount).toBe(2000)
    expect(res.finalAmount).toBe(8000)
    expect(() => applyPromotion(p, { amount: 10000, alreadyDiscounted: true } as any)).toThrow(
      /promo_stack_guard/,
    )
    const inactive = basePromo({ is_active: false })
    expect(() => applyPromotion(inactive, { amount: 10000, now })).toThrow(/promo_not_eligible/)
    try {
      applyPromotion(inactive, { amount: 10000, now })
    } catch (e) {
      expect((e as any).code).toBe('promo_not_eligible')
      expect((e as any).reason).toBe('inactive_or_expired')
    }
  })
})
