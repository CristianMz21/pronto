import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(true) }))

import {
  attributeRebooking,
  CampaignCreateSchema,
  createFromSegment,
  filterClientsBySegment,
  getCampaignStats,
  sendCampaign,
} from '@/lib/campaigns'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  const fin = (p as any).finally
  if (fin) c.finally = fin.bind(p)
  const methods = [
    'select',
    'insert',
    'update',
    'eq',
    'order',
    'limit',
    'maybeSingle',
    'single',
    'in',
    'not',
    'gte',
    'count',
    'head',
  ]
  methods.forEach((m) => {
    c[m] = vi.fn((...args: any[]) => c)
  })
  return c
}

function makeSupabaseFrom(map: Record<string, any>) {
  return vi.fn((table: string) => {
    if (table in map) {
      const val = map[table]
      if (typeof val === 'function') return val()
      return val
    }
    return makeChain({ data: null, error: null })
  })
}

describe('campaigns-phase2', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('filterClientsBySegment exhaustive', () => {
    const now = new Date('2026-08-20T12:00:00Z')
    const clients = [
      {
        id: 'c1',
        last_visit_at: new Date(now.getTime() - 35 * 86400000).toISOString(),
        total_visits: 5,
        tags: ['vip'],
        birthday: new Date(now.getFullYear() + '-08-22').toISOString().slice(0, 10),
        location_id: 'loc1',
      },
      {
        id: 'c2',
        last_visit_at: new Date(now.getTime() - 10 * 86400000).toISOString(),
        total_visits: 1,
        tags: [],
        birthday: '1990-01-01',
        location_id: null,
      },
      { id: 'c3', last_visit_at: null, total_visits: 0, tags: null, birthday: null },
      {
        id: 'c4',
        last_visit_at: new Date(now.getTime() - 50 * 86400000).toISOString(),
        total_visits: 2,
        tags: ['VIP'],
        birthday: new Date(now.getTime() + 5 * 86400000).toISOString().slice(0, 10),
      },
      {
        id: 'c5',
        last_visit_at: new Date(now.getTime() - 70 * 86400000).toISOString(),
        total_visits: 10,
        tags: [],
        birthday: 'invalid-date',
      },
    ] as any[]

    it('all returns all', () => {
      expect(filterClientsBySegment(clients as any, 'all', now).length).toBe(5)
    })
    it('inactive_30 includes null last_visit and >=30', () => {
      const res = filterClientsBySegment(clients as any, 'inactive_30', now)
      expect(res.map((r) => r.id)).toContain('c1')
      expect(res.map((r) => r.id)).toContain('c3')
      expect(res.map((r) => r.id)).toContain('c5')
      expect(res.map((r) => r.id)).not.toContain('c2')
    })
    it('inactive_42', () => {
      const res = filterClientsBySegment(clients as any, 'inactive_42', now)
      expect(res.map((r) => r.id)).toContain('c4')
      expect(res.map((r) => r.id)).toContain('c5')
      expect(res.map((r) => r.id)).not.toContain('c1')
    })
    it('inactive_60', () => {
      const res = filterClientsBySegment(clients as any, 'inactive_60', now)
      expect(res.map((r) => r.id)).toContain('c5')
      expect(res.map((r) => r.id)).not.toContain('c4')
    })
    it('birthday_7 valid and invalid', () => {
      const res = filterClientsBySegment(clients as any, 'birthday_7', now)
      expect(res.map((r) => r.id)).toContain('c1')
      expect(res.map((r) => r.id)).toContain('c4')
      expect(res.map((r) => r.id)).not.toContain('c2')
      expect(res.map((r) => r.id)).not.toContain('c5')
      expect(
        filterClientsBySegment([{ id: 'x', birthday: null } as any], 'birthday_7', now).length,
      ).toBe(0)
      expect(
        filterClientsBySegment([{ id: 'x', birthday: 'invalid' } as any], 'birthday_7', now).length,
      ).toBe(0)
    })
    it('vip case insensitive', () => {
      const res = filterClientsBySegment(clients as any, 'vip', now)
      expect(res.map((r) => r.id)).toContain('c1')
      expect(res.map((r) => r.id)).toContain('c4')
      expect(res.length).toBe(2)
    })
    it('new visits 1-2', () => {
      const res = filterClientsBySegment(clients as any, 'new', now)
      expect(res.map((r) => r.id)).toContain('c2')
      expect(res.map((r) => r.id)).toContain('c4')
      expect(res.map((r) => r.id)).not.toContain('c1')
      expect(res.map((r) => r.id)).not.toContain('c3')
      expect(res.map((r) => r.id)).not.toContain('c5')
    })
    it('birthday_7 edge now after birthday this year', () => {
      const pastBd = new Date(now)
      pastBd.setDate(now.getDate() - 1)
      const iso = pastBd.toISOString().slice(0, 10)
      expect(
        filterClientsBySegment([{ id: 'x', birthday: iso } as any], 'birthday_7', now).length,
      ).toBe(0)
    })
  })

  describe('CampaignCreateSchema validation', () => {
    it('validates fields', () => {
      expect(
        CampaignCreateSchema.safeParse({ name: '', segment: 'all', template: 'hi' }).success,
      ).toBe(false)
      expect(
        CampaignCreateSchema.safeParse({ name: 'a'.repeat(121), segment: 'all', template: 'hi' })
          .success,
      ).toBe(false)
      expect(
        CampaignCreateSchema.safeParse({ name: 'test', segment: 'invalid' as any, template: 'hi' })
          .success,
      ).toBe(false)
      expect(
        CampaignCreateSchema.safeParse({
          name: 'test',
          segment: 'all',
          template: '',
          channel: 'whatsapp',
        }).success,
      ).toBe(false)
      expect(
        CampaignCreateSchema.safeParse({
          name: 'ok',
          segment: 'vip',
          template: 'hello',
          channel: 'email',
        }).success,
      ).toBe(true)
      expect(
        CampaignCreateSchema.safeParse({
          name: 'ok',
          segment: 'all',
          template: 't',
          location_id: 'not-uuid',
        }).success,
      ).toBe(false)
      expect(
        CampaignCreateSchema.safeParse({
          name: 'ok',
          segment: 'all',
          template: 't',
          location_id: '00000000-0000-4000-a000-000000000001',
        }).success,
      ).toBe(true)
      expect(
        CampaignCreateSchema.safeParse({
          name: 'ok',
          segment: 'all',
          template: 't',
          location_id: '',
        }).success,
      ).toBe(true)
      expect(
        CampaignCreateSchema.safeParse({
          name: 'ok',
          segment: 'all',
          template: 't',
          location_id: null,
        }).success,
      ).toBe(true)
    })
  })

  describe('createFromSegment', () => {
    const BIZ = '11111111-1111-4111-a111-111111111111'
    const CAMP_ID = '33333333-3333-4333-a333-333333333333'

    it('throws validation_failed when schema invalid', async () => {
      const supabase: any = {
        from: vi.fn(() => makeChain({ data: [], error: null })),
        rpc: vi.fn(),
      }
      await expect(
        createFromSegment(supabase, {
          businessId: BIZ,
          name: '',
          segment: 'all' as any,
          channel: 'whatsapp',
          template: 'hi',
        }),
      ).rejects.toThrow(/validation_failed/)
    })
    it('throws businessId required', async () => {
      const supabase: any = {
        from: vi.fn(() => makeChain({ data: [], error: null })),
        rpc: vi.fn(),
      }
      await expect(
        createFromSegment(supabase, {
          businessId: '' as any,
          name: 'test',
          segment: 'all',
          channel: 'whatsapp',
          template: 'hi',
        }),
      ).rejects.toThrow(/businessId required/)
    })
    it('creates campaign with 0 matched then no recipient insert', async () => {
      const campaignRow = {
        id: CAMP_ID,
        business_id: BIZ,
        location_id: null,
        name: 'test',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi',
        status: 'draft',
        stats: { sent: 0, delivered: 0, rebooked: 0 },
        sent_at: null,
        created_at: new Date().toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'clients') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            } as any
          }
          if (table === 'transactions') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    in: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn(async () => ({ data: [], error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          }
          if (table === 'campaigns') {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: campaignRow, error: null })),
                })),
              })),
            } as any
          }
          return makeChain({ data: null, error: null })
        }),
        rpc: vi.fn(),
      }
      const res = await createFromSegment(supabase, {
        businessId: BIZ,
        name: 'test',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi',
      })
      expect(res.id).toBe(CAMP_ID)
    })
    it('throws campaign_create_failed on insert error', async () => {
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'clients') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            } as any
          }
          if (table === 'transactions') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    in: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn(async () => ({ data: [], error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          }
          if (table === 'campaigns') {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: { message: 'dup' } })),
                })),
              })),
            } as any
          }
          return makeChain({ data: null, error: null })
        }),
        rpc: vi.fn(),
      }
      await expect(
        createFromSegment(supabase, {
          businessId: BIZ,
          name: 'test',
          segment: 'all',
          channel: 'whatsapp',
          template: 'hi',
        }),
      ).rejects.toThrow(/dup/)
    })
    it('creates with recipients and batches', async () => {
      const manyClients = Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        name: `N${i}`,
        birthday: null,
        tags: null,
        last_visit_at: null,
        location_id: null,
      }))
      const campaignRow = {
        id: CAMP_ID,
        business_id: BIZ,
        location_id: null,
        name: 'test',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi',
        status: 'draft',
        stats: { sent: 0, delivered: 0, rebooked: 0 },
        sent_at: null,
        created_at: new Date().toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'clients') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: manyClients, error: null })),
                  })),
                })),
              })),
            } as any
          }
          if (table === 'transactions') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    in: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn(async () => ({ data: [], error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            } as any
          }
          if (table === 'campaigns') {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: campaignRow, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          if (table === 'campaign_recipients')
            return { insert: vi.fn(async () => ({ error: null })) } as any
          return makeChain({ data: null, error: null })
        }),
        rpc: vi.fn(),
      }
      const res = await createFromSegment(supabase, {
        businessId: BIZ,
        name: 'test',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi',
      })
      expect(res.id).toBe(CAMP_ID)
      expect(supabase.from).toHaveBeenCalledWith('campaign_recipients')
    })
    it('handles fetch clients throw and fallback to empty', async () => {
      const campaignRow = {
        id: CAMP_ID,
        business_id: BIZ,
        location_id: null,
        name: 'test',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi',
        status: 'draft',
        stats: { sent: 0, delivered: 0, rebooked: 0 },
        sent_at: null,
        created_at: new Date().toISOString(),
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'clients')
            return {
              select: vi.fn(() => {
                throw new Error('db down')
              }),
            } as any
          if (table === 'campaigns')
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: campaignRow, error: null })),
                })),
              })),
            } as any
          return makeChain({ data: null, error: null })
        }),
        rpc: vi.fn(),
      }
      const res = await createFromSegment(supabase, {
        businessId: BIZ,
        name: 'test',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi',
      })
      expect(res.id).toBe(CAMP_ID)
    })
  })

  describe('getCampaignStats', () => {
    it('throws not_found when campaign missing', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'no' } })),
            })),
          })),
        })),
      }
      await expect(getCampaignStats(supabase, 'bad')).rejects.toThrow(/campaign_not_found/)
    })
    it('calculates sent/delivered/rebooked/failed', async () => {
      const camp = {
        id: 'c1',
        business_id: 'b1',
        stats: { sent: 0, delivered: 0, rebooked: 1 },
        sent_at: null,
        status: 'sent',
      }
      const recs = [
        { status: 'sent' },
        { status: 'delivered' },
        { status: 'rebooked' },
        { status: 'failed' },
        { status: 'pending' },
      ]
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaigns')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: camp, error: null })) })),
              })),
            } as any
          if (table === 'campaign_recipients')
            return {
              select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: recs, error: null })) })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await getCampaignStats(supabase, 'c1')
      expect(res.sent).toBe(3)
      expect(res.delivered).toBe(2)
      expect(res.rebooked).toBe(1)
      expect(res.failed).toBe(1)
      expect(res.recipients).toBe(5)
    })
    it('empty recipients', async () => {
      const camp = {
        id: 'c1',
        business_id: 'b1',
        stats: { sent: 0, delivered: 0, rebooked: 0 },
        sent_at: null,
        status: 'draft',
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaigns')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: camp, error: null })) })),
              })),
            } as any
          if (table === 'campaign_recipients')
            return {
              select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await getCampaignStats(supabase, 'c1')
      expect(res.sent).toBe(0)
      expect(res.recipients).toBe(0)
    })
  })

  describe('attributeRebooking', () => {
    it('direct attribution with campaignId', async () => {
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaign_recipients')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          if (table === 'campaigns') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { stats: { sent: 10, rebooked: 2 } },
                    error: null,
                  })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          return makeChain({ data: null, error: null })
        }),
      }
      await attributeRebooking(supabase, {
        clientId: 'cli',
        businessId: 'biz',
        campaignId: 'camp1',
      })
      expect(supabase.from).toHaveBeenCalledWith('campaign_recipients')
    })
    it('indirect attribution finds most recent campaign', async () => {
      const recs = [
        { campaign_id: 'camp1', status: 'sent' },
        { campaign_id: 'camp2', status: 'sent' },
      ]
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaign_recipients') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ in: vi.fn(async () => ({ data: recs, error: null })) })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          }
          if (table === 'campaigns') {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [{ id: 'camp2', stats: { sent: 1, rebooked: 0 } }],
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          return makeChain({ data: null, error: null })
        }),
      }
      await attributeRebooking(supabase, { clientId: 'cli', businessId: 'biz' })
      expect(supabase.from).toHaveBeenCalled()
    })
    it('no recipients does nothing', async () => {
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaign_recipients')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
              })),
            } as any
          return makeChain({ data: [], error: null })
        }),
      }
      await attributeRebooking(supabase, { clientId: 'cli', businessId: 'biz' })
      expect(true).toBe(true)
    })
    it('swallows errors', async () => {
      const supabase: any = {
        from: vi.fn(() => {
          throw new Error('boom')
        }),
      }
      await attributeRebooking(supabase, { clientId: 'cli', businessId: 'biz', campaignId: 'c1' })
      expect(true).toBe(true)
    })
  })

  describe('sendCampaign', () => {
    const CAMP_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const BIZ_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

    it('throws if campaign not found', async () => {
      const supabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'no' } })),
            })),
          })),
        })),
      }
      await expect(sendCampaign(supabase, CAMP_ID)).rejects.toThrow(/campaign_not_found/)
    })
    it('throws if status not draft/sending', async () => {
      const camp = {
        id: CAMP_ID,
        business_id: BIZ_ID,
        location_id: null,
        name: 't',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi {{name}}',
        status: 'sent',
        stats: {},
        sent_at: null,
        created_at: '',
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaigns')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: camp, error: null })) })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      await expect(sendCampaign(supabase, CAMP_ID)).rejects.toThrow(/campaign_not_draft/)
    })
    it('sends with no recipients marks sent stub', async () => {
      const camp = {
        id: CAMP_ID,
        business_id: BIZ_ID,
        location_id: null,
        name: 't',
        segment: 'all',
        channel: 'whatsapp',
        template: 'hi',
        status: 'draft',
        stats: {},
        sent_at: null,
        created_at: '',
      }
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaigns') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: camp, error: null })) })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          }
          if (table === 'campaign_recipients')
            return {
              select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await sendCampaign(supabase, CAMP_ID)
      expect(res.sent).toBe(0)
      expect(res.stub).toBe(true)
    })
    it('handles whatsapp with no phone failed', async () => {
      const camp = {
        id: CAMP_ID,
        business_id: BIZ_ID,
        location_id: null,
        name: 't',
        segment: 'all',
        channel: 'whatsapp',
        template: 'Hello {{name}}',
        status: 'draft',
        stats: {},
        sent_at: null,
        created_at: '',
      }
      const recs = [{ campaign_id: CAMP_ID, client_id: 'cli1', status: 'pending' }]
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaigns')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: camp, error: null })) })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          if (table === 'campaign_recipients') {
            return {
              select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: recs, error: null })) })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          }
          if (table === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      name: 'Biz',
                      meta_whatsapp_phone_number_id: null,
                      meta_whatsapp_access_token: null,
                    },
                    error: null,
                  })),
                })),
              })),
            } as any
          if (table === 'clients')
            return {
              select: vi.fn(() => ({
                in: vi.fn(async () => ({
                  data: [
                    { id: 'cli1', name: 'John', phone: null, email: null, whatsapp_number: null },
                  ],
                  error: null,
                })),
              })),
            } as any
          if (table === 'notification_log')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      gte: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
                    })),
                  })),
                })),
              })),
              insert: vi.fn(async () => ({ error: null })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await sendCampaign(supabase, CAMP_ID)
      expect(res.failed).toBe(1)
    })
    it('email and telegram stub branches', async () => {
      const campEmail = {
        id: CAMP_ID,
        business_id: BIZ_ID,
        location_id: null,
        name: 't',
        segment: 'all',
        channel: 'email',
        template: 'Hi {{name}}',
        status: 'draft',
        stats: {},
        sent_at: null,
        created_at: '',
      }
      const recs = [{ campaign_id: CAMP_ID, client_id: 'cli1', status: 'pending' }]
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'campaigns')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: campEmail, error: null })),
                })),
              })),
              update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            } as any
          if (table === 'campaign_recipients')
            return {
              select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: recs, error: null })) })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
              })),
            } as any
          if (table === 'businesses')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      name: 'Biz',
                      meta_whatsapp_phone_number_id: null,
                      meta_whatsapp_access_token: null,
                    },
                    error: null,
                  })),
                })),
              })),
            } as any
          if (table === 'clients')
            return {
              select: vi.fn(() => ({
                in: vi.fn(async () => ({
                  data: [
                    {
                      id: 'cli1',
                      name: 'John',
                      phone: '123',
                      email: 'a@b.com',
                      whatsapp_number: null,
                    },
                  ],
                  error: null,
                })),
              })),
            } as any
          if (table === 'notification_log')
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      gte: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
                    })),
                  })),
                })),
              })),
              insert: vi.fn(async () => ({ error: null })),
            } as any
          return makeChain({ data: null, error: null })
        }),
      }
      const res = await sendCampaign(supabase, CAMP_ID)
      expect(res.stub).toBe(true)
      expect(res.sent).toBe(1)
    })
  })
})
