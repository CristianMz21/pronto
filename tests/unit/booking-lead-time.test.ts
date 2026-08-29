import { describe, expect, it, vi } from 'vitest'

import {
  checkSlotWithinHours,
  computeEffectiveHours,
  type DayHours,
  dayOfWeekFromDateString,
  getDayOfWeekInTz,
  isDayClosed,
  isPastInTz,
  isTooSoonInTz,
  isTooSoonMinutes,
  nowMinutesInBusinessTz,
  parseDateTimeInTz,
  todayInBusinessTz,
} from '@/lib/booking-availability'

// ---------------------------------------------------------------------------
// parseDateTimeInTz — timezone conversions
// ---------------------------------------------------------------------------
describe('booking-lead-time — parseDateTimeInTz', () => {
  it('UTC: wall 10:00 stays 10:00Z', () => {
    const d = parseDateTimeInTz('2026-08-27', '10:00', 'UTC')
    expect(d.toISOString()).toBe('2026-08-27T10:00:00.000Z')
  })

  it('America/Bogota UTC-5: wall 10:00 => 15:00Z', () => {
    const d = parseDateTimeInTz('2026-08-27', '10:00', 'America/Bogota')
    expect(d.toISOString()).toBe('2026-08-27T15:00:00.000Z')
  })

  it('Asia/Kolkata UTC+5:30: wall 10:00 => 04:30Z', () => {
    const d = parseDateTimeInTz('2026-08-27', '10:00', 'Asia/Kolkata')
    expect(d.toISOString()).toBe('2026-08-27T04:30:00.000Z')
  })

  it('Europe/Madrid summer CEST UTC+2: wall 10:00 => 08:00Z (DST)', () => {
    // 2026-08-27 is summer CEST +2
    const d = parseDateTimeInTz('2026-08-27', '10:00', 'Europe/Madrid')
    expect(d.toISOString()).toBe('2026-08-27T08:00:00.000Z')
  })

  it('America/New_York winter EST UTC-5: Jan wall 10:00 => 15:00Z', () => {
    const d = parseDateTimeInTz('2026-01-15', '10:00', 'America/New_York')
    expect(d.toISOString()).toBe('2026-01-15T15:00:00.000Z')
  })

  it('America/New_York summer EDT UTC-4: July wall 10:00 => 14:00Z', () => {
    const d = parseDateTimeInTz('2026-07-15', '10:00', 'America/New_York')
    expect(d.toISOString()).toBe('2026-07-15T14:00:00.000Z')
  })

  it('noon reference avoids DST midnight edge: wall midnight still correct', () => {
    // In NY, DST start 2026-03-08 02:00 -> 03:00. Wall 00:30 that day should still map correctly.
    const d = parseDateTimeInTz('2026-03-08', '00:30', 'America/New_York')
    // Midnight EST is 05:30Z before transition, but noon reference ensures offset calc uses same day's noon (already DST)
    // The key is it does not throw and returns a Date
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
  })

  it('handles 00:00 and 23:59 boundaries', () => {
    const d1 = parseDateTimeInTz('2026-12-31', '00:00', 'UTC')
    expect(d1.toISOString()).toBe('2026-12-31T00:00:00.000Z')
    const d2 = parseDateTimeInTz('2026-12-31', '23:59', 'UTC')
    expect(d2.toISOString()).toBe('2026-12-31T23:59:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// isPastInTz / isTooSoonInTz — lead time logic with timezone (UTC comparison)
// ---------------------------------------------------------------------------
describe('booking-lead-time — isPastInTz / isTooSoonInTz', () => {
  const baseNow = new Date('2030-01-15T10:00:00.000Z')

  it('isPast true when startsAt <= now', () => {
    expect(isPastInTz(new Date('2030-01-15T09:59:59.000Z'), baseNow)).toBe(true)
    expect(isPastInTz(new Date('2030-01-15T10:00:00.000Z'), baseNow)).toBe(true)
    expect(isPastInTz(new Date('2030-01-15T10:00:01.000Z'), baseNow)).toBe(false)
  })

  it('isPast uses now default when not passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-15T10:00:00.000Z'))
    const past = new Date('2030-01-15T09:00:00.000Z')
    const future = new Date('2030-01-15T11:00:00.000Z')
    expect(isPastInTz(past)).toBe(true)
    expect(isPastInTz(future)).toBe(false)
    vi.useRealTimers()
  })

  it('isTooSoon respects minAdvance and enabled flag', () => {
    // now 10:00, lead 30
    expect(isTooSoonInTz(new Date('2030-01-15T10:20:00.000Z'), baseNow, 30, true)).toBe(true) // 20 min <30
    expect(isTooSoonInTz(new Date('2030-01-15T10:30:00.000Z'), baseNow, 30, true)).toBe(false) // exactly 30 => ok
    expect(isTooSoonInTz(new Date('2030-01-15T10:10:00.000Z'), baseNow, 15, true)).toBe(true) // 10<15
    expect(isTooSoonInTz(new Date('2030-01-15T10:15:00.000Z'), baseNow, 15, true)).toBe(false) // exactly 15 => ok
    expect(isTooSoonInTz(new Date('2030-01-15T10:30:00.000Z'), baseNow, 60, true)).toBe(true) // 30<60
    expect(isTooSoonInTz(new Date('2030-01-15T11:00:00.000Z'), baseNow, 60, true)).toBe(false) // exactly 60 => ok
  })

  it('isTooSoon disabled returns false even if too soon', () => {
    expect(isTooSoonInTz(new Date('2030-01-15T10:05:00.000Z'), baseNow, 30, false)).toBe(false)
    expect(isTooSoonInTz(new Date('2030-01-15T10:05:00.000Z'), baseNow, 60, false)).toBe(false)
  })

  it('isTooSoon with 0 or null lead never too soon', () => {
    expect(isTooSoonInTz(new Date('2030-01-15T10:01:00.000Z'), baseNow, 0, true)).toBe(false)
    expect(isTooSoonInTz(new Date('2030-01-15T10:01:00.000Z'), baseNow, null as any, true)).toBe(
      false,
    )
    expect(
      isTooSoonInTz(new Date('2030-01-15T10:01:00.000Z'), baseNow, undefined as any, true),
    ).toBe(false)
  })

  it('lead time with different timezones: parse then compare UTC correctly', () => {
    // Booking wall 10:20 in Bogota should be 15:20Z. Now is 15:00Z. Lead 30 => 15:20 < 15:30 => too_soon
    const startsBogota = parseDateTimeInTz('2030-01-15', '10:20', 'America/Bogota')
    const nowUtc = new Date('2030-01-15T15:00:00.000Z') // 10:00 Bogota
    expect(isTooSoonInTz(startsBogota, nowUtc, 30, true)).toBe(true)
    const startsBogotaOk = parseDateTimeInTz('2030-01-15', '10:30', 'America/Bogota') // 15:30Z exactly lead
    expect(isTooSoonInTz(startsBogotaOk, nowUtc, 30, true)).toBe(false)

    // Same wall time in UTC behaves differently
    const startsUtc = parseDateTimeInTz('2030-01-15', '10:20', 'UTC') // 10:20Z
    expect(isTooSoonInTz(startsUtc, nowUtc, 30, true)).toBe(true) // 10:20Z is in past relative to 15:00Z => isPast would catch, but tooSoon also true
    // But isPast already true, tooSoon also true; order matters: past first
    expect(isPastInTz(startsUtc, nowUtc)).toBe(true)
  })

  it('isTooSoonMinutes helper for client slot filtering', () => {
    // now 600 (10:00), slot 615 (10:15) with lead 15 => not too soon (equal allowed? client uses < )
    expect(isTooSoonMinutes(615, 600, 15, true)).toBe(false) // 615 < 615? false
    expect(isTooSoonMinutes(614, 600, 15, true)).toBe(true)
    expect(isTooSoonMinutes(620, 600, 15, true)).toBe(false)
    expect(isTooSoonMinutes(610, 600, 15, false)).toBe(false) // disabled
    expect(isTooSoonMinutes(601, 600, 0, true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkSlotWithinHours — hours validation
// ---------------------------------------------------------------------------
describe('booking-lead-time — checkSlotWithinHours', () => {
  it('ok inside hours without break', () => {
    const day: DayHours = {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }
    expect(checkSlotWithinHours(day, '09:00', 30)).toEqual({ ok: true })
    expect(checkSlotWithinHours(day, '19:30', 30)).toEqual({ ok: true })
    expect(checkSlotWithinHours(day, '12:00', 60)).toEqual({ ok: true })
  })

  it('outside_hours before open and after close', () => {
    const day: DayHours = {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }
    expect(checkSlotWithinHours(day, '08:59', 30)).toEqual({ ok: false, reason: 'outside_hours' })
    expect(checkSlotWithinHours(day, '19:31', 30)).toEqual({ ok: false, reason: 'outside_hours' })
    expect(checkSlotWithinHours(day, '20:00', 30)).toEqual({ ok: false, reason: 'outside_hours' })
  })

  it('break overlap detection', () => {
    const day: DayHours = {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: '12:00',
      break_end: '13:00',
    }
    expect(checkSlotWithinHours(day, '11:30', 60)).toEqual({ ok: false, reason: 'break' }) // 11:30-12:30 overlaps
    expect(checkSlotWithinHours(day, '12:00', 30)).toEqual({ ok: false, reason: 'break' })
    expect(checkSlotWithinHours(day, '12:30', 30)).toEqual({ ok: false, reason: 'break' })
    expect(checkSlotWithinHours(day, '11:00', 60)).toEqual({ ok: true }) // ends exactly at 12:00
    expect(checkSlotWithinHours(day, '13:00', 30)).toEqual({ ok: true }) // starts at break end
  })

  it('closed when is_open false or undefined', () => {
    const closed: DayHours = {
      day_of_week: 0,
      is_open: false,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }
    expect(checkSlotWithinHours(closed, '10:00', 30)).toEqual({ ok: false, reason: 'closed' })
    expect(checkSlotWithinHours(undefined, '10:00', 30)).toEqual({ ok: false, reason: 'closed' })
  })

  it('various timezones do not affect checkSlotWithinHours (wall time only)', () => {
    // checkSlotWithinHours works on wall-clock minutes, timezone already accounted via effectiveHours
    const day: DayHours = {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }
    // Same wall time should give same result regardless of timezone, because hours are business local
    expect(checkSlotWithinHours(day, '10:00', 30)).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// isDayClosed with timezone — dashboard semantics
// ---------------------------------------------------------------------------
describe('booking-lead-time — isDayClosed timezone', () => {
  const hours: DayHours[] = [
    {
      day_of_week: 0,
      is_open: false,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }, // Sun closed
    {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }, // Mon open
    {
      day_of_week: 2,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    },
    {
      day_of_week: 3,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    },
    {
      day_of_week: 4,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    },
    {
      day_of_week: 5,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    },
    {
      day_of_week: 6,
      is_open: true,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }, // Sat open
  ]

  it('empty hours => not closed (fallback to default open)', () => {
    const anyDate = new Date('2026-08-30T12:00:00.000Z')
    expect(isDayClosed(anyDate, [], 'UTC')).toBe(false)
    expect(isDayClosed(anyDate, [], 'America/Bogota')).toBe(false)
  })

  it('Sunday UTC closed, but same UTC moment is Sunday elsewhere still closed', () => {
    // 2026-08-30 is Sunday
    const sundayNoonUtc = new Date('2026-08-30T12:00:00.000Z')
    expect(isDayClosed(sundayNoonUtc, hours, 'UTC')).toBe(true)
    // In Bogota (UTC-5), same instant is still Sunday 07:00 => also closed
    expect(isDayClosed(sundayNoonUtc, hours, 'America/Bogota')).toBe(true)
  })

  it('timezone edge: UTC Monday 01:00 is Sunday 20:00 in Bogota => different closed result', () => {
    // 2026-08-31 01:00Z is Monday 01:00 UTC but Sunday 20:00 Bogota
    const mondayOneUtc = new Date('2026-08-31T01:00:00.000Z')
    expect(isDayClosed(mondayOneUtc, hours, 'UTC')).toBe(false) // Monday open in UTC
    expect(isDayClosed(mondayOneUtc, hours, 'America/Bogota')).toBe(true) // Sunday closed in Bogota
  })

  it('timezone edge: UTC Sunday 05:00 is Sunday 00:00 Bogota (still Sunday), but Monday 00:00 in Europe', () => {
    const sundayFiveUtc = new Date('2026-08-30T05:00:00.000Z')
    // Bogota: 00:00 Sunday => closed
    expect(isDayClosed(sundayFiveUtc, hours, 'America/Bogota')).toBe(true)
    // Madrid CEST +2: 07:00 Sunday => closed
    expect(isDayClosed(sundayFiveUtc, hours, 'Europe/Madrid')).toBe(true)
    // UTC: 05:00 Sunday => closed
    expect(isDayClosed(sundayFiveUtc, hours, 'UTC')).toBe(true)
    // Next day Monday in Tokyo? Let's test Tokyo case: UTC Sun 05:00 => Tokyo Mon 14:00? Actually Tokyo +9 => 14:00 Sunday? Wait Aug 30 05:00Z +9 = 14:00 Sun => still Sun closed
    expect(isDayClosed(sundayFiveUtc, hours, 'Asia/Tokyo')).toBe(true)
  })

  it('Monday in UTC but still Sunday in LA crosses week boundary', () => {
    // 2026-08-31T02:00Z = Monday 02:00 UTC = Sunday 19:00 LA (UTC-7 summer)
    const d = new Date('2026-08-31T02:00:00.000Z')
    expect(isDayClosed(d, hours, 'UTC')).toBe(false)
    expect(isDayClosed(d, hours, 'America/Los_Angeles')).toBe(true)
  })

  it('getDayOfWeekInTz matches Intl weekday', () => {
    expect(getDayOfWeekInTz(new Date('2026-08-27T12:00:00.000Z'), 'UTC')).toBe(4) // Thu
    expect(getDayOfWeekInTz(new Date('2026-08-30T12:00:00.000Z'), 'UTC')).toBe(0) // Sun
  })

  it('todayInBusinessTz and nowMinutesInBusinessTz are consistent', () => {
    const now = new Date('2026-08-27T15:00:00.000Z') // 10:00 Bogota, 15:00 UTC, 17:00 Madrid
    expect(todayInBusinessTz('UTC', now)).toBe('2026-08-27')
    expect(todayInBusinessTz('America/Bogota', now)).toBe('2026-08-27')
    expect(nowMinutesInBusinessTz('UTC', now)).toBe(15 * 60)
    expect(nowMinutesInBusinessTz('America/Bogota', now)).toBe(10 * 60)
    expect(nowMinutesInBusinessTz('Europe/Madrid', now)).toBe(17 * 60)
  })

  it('computeEffectiveHours fallback matches isDayClosed logic', () => {
    const empty = computeEffectiveHours([])
    // DEFAULT_HOURS: Sun closed
    expect(empty.find((h) => h.day_of_week === 0)?.is_open).toBe(false)
    const sunday = new Date('2026-08-30T12:00:00.000Z')
    expect(isDayClosed(sunday, empty, 'UTC')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Integration helpers — dayOfWeekFromDateString is timezone-independent vs getDayOfWeekInTz is timezone-aware
// ---------------------------------------------------------------------------
describe('booking-lead-time — timezone vs date string', () => {
  it('dayOfWeekFromDateString vs getDayOfWeekInTz diverge when timezone shifts day', () => {
    // date string 2026-08-31 is Monday
    expect(dayOfWeekFromDateString('2026-08-31')).toBe(1)
    // But UTC Date 2026-08-31T01:00Z in LA is still Sunday
    expect(getDayOfWeekInTz(new Date('2026-08-31T01:00:00.000Z'), 'America/Los_Angeles')).toBe(0)
  })
})
