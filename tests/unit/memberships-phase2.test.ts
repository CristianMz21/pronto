import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeMembership, isEligible, purchaseMembership } from '@/lib/memberships'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  ;['select', 'insert', 'update', 'eq', 'maybeSingle', 'single', 'in', 'order'].forEach(
    (m) => (c[m] = vi.fn(() => c)),
  )
  return c
}

describe('memberships-phase2', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('isEligible edges', () => {
    it('status active remaining>0 future => true', () => {
      expect(
        isEligible({
          remaining: 1,
          expires_at: new Date(Date.now() + 100000).toISOString(),
          status: 'active',
        }),
      ).toBe(true)
    })
    it('status not active false', () => {
      expect(
        isEligible({
          remaining: 5,
          expires_at: new Date(Date.now() + 100000).toISOString(),
          status: 'cancelled',
        }),
      ).toBe(false)
    })
    it('remaining 0 false', () => {
      expect(
        isEligible({
          remaining: 0,
          expires_at: new Date(Date.now() + 100000).toISOString(),
          status: 'active',
        }),
      ).toBe(false)
    })
    it('expired false', () => {
      expect(
        isEligible({
          remaining: 5,
          expires_at: new Date(Date.now() - 1000).toISOString(),
          status: 'active',
        }),
      ).toBe(false)
    })
    it('invalid date false', () => {
      expect(isEligible({ remaining: 5, expires_at: 'invalid', status: 'active' })).toBe(false)
    })
    it('exactly now expiry false (must be >)', () => {
      const now = new Date()
      expect(
        isEligible({ remaining: 1, expires_at: now.toISOString(), status: 'active' }, now),
      ).toBe(false)
    })
  })

  describe('purchaseMembership', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    const CLI = '22222222-2222-4222-a222-222222222222'
    const MID = '33333333-3333-4333-a333-333333333333'
    const CMID = '44444444-4444-4444-a444-444444444444'
    it('validation_failed', async () => {
      const supabase: any = { from: vi.fn() }
      await expect(
        purchaseMembership(supabase, {
          business_id: 'bad',
          client_id: CLI,
          membership_id: MID,
        } as any),
      ).rejects.toThrow(/validation_failed/)
    })
    it('membership_not_found', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            })),
          })),
        })),
      }
      await expect(
        purchaseMembership(supabase, { business_id: BIZ, client_id: CLI, membership_id: MID }),
      ).rejects.toThrow(/membership_not_found/)
      const supabase2: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: { message: 'db err' } })),
              })),
            })),
          })),
        })),
      }
      await expect(
        purchaseMembership(supabase2, { business_id: BIZ, client_id: CLI, membership_id: MID }),
      ).rejects.toThrow(/membership_not_found/)
    })
    it('purchase_failed when insert error', async () => {
      const mem = { id: MID, business_id: BIZ, duration_days: 30, benefits: { cuts: 4 } }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'memberships')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: mem, error: null })),
                  })),
                })),
              })),
            } as any
          if (table === 'client_memberships')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: { message: 'insert fail' } })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      await expect(
        purchaseMembership(supabase, { business_id: BIZ, client_id: CLI, membership_id: MID }),
      ).rejects.toThrow(/purchase_failed/)
    })
    it('success with cuts default', async () => {
      const mem = { id: MID, business_id: BIZ, duration_days: 30, benefits: {} }
      const cm = {
        id: CMID,
        business_id: BIZ,
        client_id: CLI,
        membership_id: MID,
        remaining: 4,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'memberships')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: mem, error: null })),
                  })),
                })),
              })),
            } as any
          if (table === 'client_memberships')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({ single: vi.fn(async () => ({ data: cm, error: null })) })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await purchaseMembership(supabase, {
        business_id: BIZ,
        client_id: CLI,
        membership_id: MID,
      })
      expect(res.id).toBe(CMID)
    })
    it('success with custom cuts', async () => {
      const mem = { id: MID, business_id: BIZ, duration_days: 10, benefits: { cuts: 10 } }
      const cm = {
        id: CMID,
        business_id: BIZ,
        client_id: CLI,
        membership_id: MID,
        remaining: 10,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'memberships')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: mem, error: null })),
                  })),
                })),
              })),
            } as any
          if (table === 'client_memberships')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({ single: vi.fn(async () => ({ data: cm, error: null })) })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await purchaseMembership(supabase, {
        business_id: BIZ,
        client_id: CLI,
        membership_id: MID,
      })
      expect(res.remaining).toBe(10)
    })
  })

  describe('consumeMembership', () => {
    const CMID = '44444444-4444-4444-a444-444444444444'
    it('validation_failed', async () => {
      const supabase: any = { rpc: vi.fn(), from: vi.fn() }
      await expect(consumeMembership(supabase, 'not-uuid')).rejects.toThrow(/validation_failed/)
    })
    it('rpc success', async () => {
      const updated = { id: CMID, remaining: 2 }
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: updated, error: null })),
        from: vi.fn(),
      }
      const res = await consumeMembership(supabase, CMID)
      expect(res.remaining).toBe(2)
      expect(supabase.rpc).toHaveBeenCalledWith('consume_membership', {
        p_client_membership_id: CMID,
      })
    })
    it('rpc error no_uses_left throws', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'membership_no_uses_left' } })),
        from: vi.fn(),
      }
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/no_uses_left/)
    })
    it('rpc error membership_expired throws', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'membership_expired' } })),
        from: vi.fn(),
      }
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/membership_expired/)
    })
    it('rpc error membership_not_found throws', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'membership_not_found' } })),
        from: vi.fn(),
      }
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/membership_not_found/)
    })
    it('rpc throws exception with code then rethrow', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => {
          throw new Error('membership_expired boom')
        }),
        from: vi.fn(),
      }
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/membership_expired/)
    })
    it('rpc missing then fallback fetch not found throws', async () => {
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'does not exist' } })),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })),
          })),
        })),
      }
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/membership_not_found/)
    })
    it('fallback not eligible remaining 0 throws no_uses_left', async () => {
      const current = {
        id: CMID,
        remaining: 0,
        expires_at: new Date(Date.now() + 100000).toISOString(),
        status: 'active',
      }
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'does not exist' } })),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: current, error: null })) })),
          })),
        })),
      }
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/no_uses_left/)
    })
    it('fallback expired throws membership_expired', async () => {
      const current = {
        id: CMID,
        remaining: 5,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        status: 'active',
      }
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'does not exist' } })),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: current, error: null })) })),
          })),
        })),
      }
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/membership_expired/)
    })
    it('fallback atomic decrement success and remaining 0 triggers status update', async () => {
      const current = {
        id: CMID,
        remaining: 1,
        expires_at: new Date(Date.now() + 100000).toISOString(),
        status: 'active',
      }
      const updated = { id: CMID, remaining: 0, status: 'active' }
      let fromCall = 0
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'does not exist' } })),
        from: vi.fn((table: string) => {
          if (fromCall === 0) {
            fromCall++
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: current, error: null })) })),
              })),
            } as any
          }
          if (fromCall === 1) {
            fromCall++
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: updated, error: null })),
                  })),
                })),
              })),
            } as any
          }
          // remaining 0 triggers expired update
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })) } as any
        }),
      }
      const res = await consumeMembership(supabase, CMID)
      expect(res.remaining).toBe(0)
    })
    it('fallback update error throws no_uses_left', async () => {
      const current = {
        id: CMID,
        remaining: 5,
        expires_at: new Date(Date.now() + 100000).toISOString(),
        status: 'active',
      }
      const supabase: any = {
        rpc: vi.fn(async () => ({ data: null, error: { message: 'does not exist' } })),
        from: vi.fn((table: string) => {
          // need to handle two from calls: select then update
          // Use counter
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: current, error: null })) })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: { message: 'fail' } })),
                })),
              })),
            })),
          } as any
        }),
      }
      // Need to ensure first from returns select, second returns update that fails. Our from returns same object with both select and update, but code calls supa.from(...).select for first and supa.from(...).update for second, so same mock works but we need select to return current first, then update to fail
      // For second call, the code does supa.from(...).update(...).eq(...).select().single() -> we mocked select to return current, which would interfere. Override from to differentiate by call index
      let idx = 0
      supabase.from = vi.fn((table: string) => {
        idx++
        if (idx === 1)
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: current, error: null })) })),
            })),
          } as any
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: { message: 'fail' } })),
              })),
            })),
          })),
        } as any
      })
      await expect(consumeMembership(supabase, CMID)).rejects.toThrow(/no_uses_left/)
    })
  })
})
