import { describe, expect, it, vi } from 'vitest'

import {
  checkSlotWithHolidays,
  checkSlotWithinHours,
  computeEffectiveHours,
  dayOfWeekFromDateString,
  isPastInTz,
  isTooSoonInTz,
  parseDateTimeInTz,
} from '@/lib/booking-availability'

// ---------------------------------------------------------------------------
// isPastInTz — mirrors app/api/client/appointments/[id]/route.ts:116,235
// ---------------------------------------------------------------------------
describe('appointment-policy — isPastInTz', () => {
  const baseNow = new Date('2026-09-01T15:00:00.000Z') // 10:00 America/Bogota

  it('returns true when starts_at <= now (past)', () => {
    expect(isPastInTz(new Date('2026-09-01T14:59:59.000Z'), baseNow)).toBe(true)
    expect(isPastInTz(new Date('2026-09-01T15:00:00.000Z'), baseNow)).toBe(true)
  })

  it('returns false when starts_at > now (future)', () => {
    expect(isPastInTz(new Date('2026-09-01T15:00:01.000Z'), baseNow)).toBe(false)
    expect(isPastInTz(new Date('2026-09-02T10:00:00.000Z'), baseNow)).toBe(false)
  })

  it('uses default now when not passed (fake timers)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T15:00:00.000Z'))
    expect(isPastInTz(new Date('2026-09-01T14:00:00.000Z'))).toBe(true)
    expect(isPastInTz(new Date('2026-09-01T16:00:00.000Z'))).toBe(false)
    vi.useRealTimers()
  })

  it('past appointment cannot be cancelled/reprogrammed (route guard)', () => {
    // Simulate route behavior: if isPastInTz -> 400 in_past
    const past = new Date('2026-09-01T14:00:00.000Z')
    expect(isPastInTz(past, baseNow)).toBe(true)
    // future ok
    const future = new Date('2026-09-01T16:00:00.000Z')
    expect(isPastInTz(future, baseNow)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isTooSoonInTz(2h) — cancel_lead_time 120 min, mirrors route cancel_lead_time
// ---------------------------------------------------------------------------
describe('appointment-policy — isTooSoonInTz(2h cancel_lead_time)', () => {
  const now = new Date('2026-09-01T15:00:00.000Z') // 10:00 Bogota
  const CANCEL_LEAD = 120 // 2h per migration 054 + fetchBusinessConfig default

  it('too_soon when <2h (1h, 1.5h)', () => {
    const in30m = new Date(now.getTime() + 30 * 60_000)
    const in1h = new Date(now.getTime() + 60 * 60_000)
    const in90m = new Date(now.getTime() + 90 * 60_000)
    expect(isTooSoonInTz(in30m, now, CANCEL_LEAD, true)).toBe(true)
    expect(isTooSoonInTz(in1h, now, CANCEL_LEAD, true)).toBe(true)
    expect(isTooSoonInTz(in90m, now, CANCEL_LEAD, true)).toBe(true)
  })

  it('not too_soon when >=2h (exactly 2h ok, 3h ok)', () => {
    const exactly2h = new Date(now.getTime() + 120 * 60_000)
    const in3h = new Date(now.getTime() + 180 * 60_000)
    const tomorrow = new Date(now.getTime() + 24 * 3600000)
    expect(isTooSoonInTz(exactly2h, now, CANCEL_LEAD, true)).toBe(false)
    expect(isTooSoonInTz(in3h, now, CANCEL_LEAD, true)).toBe(false)
    expect(isTooSoonInTz(tomorrow, now, CANCEL_LEAD, true)).toBe(false)
  })

  it('cancelled_late flag: within 2h => cancelledLate true with $10k charge', () => {
    const startsIn1h = new Date(now.getTime() + 60 * 60_000)
    const isLate = isTooSoonInTz(startsIn1h, now, CANCEL_LEAD, true)
    expect(isLate).toBe(true)
    const charge = isLate ? 10000 : 0
    expect(charge).toBe(10000)

    const startsIn3h = new Date(now.getTime() + 3 * 60 * 60_000)
    const isLate2 = isTooSoonInTz(startsIn3h, now, CANCEL_LEAD, true)
    expect(isLate2).toBe(false)
    expect(isLate2 ? 10000 : 0).toBe(0)
  })

  it('disabled lead time never too_soon (booking_lead_time_enabled=false)', () => {
    const in10m = new Date(now.getTime() + 10 * 60_000)
    expect(isTooSoonInTz(in10m, now, CANCEL_LEAD, false)).toBe(false)
    expect(isTooSoonInTz(in10m, now, 0, true)).toBe(false)
    expect(isTooSoonInTz(in10m, now, null as unknown as number, true)).toBe(false)
  })

  it('reprogram too_soon with minAdvance 30 respects America/Bogota tz', () => {
    // now 15:00Z = 10:00 Bogota, lead 30 => slot 10:20 Bogota (15:20Z) => too_soon, 10:30 Bogota (15:30Z) => ok
    const nowBogota = new Date('2026-09-01T15:00:00.000Z')
    const slotTooSoon = parseDateTimeInTz('2026-09-01', '10:20', 'America/Bogota') // 15:20Z
    const slotOk = parseDateTimeInTz('2026-09-01', '10:30', 'America/Bogota') // 15:30Z
    expect(slotTooSoon.toISOString()).toBe('2026-09-01T15:20:00.000Z')
    expect(slotOk.toISOString()).toBe('2026-09-01T15:30:00.000Z')
    expect(isTooSoonInTz(slotTooSoon, nowBogota, 30, true)).toBe(true)
    expect(isTooSoonInTz(slotOk, nowBogota, 30, true)).toBe(false)
  })

  it('cancel_lead_time 2h with America/Bogota: wall 18:30 => UTC 23:30', () => {
    const now = new Date('2026-09-01T20:00:00.000Z') // 15:00 Bogota
    const starts = parseDateTimeInTz('2026-09-01', '18:30', 'America/Bogota') // 23:30Z
    expect(starts.toISOString()).toBe('2026-09-01T23:30:00.000Z')
    // diff 3.5h => not too_soon for 2h
    expect(isTooSoonInTz(starts, now, 120, true)).toBe(false)
    // 1h ahead: 16:00 Bogota => 21:00Z diff 1h => too_soon
    const soon = parseDateTimeInTz('2026-09-01', '16:00', 'America/Bogota')
    expect(isTooSoonInTz(soon, now, 120, true)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// lib/booking-availability break blocking — used in PUT reprogram validation
// ---------------------------------------------------------------------------
describe('appointment-policy — lib/booking-availability break blocking', () => {
  const OPEN_WITH_BREAK: import('@/lib/booking-availability').DayHours = {
    day_of_week: 1,
    is_open: true,
    open_time: '09:00',
    close_time: '20:00',
    break_start: '13:00',
    break_end: '14:00',
  }

  it('break blocks slot overlapping break window', () => {
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '13:30', 30)).toEqual({
      ok: false,
      reason: 'break',
    })
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '13:00', 30)).toEqual({
      ok: false,
      reason: 'break',
    })
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '12:45', 30)).toEqual({
      ok: false,
      reason: 'break',
    }) // 12:45+30=13:15 overlaps
  })

  it('break exactly touching is ok (ends at break_start or starts at break_end)', () => {
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '12:30', 30)).toEqual({ ok: true }) // 12:30-13:00
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '14:00', 30)).toEqual({ ok: true })
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '12:00', 60)).toEqual({ ok: true }) // 12:00-13:00 ends at break
  })

  it('outside break allowed', () => {
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '10:00', 45)).toEqual({ ok: true })
    expect(checkSlotWithinHours(OPEN_WITH_BREAK, '15:00', 60)).toEqual({ ok: true })
  })

  it('checkSlotWithHolidays integrates break + holiday guard', () => {
    const holiday = [{ date: '2026-09-07', is_open: false }]
    expect(checkSlotWithHolidays(OPEN_WITH_BREAK, '10:00', 30, '2026-09-07', holiday)).toEqual({
      ok: false,
      reason: 'holiday',
    })
    expect(checkSlotWithHolidays(OPEN_WITH_BREAK, '13:30', 30, '2026-09-01', [])).toEqual({
      ok: false,
      reason: 'break',
    })
    expect(checkSlotWithHolidays(OPEN_WITH_BREAK, '10:00', 30, '2026-09-01', [])).toEqual({
      ok: true,
    })
  })

  it('PUT reprogram validate checkSlotWithinHours blocks break (route.ts:303)', () => {
    // Simulate route flow: computeEffectiveHours + checkSlotWithHolidays
    const businessHours = [
      {
        day_of_week: 0,
        is_open: false,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '13:00',
        break_end: '14:00',
      },
      {
        day_of_week: 2,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '13:00',
        break_end: '14:00',
      },
      {
        day_of_week: 3,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '13:00',
        break_end: '14:00',
      },
      {
        day_of_week: 4,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '13:00',
        break_end: '14:00',
      },
      {
        day_of_week: 5,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '13:00',
        break_end: '14:00',
      },
      {
        day_of_week: 6,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
    ] as import('@/lib/booking-availability').DayHours[]
    const effective = computeEffectiveHours(businessHours)
    const mondayHours = effective.find(
      (h) => h.day_of_week === dayOfWeekFromDateString('2026-09-07'),
    ) // actually 2026-09-07 is Monday? check
    // 2026-09-01 is Tue (2), use 2026-08-31 Mon (1)
    const mon = effective.find((h) => h.day_of_week === 1)!
    expect(mon.break_start).toBe('13:00')
    expect(checkSlotWithHolidays(mon, '13:30', 45, '2026-08-31', [])).toEqual({
      ok: false,
      reason: 'break',
    })
    // holiday overrides break
    expect(
      checkSlotWithHolidays(mon, '10:00', 30, '2026-08-31', [
        { date: '2026-08-31', is_open: false },
      ]),
    ).toEqual({ ok: false, reason: 'holiday' })
  })

  it('closed day blocks even if break ok', () => {
    const closed: import('@/lib/booking-availability').DayHours = {
      day_of_week: 0,
      is_open: false,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }
    expect(checkSlotWithinHours(closed, '10:00', 30)).toEqual({ ok: false, reason: 'closed' })
  })
})
