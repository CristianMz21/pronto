import { describe, expect, it } from 'vitest'

import { calcAvgTicket, getTopBarbers, newVsReturning } from '@/lib/reports'

describe('reports helpers', () => {
  it('avgTicket = sum/count', () => {
    expect(calcAvgTicket([])).toBe(0)
    expect(calcAvgTicket([{ amount: 100 }, { amount: 200 }])).toBe(150)
    expect(calcAvgTicket([{ amount: 30000 }, { amount: 30000 }, { amount: 40000 }])).toBe(33333.33)
  })
  it('topBarbers sorts descending', () => {
    const txs = [
      { amount: 100, employee_id: 'a' },
      { amount: 350, employee_id: 'b' },
      { amount: 200, employee_id: 'a' },
      { amount: 50, employee_id: 'c' },
    ]
    const top = getTopBarbers(txs, 2)
    expect(top[0].employee_id).toBe('b')
    expect(top[0].total).toBe(350)
    expect(top[1].employee_id).toBe('a')
    expect(top[1].total).toBe(300)
    expect(top[1].count).toBe(2)
  })
  it('newVsReturning counts <3 as new', () => {
    const stats = [
      { id: '1', total_visits: 1 },
      { id: '2', total_visits: 5 },
      { id: '3', total_visits: 2 },
      { id: '4', total_visits: 10 },
    ]
    const { newCount, returningCount } = newVsReturning(stats)
    expect(newCount).toBe(2)
    expect(returningCount).toBe(2)
  })
})
