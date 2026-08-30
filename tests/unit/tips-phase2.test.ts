import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTip, isValidTipAmount, reportTips } from '@/lib/tips'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  ;['select', 'insert', 'update', 'eq', 'maybeSingle', 'single'].forEach(
    (m) => (c[m] = vi.fn(() => c)),
  )
  return c
}

describe('tips-phase2', () => {
  beforeEach(() => vi.clearAllMocks())
  it('isValidTipAmount branches', () => {
    expect(isValidTipAmount(0, 50000)).toEqual({ ok: true })
    expect(isValidTipAmount(-1, 50000).ok).toBe(false)
    expect(isValidTipAmount(1.5, 50000).ok).toBe(false)
    expect(isValidTipAmount(100, 0).ok).toBe(false)
    expect(isValidTipAmount(100, -10).ok).toBe(false)
    expect(isValidTipAmount(25000, 50000).ok).toBe(true) // exactly 50%
    expect(isValidTipAmount(25001, 50000).ok).toBe(false)
    expect((isValidTipAmount(25001, 50000) as any).reason).toBe('tip_exceeds_50_percent')
    expect(isValidTipAmount(30000, 50000, { isManager: true }).ok).toBe(true)
    expect(isValidTipAmount(0, 0).ok).toBe(true)
    expect(isValidTipAmount(5.5, 100).ok).toBe(false)
  })
  describe('createTip', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    const TX = '22222222-2222-4222-a222-222222222222'
    const EMP = '33333333-3333-4333-a333-333333333333'
    it('validation_failed', async () => {
      const supabase: any = { from: vi.fn() }
      await expect(
        createTip(supabase, {
          business_id: 'bad',
          transaction_id: TX,
          employee_id: EMP,
          amount: 100,
        } as any),
      ).rejects.toThrow(/validation_failed/)
      await expect(
        createTip(supabase, {
          business_id: BIZ,
          transaction_id: TX,
          employee_id: EMP,
          amount: 0,
        } as any),
      ).rejects.toThrow(/validation_failed/)
    })
    it('tip_create_failed when insert error', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'fail' } })),
            })),
          })),
        })),
      }
      await expect(
        createTip(supabase, {
          business_id: BIZ,
          transaction_id: TX,
          employee_id: EMP,
          amount: 100,
        }),
      ).rejects.toThrow(/tip_create_failed/)
    })
    it('success and updates transactions tip_amount', async () => {
      const tip = {
        id: 't1',
        business_id: BIZ,
        transaction_id: TX,
        employee_id: EMP,
        amount: 500,
        method: 'cash',
        created_at: new Date().toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'tips')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({ single: vi.fn(async () => ({ data: tip, error: null })) })),
              })),
            } as any
          if (table === 'transactions') {
            // first select tip_amount, then update
            const call = 0
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { tip_amount: 100 }, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })),
            } as any
          }
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await createTip(supabase, {
        business_id: BIZ,
        transaction_id: TX,
        employee_id: EMP,
        amount: 500,
        method: 'cash',
      })
      expect(res.id).toBe('t1')
    })
    it('success with null current tip', async () => {
      const tip = {
        id: 't1',
        business_id: BIZ,
        transaction_id: TX,
        employee_id: EMP,
        amount: 100,
        method: 'card',
        created_at: new Date().toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'tips')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({ single: vi.fn(async () => ({ data: tip, error: null })) })),
              })),
            } as any
          if (table === 'transactions')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await createTip(supabase, {
        business_id: BIZ,
        transaction_id: TX,
        employee_id: EMP,
        amount: 100,
        method: 'card',
      })
      expect(res.amount).toBe(100)
    })
    it('swallows transaction update error', async () => {
      const tip = {
        id: 't1',
        business_id: BIZ,
        transaction_id: TX,
        employee_id: EMP,
        amount: 100,
        method: 'cash',
        created_at: new Date().toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'tips')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({ single: vi.fn(async () => ({ data: tip, error: null })) })),
              })),
            } as any
          if (table === 'transactions')
            return {
              select: vi.fn(() => {
                throw new Error('down')
              }),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await createTip(supabase, {
        business_id: BIZ,
        transaction_id: TX,
        employee_id: EMP,
        amount: 100,
      })
      expect(res.id).toBe('t1')
    })
  })
  describe('reportTips', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    it('returns total and byEmployee sorted', async () => {
      const tips = [
        {
          id: '1',
          business_id: BIZ,
          transaction_id: 'tx1',
          employee_id: 'e1',
          amount: 100,
          method: 'cash',
          created_at: '2026-08-10T10:00:00Z',
        },
        {
          id: '2',
          business_id: BIZ,
          transaction_id: 'tx2',
          employee_id: 'e1',
          amount: 200,
          method: 'card',
          created_at: '2026-08-11T10:00:00Z',
        },
        {
          id: '3',
          business_id: BIZ,
          transaction_id: 'tx3',
          employee_id: 'e2',
          amount: 50,
          method: 'cash',
          created_at: '2026-08-12T10:00:00Z',
        },
      ]
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: tips, error: null })) })),
        })),
      }
      const res = await reportTips(supabase, BIZ)
      expect(res.total).toBe(350)
      expect(res.byEmployee[0].employee_id).toBe('e1')
      expect(res.byEmployee[0].total).toBe(300)
      expect(res.byEmployee[0].count).toBe(2)
      expect(res.byEmployee[1].employee_id).toBe('e2')
    })
    it('filters by from/to', async () => {
      const tips = [
        {
          id: '1',
          business_id: BIZ,
          transaction_id: 'tx1',
          employee_id: 'e1',
          amount: 100,
          method: 'cash',
          created_at: '2026-08-10T10:00:00Z',
        },
        {
          id: '2',
          business_id: BIZ,
          transaction_id: 'tx2',
          employee_id: 'e1',
          amount: 200,
          method: 'card',
          created_at: '2026-08-20T10:00:00Z',
        },
      ]
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: tips, error: null })) })),
        })),
      }
      const res = await reportTips(supabase, BIZ, {
        from: '2026-08-15T00:00:00Z',
        to: '2026-08-25T00:00:00Z',
      })
      expect(res.total).toBe(200)
      const res2 = await reportTips(supabase, BIZ, {
        from: '2026-08-01T00:00:00Z',
        to: '2026-08-12T00:00:00Z',
      })
      expect(res2.total).toBe(100)
    })
    it('throws on error', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: { message: 'db fail' } })),
          })),
        })),
      }
      await expect(reportTips(supabase, BIZ)).rejects.toBeTruthy()
    })
    it('empty tips', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
        })),
      }
      const res = await reportTips(supabase, BIZ)
      expect(res.total).toBe(0)
      expect(res.byEmployee.length).toBe(0)
    })
    it('handles string amounts', async () => {
      const tips = [
        {
          id: '1',
          business_id: BIZ,
          transaction_id: 'tx1',
          employee_id: 'e1',
          amount: '100' as any,
          method: 'cash',
          created_at: '2026-08-10T10:00:00Z',
        },
      ]
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: tips, error: null })) })),
        })),
      }
      const res = await reportTips(supabase, BIZ)
      expect(res.total).toBe(100)
    })
    it('filters with null data', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        })),
      }
      const res = await reportTips(supabase, BIZ)
      expect(res.total).toBe(0)
    })
  })
})
