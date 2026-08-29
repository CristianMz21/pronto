/**
 * Single source of truth for "is this business open at this time", shared
 * between the public booking form (client-side slot generation) and
 * /api/book (server-side validation before insert). Keeping one copy avoids
 * the two silently drifting apart.
 *
 * This repo has no multi-location or per-employee-hours concept — business
 * hours are a single set of rows per business_id/day_of_week (see migration
 * 009), with an optional business-wide break window (migration 035).
 *
 * Lead time configuration (054): businesses.min_advance_minutes + booking_lead_time_enabled
 * is enforced at API/client for online bookings. DB trigger (053) only blocks
 * past bookings to allow immediate admin walk-ins from dashboard (BookingCalendar
 * deliberately only checks past, not too_soon).
 */

export interface DayHours {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
  break_start?: string | null
  break_end?: string | null
}

export const DEFAULT_LEAD_MINUTES = 30

export const DEFAULT_HOURS: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
  day_of_week: dow,
  is_open: dow >= 1 && dow <= 6,
  open_time: '09:00',
  close_time: '20:00',
  break_start: null,
  break_end: null,
}))

/** Fills in DEFAULT_HOURS for any day missing a business_hours row. */
export function computeEffectiveHours(workingHours: DayHours[]): DayHours[] {
  return DEFAULT_HOURS.map(
    (def) => workingHours.find((h) => h.day_of_week === def.day_of_week) ?? def,
  )
}

export type SlotUnavailableReason = 'closed' | 'outside_hours' | 'break' | 'holiday'

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
  durationMin: number,
): { ok: true } | { ok: false; reason: SlotUnavailableReason } {
  if (!dayHours?.is_open) return { ok: false, reason: 'closed' }

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    // @ts-expect-error - tsc strict fix
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

export interface HolidayCheck {
  date: string
  location_id?: string | null
  is_open?: boolean
}

export function checkSlotWithHolidays(
  dayHours: DayHours | undefined,
  time: string,
  durationMin: number,
  date: string,
  holidays: HolidayCheck[],
): { ok: true } | { ok: false; reason: SlotUnavailableReason } {
  if (holidays && holidays.length > 0) {
    const isHoliday = holidays.some((h) => h.date === date && h.is_open === false)
    if (isHoliday) return { ok: false, reason: 'holiday' }
  }
  return checkSlotWithinHours(dayHours, time, durationMin)
}

export function checkSlotWithinLocation(
  dayHours: DayHours | undefined,
  time: string,
  durationMin: number,
  opts?: { date?: string; holidays?: HolidayCheck[]; locationId?: string | null },
): { ok: true } | { ok: false; reason: SlotUnavailableReason } {
  if (opts?.holidays && opts?.date) {
    const filtered = opts.locationId
      ? opts.holidays.filter((h) => !h.location_id || h.location_id === opts.locationId)
      : opts.holidays
    const isHoliday = filtered.some((h) => h.date === opts.date && h.is_open === false)
    if (isHoliday) return { ok: false, reason: 'holiday' }
  }
  return checkSlotWithinHours(dayHours, time, durationMin)
}

/** Calendar day-of-week (0=Sun..6=Sat) for a "YYYY-MM-DD" date string, independent of any timezone. */
export function dayOfWeekFromDateString(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  // @ts-expect-error - tsc strict fix
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// ---------------------------------------------------------------------------
// Timezone-aware parsing and lead-time helpers (054)
// ---------------------------------------------------------------------------

/** Convert a wall-clock date+time (e.g. "2024-03-15", "14:30") in a named IANA timezone to a UTC Date. */
export function parseDateTimeInTz(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  // Use noon UTC on the same date as a stable reference to determine the TZ offset,
  // avoiding DST edge cases that only happen near midnight.
  // @ts-expect-error - tsc strict fix
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(noonUtc)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  const localNoonMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  const offsetMs = localNoonMs - noonUtc.getTime()
  // wall_clock = UTC + offset  →  UTC = wall_clock - offset
  // @ts-expect-error - tsc strict fix
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offsetMs)
}

/** True if startsAt is in the past (or now). UTC comparison — startsAt is already UTC via parseDateTimeInTz. */
export function isPastInTz(startsAt: Date, now: Date = new Date()): boolean {
  return startsAt.getTime() <= now.getTime()
}

/**
 * True if startsAt is too soon relative to now given a lead time config.
 * When enabled is false or minAdvanceMinutes <=0, never too soon (only past matters).
 */
export function isTooSoonInTz(
  startsAt: Date,
  now: Date,
  minAdvanceMinutes: number,
  enabled: boolean,
): boolean {
  if (!enabled) return false
  const lead = Number(minAdvanceMinutes ?? 0)
  if (!lead || lead <= 0) return false
  return startsAt.getTime() < now.getTime() + lead * 60_000
}

/** Helper for client-side wall-clock minute checks (booking-form slot filtering). */
export function isTooSoonMinutes(
  slotMinutes: number,
  nowMinutes: number,
  minAdvanceMinutes: number,
  enabled: boolean,
): boolean {
  if (!enabled) return false
  const lead = Number(minAdvanceMinutes ?? 0)
  if (!lead || lead <= 0) return false
  return slotMinutes < nowMinutes + lead
}

// ---------------------------------------------------------------------------
// Business timezone date helpers
// ---------------------------------------------------------------------------

/** Today as YYYY-MM-DD in the business timezone (hydration-safe via now param for tests). */
export function todayInBusinessTz(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Current time as minutes since midnight in the business timezone (hydration-safe). */
export function nowMinutesInBusinessTz(timezone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return (h % 24) * 60 + m
}

/** Day of week in business timezone for a given UTC Date. 0=Sun..6=Sat */
export function getDayOfWeekInTz(date: Date, timezone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? date.getDay()
}

/**
 * Whether a calendar date (UTC Date) is closed in the business timezone.
 * Pass businessHours as loaded from DB; empty array means use defaults (not closed).
 * This is the dashboard (BookingCalendar) semantic: no lead time, only closed check.
 * Admin walk-ins are allowed immediately (lead time 0) — see note in app/(dashboard)/booking/booking-calendar.tsx
 */
export function isDayClosed(date: Date, businessHours: DayHours[], timezone: string): boolean {
  if (!businessHours || businessHours.length === 0) return false
  const dow = getDayOfWeekInTz(date, timezone)
  const rule = businessHours.find((h) => h.day_of_week === dow)
  return rule ? !rule.is_open : false
}
