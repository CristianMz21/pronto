import { describe, expect, it } from 'vitest'
import { calcAvgTicket, getTopBarbers, newVsReturning, reportSalesByBarber } from '@/lib/reports'
import { findBestCombo } from '@/lib/service-combos'

describe('reports-phase2', () => {
  it('calcAvgTicket empty, single, rounding', () => {
    expect(calcAvgTicket([])).toBe(0)
    expect(calcAvgTicket(null as any)).toBe(0)
    expect(calcAvgTicket([{ amount: 100 }])).toBe(100)
    expect(calcAvgTicket([{ amount: 10 }, { amount: 20 }])).toBe(15)
    expect(calcAvgTicket([{ amount: 0.1 }, { amount: 0.2 }])).toBeCloseTo(0.15)
    expect(calcAvgTicket([{ amount: '100' as any }])).toBe(100)
    expect(calcAvgTicket([{ amount: null as any }])).toBe(0)
  })
  it('getTopBarbers limit and unassigned filtered', () => {
    const txs = [
      { employee_id: 'e1', amount: 100 },
      { employee_id: 'e1', amount: 200 },
      { employee_id: 'e2', amount: 500 },
      { employee_id: null, amount: 1000 },
      { employee_id: 'e3', amount: 50 },
    ]
    const top = getTopBarbers(txs as any, 2)
    expect(top.length).toBe(2)
    expect(top[0].employee_id).toBe('e2')
    expect(top[0].total).toBe(500)
    expect(top[1].employee_id).toBe('e1')
    expect(top[1].total).toBe(300)
    expect(top.some((x) => x.employee_id === '__unassigned')).toBe(false)
    const all = getTopBarbers(txs as any)
    expect(all.length).toBe(3)
    // rounding
    const txs2 = [
      { employee_id: 'e1', amount: 0.105 },
      { employee_id: 'e1', amount: 0.105 },
    ]
    expect(getTopBarbers(txs2 as any)[0].total).toBeCloseTo(0.21)
  })
  it('newVsReturning', () => {
    expect(newVsReturning([])).toEqual({ newCount: 0, returningCount: 0 })
    expect(
      newVsReturning([
        { id: 'c1', total_visits: 0 },
        { id: 'c2', total_visits: 2 },
        { id: 'c3', total_visits: 3 },
        { id: 'c4', total_visits: 10 },
      ]),
    ).toEqual({ newCount: 2, returningCount: 2 })
    expect(newVsReturning([{ id: 'c1', total_visits: null as any }]).newCount).toBe(1)
  })
  it('reportSalesByBarber grouping and rounding', () => {
    const txs = [
      { employee_id: 'e1', amount: 100 },
      { employee_id: 'e1', amount: 0.15 },
      { employee_id: null, amount: 50 },
    ]
    const res = reportSalesByBarber(txs as any)
    expect(res['e1']).toBeCloseTo(100.15)
    expect(res['unassigned']).toBe(50)
    expect(reportSalesByBarber([])).toEqual({})
    expect(reportSalesByBarber([{ amount: null as any } as any]).unassigned).toBe(0)
  })
})

describe('service-combos-phase2', () => {
  const SVC1 = '11111111-1111-4111-a111-111111111111'
  const SVC2 = '22222222-2222-4222-a222-222222222222'
  const SVC3 = '33333333-3333-4333-a333-333333333333'
  it('findBestCombo inactive or empty', () => {
    const combos = [
      {
        id: 'c1',
        business_id: 'b1',
        location_id: null,
        name: 'Combo1',
        service_ids: [SVC1, SVC2],
        price: 80,
        duration_min: 60,
        is_active: false,
      },
      {
        id: 'c2',
        business_id: 'b1',
        location_id: null,
        name: 'Combo2',
        service_ids: [],
        price: 10,
        duration_min: 30,
        is_active: true,
      },
    ]
    expect(
      findBestCombo(combos as any, [
        { id: SVC1, price: 50 },
        { id: SVC2, price: 50 },
      ]).combo,
    ).toBeNull()
  })
  it('comboApplies requires all services', () => {
    const combo = {
      id: 'c1',
      business_id: 'b1',
      location_id: null,
      name: 'C',
      service_ids: [SVC1, SVC2],
      price: 80,
      duration_min: 60,
      is_active: true,
    }
    expect(findBestCombo([combo] as any, [{ id: SVC1, price: 50 }]).combo).toBeNull()
    expect(
      findBestCombo([combo] as any, [
        { id: SVC1, price: 50 },
        { id: SVC2, price: 50 },
      ]).combo?.id,
    ).toBe('c1')
    expect(
      findBestCombo([combo] as any, [
        { id: SVC1, price: 50 },
        { id: SVC2, price: 50 },
        { id: SVC3, price: 50 },
      ]).discount,
    ).toBe(20) // 100-80
  })
  it('discount 0 when combo price >= sum', () => {
    const combo = {
      id: 'c1',
      business_id: 'b1',
      location_id: null,
      name: 'C',
      service_ids: [SVC1],
      price: 100,
      duration_min: 30,
      is_active: true,
    }
    const res = findBestCombo([combo] as any, [{ id: SVC1, price: 50 }])
    expect(res.combo).toBeNull() // discount 0 => not best
    expect(res.discount).toBe(0)
  })
  it('picks best discount among multiple', () => {
    const c1 = {
      id: 'c1',
      business_id: 'b1',
      location_id: null,
      name: 'C1',
      service_ids: [SVC1],
      price: 40,
      duration_min: 30,
      is_active: true,
    } // 10 discount
    const c2 = {
      id: 'c2',
      business_id: 'b1',
      location_id: null,
      name: 'C2',
      service_ids: [SVC1, SVC2],
      price: 70,
      duration_min: 60,
      is_active: true,
    } // 30 discount (50+50-70)
    const cart = [
      { id: SVC1, price: 50 },
      { id: SVC2, price: 50 },
    ]
    const res = findBestCombo([c1, c2] as any, cart)
    expect(res.combo?.id).toBe('c2')
    expect(res.discount).toBe(30)
  })
  it('empty combos', () => {
    expect(findBestCombo([], [{ id: SVC1, price: 50 }]).combo).toBeNull()
  })
  it('handles string price', () => {
    const combo = {
      id: 'c1',
      business_id: 'b1',
      location_id: null,
      name: 'C',
      service_ids: [SVC1],
      price: 30,
      duration_min: 30,
      is_active: true,
    }
    const res = findBestCombo([combo] as any, [{ id: SVC1, price: '50' as any }])
    expect(res.discount).toBe(20)
  })
})
