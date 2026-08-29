import { describe, it, expect } from 'vitest'
import { parseRRule, validateRRule, generateOccurrences, buildOccurrencesWithEnd } from '@/lib/recurring'

describe('recurring RRule', () => {
  const dtstart = new Date('2026-08-10T14:00:00.000Z') // Monday 10:00 America/Bogota is 15:00 UTC? but use UTC for test
  it('parse valid FREQ=WEEKLY', () => {
    const rule = parseRRule('FREQ=WEEKLY;COUNT=3', dtstart)
    expect(rule).toBeDefined()
    const occ = generateOccurrences({ rrule: 'FREQ=WEEKLY;COUNT=3', dtstart })
    expect(occ.length).toBe(3)
    expect(occ[0].getTime()).toBe(dtstart.getTime())
    // weekly interval 7 days
    expect(occ[1].getTime() - occ[0].getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('count >52 invalid', () => {
    const v = validateRRule('FREQ=DAILY;COUNT=60', dtstart)
    expect(v.ok).toBe(false)
    expect((v as { code: string }).code).toBe('count_too_large')
  })

  it('until before dtstart invalid', () => {
    const until = new Date('2026-08-01T00:00:00Z')
    const v = validateRRule('FREQ=WEEKLY', dtstart, until)
    expect(v.ok).toBe(false)
  })

  it('every 2 weeks interval', () => {
    const occ = generateOccurrences({ rrule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=3', dtstart })
    expect(occ.length).toBe(3)
    expect(occ[1].getTime() - occ[0].getTime()).toBe(14 * 24 * 60 * 60 * 1000)
  })

  it('buildOccurrencesWithEnd respects duration', () => {
    const occ = buildOccurrencesWithEnd('FREQ=DAILY;COUNT=2', dtstart, 45)
    expect(occ[0].ends_at.getTime() - occ[0].starts_at.getTime()).toBe(45 * 60_000)
  })

  it('invalid rrule throws', () => {
    expect(() => generateOccurrences({ rrule: 'INVALID', dtstart })).toThrow()
  })

  it('FREQ=WEEKLY;BYDAY=TU generates Tuesdays', () => {
    // 2026-08-10 is Monday, BYDAY=TU should give next Tuesday 2026-08-11
    const occ = generateOccurrences({ rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=2', dtstart })
    expect(occ.length).toBe(2)
    expect(occ[0].toISOString().slice(0, 10)).toBe('2026-08-11')
  })
})
