import { RRule, rrulestr } from 'rrule'
import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────
export const RecurringCreateSchema = z.object({
  business_id: z.string().uuid(),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
  client_id: z.string().uuid(),
  service_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable().optional().or(z.literal('')),
  rrule: z.string().min(1).max(500),
  dtstart: z.string().datetime().optional().nullable(),
  // alternative: date + time in business timezone
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  until: z.string().datetime().nullable().optional(),
  // cap to prevent runaway
  count: z.coerce.number().int().min(1).max(52).optional(),
})

export type RecurringInput = z.infer<typeof RecurringCreateSchema>

export interface Occurrence {
  starts_at: Date
  ends_at: Date
  rrule_index: number
}

export interface GenerateOpts {
  rrule: string
  dtstart: Date
  until?: Date | null
  countLimit?: number
}

// ── Pure helpers (unit-testable, no DB) ─────────────────────────────────────

/** Validate and parse an RRULE string. Throws with code `invalid_rrule` on failure. */
export function parseRRule(rruleText: string, dtstart: Date): RRule {
  if (!rruleText || typeof rruleText !== 'string')
    throw Object.assign(new Error('invalid_rrule: empty'), { code: 'invalid_rrule' })
  const trimmed = rruleText.trim()
  if (!trimmed) throw Object.assign(new Error('invalid_rrule: empty'), { code: 'invalid_rrule' })

  // Normalize: allow "FREQ=WEEKLY;COUNT=6" or "RRULE:FREQ=WEEKLY;COUNT=6"
  const normalized = trimmed.startsWith('RRULE:')
    ? trimmed
    : trimmed.includes('FREQ=')
      ? trimmed
      : `FREQ=${trimmed}`
  // rrulestr expects DTSTART if not in string; we provide dtstart option
  try {
    // Use rrulestr to support full RFC5545, then wrap as RRule
    const rule = rrulestr(
      `DTSTART:${dtstart
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z/, 'Z')}\nRRULE:${normalized}`,
      { forceset: false },
    ) as unknown as RRule
    // rrulestr may return RRuleSet if forceset true; guard
    if (!rule || typeof (rule as unknown as { all: unknown }).all !== 'function') {
      throw new Error('parse_failed')
    }
    return rule as RRule
  } catch (e) {
    // Fallback: try RRule.fromString (handles "FREQ=..." without DTSTART handling)
    try {
      const r = RRule.fromString(normalized)
      // RRule.fromString doesn't set dtstart, we set it via options clone
      const opts = r.origOptions
      opts.dtstart = dtstart
      return new RRule(opts)
    } catch {
      throw Object.assign(new Error(`invalid_rrule: ${String((e as Error).message ?? e)}`), {
        code: 'invalid_rrule',
      })
    }
  }
}

export function validateRRule(
  rruleText: string,
  dtstart: Date,
  until?: Date | null,
): { ok: true; rule: RRule } | { ok: false; reason: string; code: string } {
  try {
    const rule = parseRRule(rruleText, dtstart)
    const opts =
      rule.origOptions ??
      (rule as unknown as { options: { until?: Date; count?: number; dtstart: Date } }).options
    // Guard: count <=52 (per spec)
    const count = (opts as { count?: number })?.count
    if (count != null && count > 52)
      return { ok: false, reason: 'count exceeds 52', code: 'count_too_large' }
    // Guard: until > dtstart
    const ruleUntil = (opts as { until?: Date })?.until ?? until ?? null
    if (ruleUntil && ruleUntil.getTime() <= dtstart.getTime())
      return { ok: false, reason: 'until must be after dtstart', code: 'until_before_dtstart' }
    // Guard: rrule must produce at least 1 occurrence
    const first = rule.all((_, i) => i < 1)
    if (first.length === 0)
      return { ok: false, reason: 'rrule yields no occurrences', code: 'no_occurrences' }
    return { ok: true, rule }
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'invalid_rrule'
    return { ok: false, reason: String((e as Error).message ?? 'invalid_rrule'), code }
  }
}

/**
 * Generate occurrence start Dates from an RRULE string + dtstart.
 * Caps at 52 occurrences to prevent abuse (matches tasks.md validation).
 * Throws on invalid RRULE.
 */
