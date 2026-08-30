import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildOccurrencesWithEnd,
  generateOccurrences,
  parseRRule,
  validateRRule,
} from '@/lib/recurring'

describe('recurring-phase2', () => {
  const dtstart = new Date('2026-08-10T14:00:00.000Z')
  beforeEach(() => vi.clearAllMocks())

  it('parseRRule empty throws', () => {
    expect(() => parseRRule('', dtstart)).toThrow(/invalid_rrule/)
    expect(() => parseRRule('   ', dtstart)).toThrow(/invalid_rrule/)
    expect(() => parseRRule(null as any, dtstart)).toThrow(/invalid_rrule/)
  })
  it('parseRRule normalize without FREQ prefix', () => {
    const rule = parseRRule('WEEKLY', dtstart)
    expect(rule).toBeDefined()
    const occ = generateOccurrences({ rrule: 'WEEKLY', dtstart })
    expect(occ.length).toBeGreaterThan(0)
  })
  it('parseRRule with RRULE: prefix', () => {
    const rule = parseRRule('RRULE:FREQ=DAILY;COUNT=2', dtstart)
    expect(rule).toBeDefined()
  })
  it('parseRRule invalid triggers error', () => {
    expect(() => parseRRule('FREQ=INVALID;COUNT=2', dtstart)).toThrow()
  })
  it('validateRRule count >52', () => {
    const v = validateRRule('FREQ=DAILY;COUNT=60', dtstart)
    expect(v.ok).toBe(false)
    expect((v as any).code).toBe('count_too_large')
  })
  it('validateRRule until before dtstart', () => {
    const until = new Date('2026-08-01T00:00:00Z')
    const v = validateRRule('FREQ=WEEKLY', dtstart, until)
    expect(v.ok).toBe(false)
    expect((v as any).code).toBe('until_before_dtstart')
  })
  it('validateRRule invalid_rrule code', () => {
    const v = validateRRule('INVALID', dtstart)
    expect(v.ok).toBe(false)
  })
  it('validateRRule valid returns ok true', () => {
    const v = validateRRule('FREQ=WEEKLY;COUNT=3', dtstart)
    expect(v.ok).toBe(true)
  })
  it('generateOccurrences invalid dtstart throws', () => {
    expect(() =>
      generateOccurrences({ rrule: 'FREQ=DAILY;COUNT=2', dtstart: new Date('invalid') }),
    ).toThrow(/invalid_dtstart/)
  })
  it('generateOccurrences until filter and countLimit', () => {
    const until = new Date('2026-08-20T00:00:00Z')
    const occ = generateOccurrences({ rrule: 'FREQ=DAILY;COUNT=10', dtstart, until, countLimit: 5 })
    expect(occ.length).toBeLessThanOrEqual(5)
    occ.forEach((d) => expect(d.getTime()).toBeLessThanOrEqual(until.getTime()))
    const occ2 = generateOccurrences({ rrule: 'FREQ=DAILY;COUNT=10', dtstart, countLimit: 2 })
    expect(occ2.length).toBe(2)
  })
  it('generateOccurrences throws on invalid rrule', () => {
    expect(() => generateOccurrences({ rrule: 'INVALID', dtstart })).toThrow()
  })
  it('buildOccurrencesWithEnd duration', () => {
    const occ = buildOccurrencesWithEnd('FREQ=DAILY;COUNT=2', dtstart, 45)
    expect(occ[0].ends_at.getTime() - occ[0].starts_at.getTime()).toBe(45 * 60000)
    expect(occ[0].rrule_index).toBe(0)
    expect(occ[1].rrule_index).toBe(1)
    const occUntil = buildOccurrencesWithEnd('FREQ=DAILY;COUNT=10', dtstart, 30, {
      until: new Date('2026-08-12T00:00:00Z'),
      countLimit: 10,
    })
    expect(occUntil.length).toBeLessThanOrEqual(3)
  })
  it('generateOccurrences with UNTIL filter', () => {
    const until = new Date('2026-08-15T14:00:00Z')
    const occ = generateOccurrences({ rrule: 'FREQ=DAILY;COUNT=10', dtstart, until })
    expect(occ.every((d) => d.getTime() <= until.getTime())).toBe(true)
  })

  describe('createSeries validation', () => {
    it('rejects validation_failed when schema invalid', async () => {
      const { createSeries } = await import('@/lib/recurring')
      const supabase: any = { from: vi.fn(), rpc: vi.fn() }
      await expect(
        createSeries(supabase, {
          business_id: 'bad',
          client_id: '22222222-2222-4222-a222-222222222222',
          service_id: '33333333-3333-4333-a333-333333333333',
          rrule: 'FREQ=DAILY;COUNT=2',
          dtstart: new Date(Date.now() + 86400000).toISOString(),
        } as any),
      ).rejects.toThrow(/validation_failed/)
    })
    it('rejects dtstart_required when no dtstart/date+time', async () => {
      const { createSeries } = await import('@/lib/recurring')
      const supabase: any = { from: vi.fn(), rpc: vi.fn() }
      const BIZ = '11111111-1111-4111-a111-111111111111'
      const CLI = '22222222-2222-4222-a222-222222222222'
      const SVC = '33333333-3333-4333-a333-333333333333'
      await expect(
        createSeries(supabase, {
          business_id: BIZ,
          client_id: CLI,
          service_id: SVC,
          rrule: 'FREQ=DAILY;COUNT=2',
        } as any),
      ).rejects.toThrow(/dtstart/)
    })
    it('rejects invalid_dtstart', async () => {
      const { createSeries } = await import('@/lib/recurring')
      const supabase: any = { from: vi.fn(), rpc: vi.fn() }
      const BIZ = '11111111-1111-4111-a111-111111111111'
      const CLI = '22222222-2222-4222-a222-222222222222'
      const SVC = '33333333-3333-4333-a333-333333333333'
      try {
        await createSeries(supabase, {
          business_id: BIZ,
          client_id: CLI,
          service_id: SVC,
          rrule: 'FREQ=DAILY;COUNT=2',
          dtstart: 'invalid',
        } as any)
        throw new Error('should have thrown')
      } catch (e) {
        const err = e as Error & { code?: string }
        expect(
          err.message.includes('validation') ||
            err.message.includes('invalid') ||
            err.code === 'validation_failed' ||
            err.code === 'invalid_dtstart',
        ).toBe(true)
      }
    })
    it('rejects when until before dtstart via validate', async () => {
      const { createSeries } = await import('@/lib/recurring')
      const supabase: any = { from: vi.fn(), rpc: vi.fn() }
      const BIZ = '11111111-1111-4111-a111-111111111111'
      const CLI = '22222222-2222-4222-a222-222222222222'
      const SVC = '33333333-3333-4333-a333-333333333333'
      const dtstart = new Date(Date.now() + 86400000).toISOString()
      const until = new Date(Date.now() + 1000).toISOString()
      await expect(
        createSeries(supabase, {
          business_id: BIZ,
          client_id: CLI,
          service_id: SVC,
          rrule: 'FREQ=DAILY;COUNT=2',
          dtstart,
          until,
        } as any),
      ).rejects.toThrow()
    })
    it('createSeries success with mocked DB', async () => {
      const { createSeries } = await import('@/lib/recurring')
      const BIZ = '11111111-1111-4111-a111-111111111111'
      const CLI = '22222222-2222-4222-a222-222222222222'
      const SVC = '33333333-3333-4333-a333-333333333333'
      // Fixed time at 14:00 UTC (09:00 Bogota) inside business hours Mon-Sat, deterministic
      const dtstart = new Date(Date.now() + 86400000)
      dtstart.setUTCHours(14, 0, 0, 0)
      // Ensure weekday is Mon-Sat (skip Sunday)
      while (dtstart.getUTCDay() === 0) dtstart.setUTCDate(dtstart.getUTCDate() + 1)
      const dtstartIso = dtstart.toISOString()
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'services') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { duration_min: 30, price: 100 },
                      error: null,
                    })),
                  })),
                })),
              })),
            } as any
          }
          if (table === 'recurring_appointments') {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'rec1' }, error: null })),
                })),
              })),
            } as any
          }
          if (table === 'business_hours') {
            return {
              select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
            } as any
          }
          if (table === 'holidays') {
            return {
              select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
            } as any
          }
          if (table === 'appointments') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    gte: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [], error: null })) })),
                  })),
                })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'appt1' }, error: null })),
                })),
              })),
            } as any
          }
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
          } as any
        }),
      }
      const res = await createSeries(supabase, {
        business_id: BIZ,
        client_id: CLI,
        service_id: SVC,
        rrule: 'FREQ=DAILY;COUNT=2',
        dtstart: dtstartIso,
        timezone: 'UTC',
        duration_min: 30,
        price: 100,
      } as any)
      expect(res.id).toBe('rec1')
      expect(res.occurrences).toBe(2)
      expect(res.created).toBeGreaterThanOrEqual(1)
    })
  })
})
