import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canEnqueue,
  convert,
  enqueue,
  expireStale,
  isExpired,
  isWaiting,
  notifyNext,
} from '@/lib/waitlist'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  const methods = [
    'select',
    'insert',
    'update',
    'eq',
    'maybeSingle',
    'single',
    'in',
    'order',
    'limit',
    'lt',
    'gte',
  ]
  methods.forEach((m) => {
    c[m] = vi.fn(() => c)
  })
  return c
}

function makeWaitlistSupabase(candidates: any[], notified: any) {
  let fromCount = 0
  return {
    from: vi.fn((table: string) => {
      fromCount++
      if (table === 'waitlist') {
        if (fromCount === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: candidates, error: null })),
                  })),
                })),
              })),
            })),
          } as any
        }
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: notified, error: null })),
              })),
            })),
          })),
        } as any
      }
      return makeChain({ data: null, error: null })
    }),
  }
}

describe('waitlist-phase2', () => {
  beforeEach(() => vi.clearAllMocks())

  it('isWaiting', () => {
    expect(isWaiting({ status: 'waiting' })).toBe(true)
    expect(isWaiting({ status: 'notified' })).toBe(false)
    expect(isWaiting({ status: 'converted' })).toBe(false)
  })
  it('isExpired true/false edges', () => {
    const now = new Date('2026-08-20T11:00:00Z')
    expect(isExpired({ status: 'waiting', notified_at: new Date().toISOString() }, now)).toBe(false)
    expect(isExpired({ status: 'notified', notified_at: null as any }, now)).toBe(false)
    expect(isExpired({ status: 'notified', notified_at: 'invalid' }, now)).toBe(false)
    expect(
      isExpired(
        { status: 'notified', notified_at: new Date('2026-08-20T10:00:00Z').toISOString() },
        now,
      ),
    ).toBe(true)
    expect(
      isExpired(
        { status: 'notified', notified_at: new Date('2026-08-20T10:40:00Z').toISOString() },
        now,
      ),
    ).toBe(false)
  })
  it('canEnqueue invalid_date', () => {
    expect(canEnqueue('invalid', new Date()).ok).toBe(false)
    expect((canEnqueue('invalid', new Date()) as any).reason).toBe('invalid_date')
    const now = new Date('2026-08-20T10:00:00Z')
    expect(canEnqueue(new Date(now.getTime() - 1000).toISOString(), now).ok).toBe(false)
    expect((canEnqueue(new Date(now.getTime() - 1000).toISOString(), now) as any).reason).toBe(
      'in_past',
    )
    expect(canEnqueue(now.toISOString(), now).ok).toBe(false)
    expect(canEnqueue(new Date(now.getTime() + 10 * 60000).toISOString(), now, 30, true).ok).toBe(
      false,
    )
    expect(
      (canEnqueue(new Date(now.getTime() + 10 * 60000).toISOString(), now, 30, true) as any).reason,
    ).toBe('too_soon')
    expect(canEnqueue(new Date(now.getTime() + 40 * 60000).toISOString(), now, 30, true).ok).toBe(
      true,
    )
    expect(canEnqueue(new Date(now.getTime() + 10 * 60000).toISOString(), now, 30, false).ok).toBe(
      true,
    )
    expect(canEnqueue(new Date(now.getTime() + 10 * 60000).toISOString(), now, 0, true).ok).toBe(
      true,
    )
  })

  describe('enqueue', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    const SVC = '22222222-2222-4222-a222-222222222222'
    const CLI = '33333333-3333-4333-a333-333333333333'
    const LOC = '44444444-4444-4444-a444-444444444444'
    const base = {
      business_id: BIZ,
      service_id: SVC,
      client_id: CLI,
      desired_at: new Date(Date.now() + 3600000).toISOString(),
    }
    it('validation_failed', async () => {
      const supabase: any = { from: vi.fn() }
      await expect(
        enqueue(supabase, {
          business_id: 'bad',
          service_id: SVC,
          client_id: CLI,
          desired_at: new Date().toISOString(),
        } as any),
      ).rejects.toThrow(/validation_failed/)
    })
    it('success', async () => {
      const entry = {
        id: 'w1',
        business_id: BIZ,
        service_id: SVC,
        client_id: CLI,
        desired_at: base.desired_at,
        location_id: null,
        employee_id: null,
        status: 'waiting',
      }
      const supabase: any = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: vi.fn(async () => ({ data: entry, error: null })) })),
          })),
        })),
      }
      const res = await enqueue(supabase, base as any)
      expect(res.id).toBe('w1')
    })
    it('duplicate error code 23505', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: null,
                error: { message: 'duplicate key', code: '23505' },
              })),
            })),
          })),
        })),
      }
      await expect(enqueue(supabase, base as any)).rejects.toThrow(/waitlist_duplicate/)
    })
    it('duplicate message unique', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'unique violation' } })),
            })),
          })),
        })),
      }
      await expect(enqueue(supabase, base as any)).rejects.toThrow(/waitlist_duplicate/)
    })
    it('other error rethrows', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'other' } })),
            })),
          })),
        })),
      }
      await expect(enqueue(supabase, base as any)).rejects.toBeTruthy()
    })
    it('with location and employee', async () => {
      const entry = {
        id: 'w2',
        business_id: BIZ,
        service_id: SVC,
        client_id: CLI,
        desired_at: base.desired_at,
        location_id: LOC,
        employee_id: '55555555-5555-4555-a555-555555555555',
        status: 'waiting',
      }
      const supabase: any = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: vi.fn(async () => ({ data: entry, error: null })) })),
          })),
        })),
      }
      const res = await enqueue(supabase, {
        ...base,
        location_id: LOC,
        employee_id: '55555555-5555-4555-a555-555555555555',
      } as any)
      expect(res.location_id).toBe(LOC)
    })
  })

  describe('notifyNext', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    it('returns null when no candidates', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
              })),
            })),
          })),
        })),
      }
      expect(await notifyNext(supabase, { business_id: BIZ })).toBeNull()
      const supabase2: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: null, error: { message: 'error' } })),
                })),
              })),
            })),
          })),
        })),
      }
      expect(await notifyNext(supabase2, { business_id: BIZ })).toBeNull()
    })
    it('filters by desired_at exact', async () => {
      const w1 = {
        id: 'w1',
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
        location_id: null,
        service_id: 's1',
        employee_id: null,
        status: 'waiting',
        created_at: '2026-08-19T00:00:00Z',
      }
      const w2 = {
        id: 'w2',
        business_id: BIZ,
        desired_at: '2026-08-20T11:00:00.000Z',
        location_id: null,
        service_id: 's1',
        employee_id: null,
        status: 'waiting',
        created_at: '2026-08-19T01:00:00Z',
      }
      const w1Notified = { ...w1, status: 'notified', notified_at: new Date().toISOString() }
      const supabase = makeWaitlistSupabase([w1, w2], w1Notified)
      const res = await notifyNext(supabase as any, {
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
      })
      expect(res?.id).toBe('w1')
    })
    it('filters by location/service/employee', async () => {
      const w1 = {
        id: 'w1',
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
        location_id: 'loc1',
        service_id: 's1',
        employee_id: 'e1',
        status: 'waiting',
        created_at: '2026-08-19T00:00:00Z',
      }
      const w2 = {
        id: 'w2',
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
        location_id: 'loc2',
        service_id: 's2',
        employee_id: 'e2',
        status: 'waiting',
        created_at: '2026-08-19T01:00:00Z',
      }
      const w1Notified = { ...w1, status: 'notified', notified_at: new Date().toISOString() }
      const supabase = makeWaitlistSupabase([w1, w2], w1Notified)
      const res = await notifyNext(supabase as any, {
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
        location_id: 'loc1',
        service_id: 's1',
        employee_id: 'e1',
      })
      expect(res?.id).toBe('w1')
    })
    it('no match returns null', async () => {
      const w2 = {
        id: 'w2',
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
        location_id: 'loc2',
        service_id: 's2',
        employee_id: 'e2',
        status: 'waiting',
        created_at: '2026-08-19T01:00:00Z',
      }
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [w2], error: null })) })),
              })),
            })),
          })),
        })),
      }
      // Need second call to be ignored because filtered empty before update
      const res = await notifyNext(supabase as any, {
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
        location_id: 'loc1',
      })
      expect(res).toBeNull()
    })
    it('fallback same day when exact not matched', async () => {
      const w1 = {
        id: 'w1',
        business_id: BIZ,
        desired_at: '2026-08-20T10:00:00.000Z',
        location_id: null,
        service_id: 's1',
        employee_id: null,
        status: 'waiting',
        created_at: '2026-08-19T00:00:00Z',
      }
      const w1Notified = { ...w1, status: 'notified', notified_at: new Date().toISOString() }
      const supabaseDiffDay: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [w1], error: null })) })),
              })),
            })),
          })),
        })),
      }
      const res = await notifyNext(supabaseDiffDay as any, {
        business_id: BIZ,
        desired_at: '2026-08-21T10:00:00.000Z',
      })
      expect(res).toBeNull()
      const supabaseSameDay = makeWaitlistSupabase([w1], w1Notified)
      const res3 = await notifyNext(supabaseSameDay as any, {
        business_id: BIZ,
        desired_at: '2026-08-20T15:00:00.000Z',
      })
      expect(res3?.id).toBe('w1')
    })
  })

  describe('convert', () => {
    const WLID = '11111111-1111-4111-a111-111111111111'
    it('invalid uuid throws', async () => {
      const supabase: any = { from: vi.fn() }
      await expect(convert(supabase, 'bad')).rejects.toThrow(/validation_failed/)
    })
    it('not found throws', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
          })),
        })),
      }
      await expect(convert(supabase, WLID)).rejects.toThrow(/waitlist_not_found/)
    })
    it('already_converted throws', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { status: 'converted' }, error: null })),
            })),
          })),
        })),
      }
      await expect(convert(supabase, WLID)).rejects.toThrow(/already_converted/)
    })
    it('expired throws', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { status: 'expired' }, error: null })),
            })),
          })),
        })),
      }
      await expect(convert(supabase, WLID)).rejects.toThrow(/waitlist_not_convertible/)
      const supabase2: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { status: 'cancelled' }, error: null })),
            })),
          })),
        })),
      }
      await expect(convert(supabase2, WLID)).rejects.toThrow(/waitlist_not_convertible/)
    })
    it('success', async () => {
      const updated = { id: WLID, status: 'converted' }
      let call = 0
      const supabase: any = {
        from: vi.fn(() => {
          call++
          if (call === 1)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { status: 'waiting' }, error: null })),
                })),
              })),
            } as any
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: updated, error: null })),
                })),
              })),
            })),
          } as any
        }),
      }
      const res = await convert(supabase, WLID)
      expect(res.status).toBe('converted')
    })
    it('error on update throws', async () => {
      let call = 0
      const supabase: any = {
        from: vi.fn(() => {
          call++
          if (call === 1)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { status: 'waiting' }, error: null })),
                })),
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
        }),
      }
      await expect(convert(supabase, WLID)).rejects.toBeTruthy()
    })
  })

  describe('expireStale', () => {
    it('expires notified and waiting', async () => {
      const now = new Date('2026-08-20T12:00:00Z')
      const notifiedIds = [{ id: 'n1' }, { id: 'n2' }]
      const waitingIds = [{ id: 'w1' }]
      let call = 0
      const supabase: any = {
        from: vi.fn(() => {
          call++
          if (call === 1)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ lt: vi.fn(async () => ({ data: notifiedIds, error: null })) })),
              })),
            } as any
          if (call === 2)
            return {
              update: vi.fn(() => ({ in: vi.fn(async () => ({ data: null, error: null })) })),
            } as any
          if (call === 3)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ lt: vi.fn(async () => ({ data: waitingIds, error: null })) })),
              })),
            } as any
          return {
            update: vi.fn(() => ({ in: vi.fn(async () => ({ data: null, error: null })) })),
          } as any
        }),
      }
      const res = await expireStale(supabase, now)
      expect(res.expiredNotified).toBe(2)
      expect(res.expiredWaiting).toBe(1)
    })
    it('no expired', async () => {
      const now = new Date('2026-08-20T12:00:00Z')
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ lt: vi.fn(async () => ({ data: [], error: null })) })),
          })),
        })),
      }
      const res = await expireStale(supabase, now)
      expect(res.expiredNotified).toBe(0)
      expect(res.expiredWaiting).toBe(0)
    })
    it('null data handled', async () => {
      const now = new Date('2026-08-20T12:00:00Z')
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ lt: vi.fn(async () => ({ data: null, error: null })) })),
          })),
        })),
      }
      const res = await expireStale(supabase, now)
      expect(res.expiredNotified).toBe(0)
    })
  })
})
