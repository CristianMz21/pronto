import { describe, it, expect } from 'vitest'
import {
  checkSlotWithinHours,
  checkSlotWithHolidays,
  checkSlotWithinLocation,
  computeEffectiveHours,
  isPastInTz,
  isTooSoonInTz,
  isTooSoonMinutes,
  parseDateTimeInTz,
  todayInBusinessTz,
  type DayHours,
} from '@/lib/booking-availability'
import { isHoliday, isHolidayForLocation, getHolidaysForDate } from '@/lib/holidays'
import { getLocationOrDefault, assertLocationAccess, formatLocationSlug } from '@/lib/locations'

describe('US1 — booking-availability holidays, break, past_booking, lead_time, location_id', () => {
  const dayOpen: DayHours = { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '19:00', break_start: '13:00', break_end: '14:00' }
  const dayClosed: DayHours = { day_of_week: 0, is_open: false, open_time: '09:00', close_time: '19:00', break_start: null, break_end: null }

  it('holidays: checkSlotWithHolidays returns holiday when date is holiday', () => {
    const holidays = [{ date: '2026-12-25', is_open: false }]
    expect(checkSlotWithHolidays(dayOpen, '10:00', 30, '2026-12-25', holidays)).toEqual({ ok: false, reason: 'holiday' })
    expect(checkSlotWithHolidays(dayOpen, '10:00', 30, '2026-12-24', holidays)).toEqual({ ok: true })
  })

  it('holidays: location filtering via checkSlotWithinLocation', () => {
    const holidays = [
      { date: '2026-12-25', location_id: 'loc-centro', is_open: false },
      { date: '2026-12-25', location_id: 'loc-norte', is_open: false },
    ]
    expect(checkSlotWithinLocation(dayOpen, '10:00', 30, { date: '2026-12-25', holidays, locationId: 'loc-centro' })).toEqual({ ok: false, reason: 'holiday' })
    expect(checkSlotWithinLocation(dayOpen, '10:00', 30, { date: '2026-12-25', holidays, locationId: 'loc-sur' })).toEqual({ ok: true })
    // business-wide holiday (null location) blocks all
    const bizHoliday = [{ date: '2026-01-01', location_id: null, is_open: false }]
    expect(checkSlotWithinLocation(dayOpen, '10:00', 30, { date: '2026-01-01', holidays: bizHoliday, locationId: 'loc-norte' })).toEqual({ ok: false, reason: 'holiday' })
  })

  it('break: overlap detection unchanged', () => {
    expect(checkSlotWithinHours(dayOpen, '13:30', 30)).toEqual({ ok: false, reason: 'break' })
    expect(checkSlotWithinHours(dayOpen, '12:30', 30)).toEqual({ ok: true })
    expect(checkSlotWithinHours(dayOpen, '12:00', 60)).toEqual({ ok: true })
    expect(checkSlotWithinHours(dayOpen, '12:00', 30)).toEqual({ ok: true })
    expect(checkSlotWithinHours(dayOpen, '12:45', 30)).toEqual({ ok: false, reason: 'break' })
    expect(checkSlotWithinHours(dayOpen, '14:00', 30)).toEqual({ ok: true })
  })

  it('past_booking: isPastInTz blocks past and allows future', () => {
    const now = new Date('2026-08-27T15:00:00.000Z') // 10:00 Bogota
    const past = parseDateTimeInTz('2026-08-27', '09:00', 'America/Bogota')
    const future = parseDateTimeInTz('2026-08-27', '11:00', 'America/Bogota')
    expect(isPastInTz(past, now)).toBe(true)
    expect(isPastInTz(future, now)).toBe(false)
    expect(isPastInTz(now, now)).toBe(true)
  })

  it('lead_time: isTooSoon respects min_advance (054) and enabled flag', () => {
    const now = new Date('2026-08-27T10:00:00.000Z')
    const soon = new Date('2026-08-27T10:10:00.000Z')
    const ok = new Date('2026-08-27T10:30:00.000Z')
    expect(isTooSoonInTz(soon, now, 30, true)).toBe(true)
    expect(isTooSoonInTz(ok, now, 30, true)).toBe(false)
    expect(isTooSoonInTz(soon, now, 30, false)).toBe(false)
    expect(isTooSoonMinutes(610, 600, 15, true)).toBe(true)
    expect(isTooSoonMinutes(615, 600, 15, true)).toBe(false)
  })

  it('holidays lib helpers', () => {
    const hs = [
      { business_id: 'b1', date: '2026-12-25', is_open: false },
      { business_id: 'b1', date: '2026-12-25', location_id: 'loc-1', is_open: false },
      { business_id: 'b1', date: '2026-01-01', location_id: null, is_open: false },
    ]
    expect(isHoliday('2026-12-25', hs as any)).toBe(true)
    expect(isHoliday('2026-12-26', hs as any)).toBe(false)
    expect(getHolidaysForDate('2026-12-25', hs as any)).toHaveLength(2)
    expect(isHolidayForLocation('2026-12-25', 'loc-1', hs as any)).toBe(true)
    expect(isHolidayForLocation('2026-12-25', 'loc-2', hs as any)).toBe(true) // business-wide holiday blocks all? Actually loc-2 not in list, but first without location blocks? Check: business-wide is 2026-01-01, not 25
    expect(isHolidayForLocation('2026-01-01', 'loc-999', hs as any)).toBe(true)
  })

  it('locations helpers', () => {
    const locs = [
      { id: '11111111-1111-1111-1111-111111111111', business_id: 'b1', name: 'Escudería Centro', slug: 'centro', is_active: true },
      { id: '22222222-2222-2222-2222-222222222222', business_id: 'b1', name: 'Norte', slug: 'norte', is_active: true },
    ]
    expect(getLocationOrDefault(locs, 'centro')?.id).toBe(locs[0].id)
    expect(getLocationOrDefault(locs, locs[1].id)?.slug).toBe('norte')
    expect(getLocationOrDefault(locs, null)?.id).toBe(locs[0].id)
    expect(formatLocationSlug('Escudería Centro')).toBe('escuderia-centro')
    expect(assertLocationAccess(['loc1', 'loc2'], 'loc1')).toEqual({ ok: true })
    expect(assertLocationAccess(['loc1'], 'loc2')).toEqual({ ok: false, reason: 'forbidden' })
    expect(assertLocationAccess(null, 'any')).toEqual({ ok: true })
  })

  it('todayInBusinessTz respects timezone', () => {
    const now = new Date('2026-08-27T04:00:00.000Z') // 23:00 previous day in Bogota?
    // At 04:00Z, Bogota (UTC-5) is 23:00 previous day 2026-08-26
    expect(todayInBusinessTz('America/Bogota', now)).toBe('2026-08-26')
    expect(todayInBusinessTz('UTC', now)).toBe('2026-08-27')
  })

  it('computeEffectiveHours fallback not closed for empty', () => {
    const eff = computeEffectiveHours([])
    expect(eff.find((h) => h.day_of_week === 0)?.is_open).toBe(false)
    expect(eff.find((h) => h.day_of_week === 1)?.is_open).toBe(true)
  })

  it('closed day returns closed even with holiday not present', () => {
    expect(checkSlotWithinHours(dayClosed, '10:00', 30)).toEqual({ ok: false, reason: 'closed' })
  })
})
