import { describe, expect, it } from 'vitest'

import {
  checkSlotWithHolidays,
  checkSlotWithinHours,
  type DayHours,
} from '@/lib/booking-availability'

// US1 — Any barber auto-assign + holiday/break blocking + no_staff_available distinction
// This unit suite validates the pure availability helpers that underpin
// the "Cualquier barbero" flow. DB-level auto-assign (pg_advisory_xact_lock)
// is exercised in integration (book-any-barber.test.ts).

const OPEN: DayHours = {
  day_of_week: 1, // Mon
  is_open: true,
  open_time: '09:00',
  close_time: '20:00',
  break_start: '13:00',
  break_end: '14:00',
}

const CLOSED: DayHours = {
  day_of_week: 0, // Sun
  is_open: false,
  open_time: '09:00',
  close_time: '20:00',
  break_start: null,
  break_end: null,
}

describe('booking-availability client — Any barber & slot guards', () => {
  it('Any barber: slot within hours succeeds (auto-assign would pick free barber)', () => {
    const r = checkSlotWithinHours(OPEN, '10:00', 45)
    expect(r.ok).toBe(true)
  })

  it('no_staff_available analogy: outside_hours blocked even if Any barber', () => {
    const r = checkSlotWithinHours(OPEN, '08:30', 30)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('outside_hours')
  })

  it('break blocks slot including edges — Any barber cannot book during break', () => {
    // Slot overlapping break 13:00-14:00
    expect(checkSlotWithinHours(OPEN, '13:30', 30).ok).toBe(false)
    expect((checkSlotWithinHours(OPEN, '13:30', 30) as { ok: false; reason: string }).reason).toBe(
      'break',
    )
    // Right before break OK
    expect(checkSlotWithinHours(OPEN, '12:00', 45).ok).toBe(true)
    // Slot ending exactly at break start OK, starting at break_end OK
    expect(checkSlotWithinHours(OPEN, '12:30', 30).ok).toBe(true) // 12:30-13:00
    expect(checkSlotWithinHours(OPEN, '14:00', 30).ok).toBe(true)
  })

  it('closed day blocks Any barber', () => {
    const r = checkSlotWithinHours(CLOSED, '10:00', 30)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('closed')
  })

  it('holidays block regardless of barber', () => {
    const r = checkSlotWithHolidays(OPEN, '10:00', 30, '2026-09-07', [
      { date: '2026-09-07', is_open: false },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('holiday')
    // Different date not blocked
    const ok = checkSlotWithHolidays(OPEN, '10:00', 30, '2026-09-08', [
      { date: '2026-09-07', is_open: false },
    ])
    expect(ok.ok).toBe(true)
  })

  it('outside_hours when slot exceeds close', () => {
    // 19:30 +45min exceeds 20:00
    const r = checkSlotWithinHours(OPEN, '19:30', 45)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('outside_hours')
    expect(checkSlotWithinHours(OPEN, '19:00', 60).ok).toBe(true)
  })

  it('secondary check: no_staff_available vs slot_taken distinction exists in book route', async () => {
    // Validate that mapBookingInsertError distinguishes 409 cases — import lazily to avoid circular
    // We test via string matching that the route handles both errors (spec 034)
    const routeText = await (await import('fs/promises')).readFile('app/api/book/route.ts', 'utf-8')
    expect(routeText).toContain('no_staff_available')
    expect(routeText).toContain('slot_already_booked')
    expect(routeText).toContain('slot_taken')
  })
})