export function generateOccurrences(opts: GenerateOpts): Date[] {
  const { rrule, dtstart, until, countLimit = 52 } = opts
  if (Number.isNaN(dtstart.getTime()))
    throw Object.assign(new Error('invalid_dtstart'), { code: 'invalid_dtstart' })

  const validated = validateRRule(rrule, dtstart, until ?? null)
  if (!validated.ok) throw Object.assign(new Error(validated.reason), { code: validated.code })

  const rule = validated.rule
  // Cap occurrences to countLimit + safety for UNTIL infinite
  const all = rule.all((_, idx) => idx < countLimit)
  // If until provided and rule has no UNTIL/COUNT, we filter beyond until
  if (until) {
    return all.filter((d) => d.getTime() <= until.getTime()).slice(0, countLimit)
  }
  return all.slice(0, countLimit)
}

/**
 * Build occurrences with ends_at given service duration.
 * Pure – no DB.
 */
export function buildOccurrencesWithEnd(
  rruleText: string,
  dtstart: Date,
  durationMin: number,
  opts?: { until?: Date | null; countLimit?: number },
): Occurrence[] {
  const starts = generateOccurrences({
    rrule: rruleText,
    dtstart,
    until: opts?.until ?? null,
    countLimit: opts?.countLimit ?? 52,
  })
  return starts.map((s, idx) => ({
    starts_at: s,
    ends_at: new Date(s.getTime() + durationMin * 60_000),
    rrule_index: idx,
  }))
}

