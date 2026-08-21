/**
 * Single source of truth for "is this business open at this time", shared
 * between the public booking form (client-side slot generation) and
 * /api/book (server-side validation before insert). Keeping one copy avoids
 * the two silently drifting apart.
 *
 * This repo has no multi-location or per-employee-hours concept — business
 * hours are a single set of rows per business_id/day_of_week (see migration
 * 009), with an optional business-wide break window (migration 035).
 */

export interface DayHours {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
  break_start?: string | null
  break_end?: string | null
}

export const DEFAULT_HOURS: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
  day_of_week: dow,
  is_open: dow >= 1 && dow <= 5,
  open_time: '09:00',
  close_time: '20:00',
  break_start: null,
  break_end: null,
}))

/** Fills in DEFAULT_HOURS for any day missing a business_hours row. */
export function computeEffectiveHours(workingHours: DayHours[]): DayHours[] {
  return DEFAULT_HOURS.map((def) => workingHours.find((h) => h.day_of_week === def.day_of_week) ?? def)
}

export type SlotUnavailableReason = 'closed' | 'outside_hours' | 'break'

/**
 * Checks one specific start time (+ duration) against a day's effective
 * hours: the day must be open, the slot must fit entirely within
 * open_time..close_time, and it must not overlap the break window (if any).
 * Mirrors generateSlots()'s bounds + the break filter in booking-form.tsx,
 * just checking a single candidate instead of enumerating the whole day.
 */
export function checkSlotWithinHours(
  dayHours: DayHours | undefined,
  time: string,
  durationMin: number
): { ok: true } | { ok: false; reason: SlotUnavailableReason } {
  if (!dayHours || !dayHours.is_open) return { ok: false, reason: 'closed' }

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }

  const slotStart = toMin(time)
  const slotEnd = slotStart + durationMin
  const openMin = toMin(dayHours.open_time)
  const closeMin = toMin(dayHours.close_time)

  if (slotStart < openMin || slotEnd > closeMin) return { ok: false, reason: 'outside_hours' }

  if (dayHours.break_start && dayHours.break_end) {
    const breakStart = toMin(dayHours.break_start)
    const breakEnd = toMin(dayHours.break_end)
    if (slotStart < breakEnd && slotEnd > breakStart) return { ok: false, reason: 'break' }
  }

  return { ok: true }
}

/** Calendar day-of-week (0=Sun..6=Sat) for a "YYYY-MM-DD" date string, independent of any timezone. */
export function dayOfWeekFromDateString(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
