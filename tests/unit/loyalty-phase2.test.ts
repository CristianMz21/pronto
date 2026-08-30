import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateEarnPoints,
  calculateRedeemValue,
  canRedeem,
  earnPoints,
  getBalance,
  insufficientCheck,
  redeemPoints,
} from '@/lib/loyalty'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  const m = ['select', 'eq', 'maybeSingle', 'single', 'insert', 'update', 'in', 'order', 'limit']
  m.forEach((k) => {
    c[k] = vi.fn(() => c)
  })
  return c
}

describe('loyalty-phase2', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calculateEarnPoints edges', () => {
    expect(calculateEarnPoints(0)).toBe(0)
    expect(calculateEarnPoints(-10)).toBe(0)
    expect(calculateEarnPoints(999, 1000)).toBe(0)
    expect(calculateEarnPoints(1000, 1000)).toBe(1)
    expect(calculateEarnPoints(1000, 1)).toBe(1000)
    expect(calculateEarnPoints(100_000_000, 1000)).toBe(100000)
  })
  it('calculateRedeemValue edges', () => {
    expect(calculateRedeemValue(0)).toBe(0)
    expect(calculateRedeemValue(-5)).toBe(0)
    expect(calculateRedeemValue(100)).toBe(10000)
    expect(calculateRedeemValue(100, 200, 20000)).toBe(10000)
    expect(calculateRedeemValue(50, 50, 5000)).toBe(5000)
  })
  it('canRedeem and insufficientCheck', () => {
    expect(canRedeem(10, 5)).toBe(true)
    expect(canRedeem(5, 10)).toBe(false)
    expect(canRedeem(10, 0)).toBe(false)
    expect(canRedeem(10, 10.5)).toBe(false)
    expect(canRedeem(10, -1)).toBe(false)
    expect(insufficientCheck(10, 5)).toEqual({ ok: true })
    expect(insufficientCheck(5, 10).ok).toBe(false)
    expect(insufficientCheck(10, 0).reason).toBe('invalid_points')
    expect(insufficientCheck(10, 5.5).reason).toBe('invalid_points')
  })

  describe('getBalance', () => {
    it('invalid uuid throws', async () => {
      const supabase: any = { from: vi.fn(), rpc: vi.fn() }
      await expect(getBalance(supabase, 'not-uuid')).rejects.toThrow(/invalid_client_id/)
    })
    it('returns points when found', async () => {
      const chain = makeChain({ data: { points: 42 }, error: null })
      chain.maybeSingle = vi.fn(async () => ({ data: { points: 42 }, error: null }))
      const supabase: any = {
        from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => chain) })) })),
      }
      expect(await getBalance(supabase, '11111111-1111-4111-a111-111111111111')).toBe(42)
    })
    it('returns 0 when null', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
          })),
        })),
      }
      expect(await getBalance(supabase, '11111111-1111-4111-a111-111111111111')).toBe(0)
    })
    it('throws on error', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: { message: 'db fail' } })),
            })),
          })),
        })),
      }
      await expect(
        getBalance(supabase, '11111111-1111-4111-a111-111111111111'),
      ).rejects.toBeTruthy()
    })
  })

  describe('earnPoints', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    const CLI = '22222222-2222-4222-a222-222222222222'
    const TX = '33333333-3333-4333-a333-333333333333'
    it('validation_failed', async () => {
      const supabase: any = { from: vi.fn(), rpc: vi.fn() }
      await expect(
        earnPoints(supabase, { business_id: 'bad', client_id: CLI, amount: 100 } as any),
      ).rejects.toThrow(/validation_failed/)
    })
    it('earned 0 returns balance via getBalance', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { points: 10 }, error: null })),
            })),
          })),
        })),
        rpc: vi.fn(),
      }
      const res = await earnPoints(supabase, { business_id: BIZ, client_id: CLI, amount: 0 })
      expect(res.earned).toBe(0)
      expect(res.balance).toBe(10)
    })
    it('rpc success path', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: { points: 55 }, error: null })),
        from: vi.fn(),
      }
      const res = await earnPoints(supabase, {
        business_id: BIZ,
        client_id: CLI,
        amount: 5000,
        earn_rate: 1000,
      })
      expect(res.earned).toBe(5)
      expect(res.balance).toBe(55)
      expect(supabase.rpc).toHaveBeenCalledWith(
        'loyalty_earn',
        expect.objectContaining({ p_points: 5 }),
      )
    })
    it('rpc throws then fallback update existing account', async () => {
      const acct = { points: 10 }
      const supabase: any = {
        rpc: vi.fn(async () => {
          throw new Error('rpc down')
        }),
        from: vi.fn((table: string) => {
          if (table === 'loyalty_accounts')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: acct, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              insert: vi.fn(async () => ({ error: null })),
            } as any
          if (table === 'loyalty_movements') return { insert: vi.fn(async () => ({})) } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await earnPoints(supabase, {
        business_id: BIZ,
        client_id: CLI,
        amount: 3000,
        transaction_id: TX,
      })
      expect(res.earned).toBe(3)
      expect(res.balance).toBe(13)
    })
    it('fallback insert when no account', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'no rpc' } })),
        from: vi.fn((table: string) => {
          if (table === 'loyalty_accounts')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              insert: vi.fn(async () => ({ error: null })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          if (table === 'loyalty_movements') return { insert: vi.fn(async () => ({})) } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await earnPoints(supabase, { business_id: BIZ, client_id: CLI, amount: 2000 })
      expect(res.balance).toBe(2)
    })
    it('rpc returns error then fallback', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'some error' } })),
        from: vi.fn((table: string) => {
          if (table === 'loyalty_accounts')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { points: 5 }, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              insert: vi.fn(async () => ({ error: null })),
            } as any
          if (table === 'loyalty_movements') return { insert: vi.fn(async () => ({})) } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await earnPoints(supabase, { business_id: BIZ, client_id: CLI, amount: 4000 })
      expect(res.earned).toBe(4)
    })
  })

  describe('redeemPoints', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    const CLI = '22222222-2222-4222-a222-222222222222'
    it('validation_failed', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { points: 100 }, error: null })),
            })),
          })),
        })),
        rpc: vi.fn(),
      }
      await expect(
        redeemPoints(supabase, { business_id: 'bad', client_id: CLI, points: 10 } as any),
      ).rejects.toThrow(/validation_failed/)
    })
    it('insufficient_points throws via canRedeem', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { points: 5 }, error: null })),
            })),
          })),
        })),
        rpc: vi.fn(),
      }
      await expect(
        redeemPoints(supabase, { business_id: BIZ, client_id: CLI, points: 10 }),
      ).rejects.toThrow(/insufficient_points/)
    })
    it('rpc success redeem', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { points: 50 }, error: null })),
            })),
          })),
        })),
        rpc: vi.fn(async () => ({ data: { points: 40 }, error: null })),
      }
      const res = await redeemPoints(supabase, { business_id: BIZ, client_id: CLI, points: 10 })
      expect(res.redeemed).toBe(10)
      expect(res.balance).toBe(40)
      expect(res.discount).toBe(1000)
    })
    it('rpc error insufficient_points rethrows', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { points: 50 }, error: null })),
            })),
          })),
        })),
        rpc: vi.fn(async () => ({ data: null, error: { message: 'insufficient_points' } })),
      }
      await expect(
        redeemPoints(supabase, { business_id: BIZ, client_id: CLI, points: 10 }),
      ).rejects.toThrow(/insufficient_points/)
    })
    it('fallback manual insufficient then throw', async () => {
      let call = 0
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'loyalty_accounts') {
            call++
            if (call === 1)
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: { points: 20 }, error: null })),
                  })),
                })),
              } as any
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { points: 5 }, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              insert: vi.fn(async () => ({})),
            } as any
          }
          if (table === 'loyalty_movements') return { insert: vi.fn(async () => ({})) } as any
          return makeChain({ data: null, error: null })
        }),
        rpc: vi.fn(async () => ({ data: null, error: { message: 'other' } })),
      }
      await expect(
        redeemPoints(supabase, { business_id: BIZ, client_id: CLI, points: 10 }),
      ).rejects.toThrow(/insufficient_points/)
    })
    it('fallback manual success', async () => {
      let call = 0
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'no rpc' } })),
        from: vi.fn((table: string) => {
          if (table === 'loyalty_accounts') {
            call++
            if (call === 1)
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: { points: 100 }, error: null })),
                  })),
                })),
              } as any
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { points: 100 }, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              insert: vi.fn(async () => ({})),
            } as any
          }
          if (table === 'loyalty_movements') return { insert: vi.fn(async () => ({})) } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await redeemPoints(supabase, { business_id: BIZ, client_id: CLI, points: 20 })
      expect(res.redeemed).toBe(20)
      expect(res.balance).toBe(80)
    })
  })
})