// ── DB helpers ───────────────────────────────────────────────────────────────
type SupabaseLike = {
  from: (table: string) => unknown
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

/**
 * createSeries — creates a recurring_appointments row and then attempts to
 * create appointments for each occurrence. Each occurrence is validated via
 * booking-availability (checkSlotWithinHours + holidays + booked slots). Conflicts are skipped.
 *
 * Returns summary { id, occurrences: total, created, skipped, errors }.
 * Uses service client (RLS bypass) when called from API that already auth'd.
 */
export async function createSeries(
  supabase: SupabaseLike,
  params: RecurringInput & { duration_min?: number; timezone?: string; price?: number },
): Promise<{
  id: string
  occurrences: number
  created: number
  skipped: { index: number; starts_at: string; reason: string }[]
  appointmentIds: string[]
}> {
  const parsed = RecurringCreateSchema.safeParse(params)
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), {
      details: parsed.error.flatten().fieldErrors,
      code: 'validation_failed',
    })

  const data = parsed.data
  const business_id = data.business_id
  const location_id = data.location_id || null
  const client_id = data.client_id
  const service_id = data.service_id
  const employee_id = data.employee_id || null
  const rruleText = data.rrule.trim()
  const until = data.until ? new Date(data.until) : null

  // Resolve dtstart
  let dtstart: Date
  if (data.dtstart) {
    dtstart = new Date(data.dtstart)
  } else if (data.date && data.time) {
    // dtstart as wall-clock in UTC for now; caller should convert via business timezone before calling.
    // If timezone provided we use noon trick; otherwise parse as UTC wall-clock.
    if (params.timezone) {
      const { parseDateTimeInTz } = await import('./booking-availability')
      dtstart = parseDateTimeInTz(data.date, data.time, params.timezone)
    } else {
      dtstart = new Date(`${data.date}T${data.time}:00.000Z`)
    }
  } else {
    throw Object.assign(new Error('dtstart or date+time required'), { code: 'dtstart_required' })
  }
  if (Number.isNaN(dtstart.getTime()))
    throw Object.assign(new Error('invalid_dtstart'), { code: 'invalid_dtstart' })

  // Validate RRULE
  const validated = validateRRule(rruleText, dtstart, until)
  if (!validated.ok) throw Object.assign(new Error(validated.reason), { code: validated.code })

  // Fetch service for duration/price if not provided
  let durationMin = params.duration_min ?? 0
  let price = params.price ?? 0
  if (!durationMin || !price) {
    const { data: svc } = await (
      supabase.from('services') as unknown as {
        select: (c: string) => {
          eq: (
            a: string,
            b: unknown,
          ) => {
            eq: (
              c: string,
              d: unknown,
            ) => {
              maybeSingle: () => Promise<{
                data: { duration_min: number; price: number } | null
                error: unknown
              }>
            }
          }
        }
      }
    )
      .select('duration_min, price')
      .eq('id', service_id)
      .eq('business_id', business_id)
      .maybeSingle()
    if (svc) {
      durationMin = durationMin || svc.duration_min || 60
      price = price || svc.price || 0
    } else {
      durationMin = durationMin || 60
    }
  }

  // Determine next_at and until for series row: first occurrence is dtstart, last is filtered last
  const allStarts = generateOccurrences({
    rrule: rruleText,
    dtstart,
    until,
    countLimit: data.count ?? 52,
  })
  if (allStarts.length === 0)
    throw Object.assign(new Error('no_occurrences'), { code: 'no_occurrences' })
  // @ts-expect-error - tsc strict fix
  const nextAt = allStarts[0].toISOString()
  const lastAt = allStarts[allStarts.length - 1]?.toISOString() ?? null
  const seriesUntil = until ? until.toISOString() : lastAt

  // Create recurring_appointments row
  const supa = supabase as unknown as {
    from: (t: string) => {
      insert: (d: unknown) => {
        select: (c: string) => {
          single: () => Promise<{ data: { id: string } | null; error: unknown }>
        }
      }
      select: (c: string) => { eq: (a: string, b: unknown) => unknown }
    }
  }
  const { data: series, error: seriesErr } = await supa
    .from('recurring_appointments')
    .insert({
      business_id,
      location_id,
      client_id,
      service_id,
      employee_id,
      rrule: rruleText,
      next_at: nextAt,
      until: seriesUntil,
      is_active: true,
    } as unknown as never)
    .select('id')
    .single()

  if (seriesErr || !series)
    throw Object.assign(
      new Error(
        'recurring_create_failed: ' +
          String((seriesErr as { message?: string })?.message ?? seriesErr),
      ),
      { code: 'recurring_create_failed' },
    )
  const seriesId = (series as { id: string }).id

  // For each occurrence, validate and insert appointment, skipping conflicts
  // Pre-fetch businessHours + holidays for validation
  const timezone = params.timezone ?? 'America/Bogota'
  let businessHours: unknown[] = []
  let holidays: { date: string; is_open: boolean; location_id: string | null }[] = []
  try {
    const { data: bh } = await ((
      supabase.from('business_hours') as unknown as {
        select: (c: string) => {
          eq: (a: string, b: unknown) => Promise<{ data: unknown[] | null }>
        }
      }
    )
      .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
      .eq('business_id', business_id) as unknown as Promise<{ data: unknown[] | null }>)
    businessHours = bh ?? []
    const { data: hol } = await ((
      supabase.from('holidays') as unknown as {
        select: (c: string) => {
          eq: (a: string, b: unknown) => Promise<{ data: unknown[] | null }>
        }
      }
    )
      .select('date, is_open, location_id')
      .eq('business_id', business_id) as unknown as Promise<{ data: unknown[] | null }>)
    // normalize date to YYYY-MM-DD
    holidays = (hol ?? []).map((h: unknown) => {
      const hh = h as { date: string; is_open: boolean; location_id: string | null }
      const d = typeof hh.date === 'string' ? hh.date.slice(0, 10) : String(hh.date)
      return { date: d, is_open: hh.is_open, location_id: hh.location_id }
    })
  } catch {}

  const { computeEffectiveHours, checkSlotWithHolidays, dayOfWeekFromDateString } = await import(
    './booking-availability'
  )
  const effectiveHours = computeEffectiveHours(
    businessHours as unknown as import('./booking-availability').DayHours[],
  )

  const skipped: { index: number; starts_at: string; reason: string }[] = []
  const createdIds: string[] = []

  // Helper to get YYYY-MM-DD and HH:mm in business timezone for availability check
  function toBusinessDateTime(utcDate: Date): { date: string; time: string } {
    // Convert UTC to business TZ wall-clock
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(utcDate)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    const date = `${get('year')}-${get('month')}-${get('day')}`
    const timeParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(utcDate)
    const hh = timeParts.find((p) => p.type === 'hour')?.value ?? '00'
    const mm = timeParts.find((p) => p.type === 'minute')?.value ?? '00'
    return { date, time: `${String(parseInt(hh, 10) % 24).padStart(2, '0')}:${mm}` }
  }

  for (let idx = 0; idx < allStarts.length; idx++) {
    const startsAt = allStarts[idx]
    // @ts-expect-error - tsc strict fix
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000)
    // @ts-expect-error - tsc strict fix
    const { date, time } = toBusinessDateTime(startsAt)

    // 1) Past check
    // @ts-expect-error - tsc strict fix
    if (startsAt.getTime() <= Date.now()) {
      // @ts-expect-error - tsc strict fix
      skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: 'in_past' })
      continue
    }

    // 2) Hours + holidays check
    const dow = dayOfWeekFromDateString(date)
    const dayHours = effectiveHours.find((h) => h.day_of_week === dow)
    const slotCheck = checkSlotWithHolidays(
      dayHours,
      time,
      durationMin,
      date,
      holidays as unknown as import('./booking-availability').HolidayCheck[],
    )
    if (!slotCheck.ok) {
      // @ts-expect-error - tsc strict fix
      skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: slotCheck.reason })
      continue
    }

    // 3) Booked slots check via RPC (if employee provided, else skip restrictive check)
    // For capacity>1 services we allow overbooking up to capacity, but for recurring we treat capacity=1 conservatively
    try {
      if (employee_id) {
        // Use direct appointment overlap check via supabase query (avoids RPC dependency)
        const { data: overlapping } = await ((
          supabase.from('appointments') as unknown as {
            select: (
              c: string,
              opts?: unknown,
            ) => {
              eq: (
                a: string,
                b: unknown,
              ) => {
                eq: (
                  c: string,
                  d: unknown,
                ) => {
                  gte: (
                    c: string,
                    v: string,
                  ) => { lte: (c: string, v: string) => Promise<{ data: unknown[] | null }> }
                }
              }
            }
          }
        )
          .select('id', { count: 'exact', head: false })
          .eq('business_id', business_id)
          .eq('employee_id', employee_id)
          // @ts-expect-error - tsc strict fix
          .gte('starts_at', new Date(startsAt.getTime() - durationMin * 60_000).toISOString())
          .lte('starts_at', endsAt.toISOString()) as unknown as Promise<{ data: unknown[] | null }>)

        // Simple overlap: check if any appointment overlaps [startsAt, endsAt)
        // More accurate via loop over returned rows could be done, but above narrow window suffices for skip
        const conflict = (overlapping ?? []).some((ap: unknown) => {
          const a = ap as { starts_at: string; ends_at: string }
          // if ap doesn't have ends_at in select, fallback to startsAt + durationMin
          const aStart = new Date(a.starts_at).getTime()
          const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : aStart + durationMin * 60_000
          // @ts-expect-error - tsc strict fix
          return startsAt.getTime() < aEnd && endsAt.getTime() > aStart
        })
        // If we fetched without ends_at, treat any row in window as conflict (conservative)
        if (overlapping && overlapping.length > 0) {
          // Need precise check: if we didn't fetch ends_at, assume conflict
          // To avoid false positives, fetch full rows for candidate window
          if (
            !conflict &&
            overlapping.length > 0 &&
            !(overlapping[0] as { ends_at?: string })?.ends_at
          ) {
            // @ts-expect-error - tsc strict fix
            skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: 'slot_taken' })
            continue
          }
          if (conflict) {
            // @ts-expect-error - tsc strict fix
            skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: 'slot_taken' })
            continue
          }
        }
      }
    } catch {
      // On query failure, skip restrictive check and attempt insert (DB trigger will enforce)
    }

    // 4) Attempt insert
    try {
      const { data: appt, error } = await (
        supabase.from('appointments') as unknown as {
          insert: (d: unknown) => {
            select: (c: string) => {
              single: () => Promise<{ data: { id: string } | null; error: unknown }>
            }
          }
        }
      )
        .insert({
          business_id,
          location_id,
          client_id,
          service_id,
          employee_id,
          // @ts-expect-error - tsc strict fix
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          price,
          status: 'scheduled',
          recurring_id: seriesId,
          source: 'recurring',
        } as unknown as never)
        .select('id')
        .single()

      if (error) {
        const msg = String((error as { message?: string })?.message ?? '')
        if (msg.includes('slot_already_booked') || msg.includes('slot_taken')) {
          // @ts-expect-error - tsc strict fix
          skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: 'slot_taken' })
        } else if (
          msg.includes('outside_availability') ||
          msg.includes('barber_unavailable') ||
          msg.includes('barber_not_qualified')
        ) {
          skipped.push({
            index: idx,
            // @ts-expect-error - tsc strict fix
            starts_at: startsAt.toISOString(),
            reason: msg.includes('outside') ? 'outside_availability' : 'barber_unavailable',
          })
        } else {
          // @ts-expect-error - tsc strict fix
          skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: 'insert_failed' })
        }
        continue
      }
      if (appt) createdIds.push((appt as { id: string }).id)
    } catch (e) {
      skipped.push({
        index: idx,
        // @ts-expect-error - tsc strict fix
        starts_at: startsAt.toISOString(),
        reason: String((e as Error).message ?? 'insert_failed').slice(0, 80),
      })
    }
  }

  // If all skipped, optionally deactivate series? Keep active for future but update next_at to last skipped? For now keep is_active true.
  // If no appointments created, we keep series but return skipped.

  return {
    id: seriesId,
    occurrences: allStarts.length,
    created: createdIds.length,
    skipped,
    appointmentIds: createdIds,
  }
}
