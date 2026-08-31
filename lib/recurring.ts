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

export function parseRRule(rruleText: string, dtstart: Date): RRule {
  if (!rruleText || typeof rruleText !== 'string')
    throw Object.assign(new Error('invalid_rrule: empty'), { code: 'invalid_rrule' })
  const trimmed = rruleText.trim()
  if (!trimmed) throw Object.assign(new Error('invalid_rrule: empty'), { code: 'invalid_rrule' })
  const normalized = trimmed.startsWith('RRULE:')
    ? trimmed
    : trimmed.includes('FREQ=')
      ? trimmed
      : `FREQ=${trimmed}`
  try {
    const rule = rrulestr(
      `DTSTART:${dtstart
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z/, 'Z')}\nRRULE:${normalized}`,
      { forceset: false },
    ) as unknown as RRule
    if (!rule || typeof (rule as unknown as { all: unknown }).all !== 'function')
      throw new Error('parse_failed')
    return rule as RRule
  } catch (e) {
    try {
      const r = RRule.fromString(normalized)
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
    const count = (opts as { count?: number })?.count
    if (count != null && count > 52)
      return { ok: false, reason: 'count exceeds 52', code: 'count_too_large' }
    const ruleUntil = (opts as { until?: Date })?.until ?? until ?? null
    if (ruleUntil && ruleUntil.getTime() <= dtstart.getTime())
      return { ok: false, reason: 'until must be after dtstart', code: 'until_before_dtstart' }
    const first = rule.all((_, i) => i < 1)
    if (first.length === 0)
      return { ok: false, reason: 'rrule yields no occurrences', code: 'no_occurrences' }
    return { ok: true, rule }
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'invalid_rrule'
    return { ok: false, reason: String((e as Error).message ?? 'invalid_rrule'), code }
  }
}

export function generateOccurrences(opts: GenerateOpts): Date[] {
  const { rrule, dtstart, until, countLimit = 52 } = opts
  if (Number.isNaN(dtstart.getTime()))
    throw Object.assign(new Error('invalid_dtstart'), { code: 'invalid_dtstart' })
  const validated = validateRRule(rrule, dtstart, until ?? null)
  if (!validated.ok) throw Object.assign(new Error(validated.reason), { code: validated.code })
  const rule = validated.rule
  const all = rule.all((_, idx) => idx < countLimit)
  if (until) return all.filter((d) => d.getTime() <= until.getTime()).slice(0, countLimit)
  return all.slice(0, countLimit)
}

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

async function resolveDtstart(data: RecurringInput, timezone?: string): Promise<Date> {
  if (data.dtstart) {
    const d = new Date(data.dtstart)
    if (Number.isNaN(d.getTime()))
      throw Object.assign(new Error('invalid_dtstart'), { code: 'invalid_dtstart' })
    return d
  }
  if (data.date && data.time) {
    if (timezone) {
      const { parseDateTimeInTz } = await import('./booking-availability')
      return parseDateTimeInTz(data.date, data.time, timezone)
    }
    return new Date(`${data.date}T${data.time}:00.000Z`)
  }
  throw Object.assign(new Error('dtstart or date+time required'), { code: 'dtstart_required' })
}

async function fetchServiceDetails(
  supabase: SupabaseLike,
  service_id: string,
  business_id: string,
  durationMin: number,
  price: number,
): Promise<{ durationMin: number; price: number }> {
  if (durationMin && price) return { durationMin, price }
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
            maybeSingle: () => Promise<{ data: { duration_min: number; price: number } | null }>
          }
        }
      }
    }
  )
    .select('duration_min, price')
    .eq('id', service_id)
    .eq('business_id', business_id)
    .maybeSingle()
  if (svc)
    return { durationMin: durationMin || svc.duration_min || 60, price: price || svc.price || 0 }
  return { durationMin: durationMin || 60, price: price || 0 }
}

function buildSeriesDates(
  allStarts: Date[],
  until: Date | null,
): { nextAt: string; seriesUntil: string | null } {
  const nextAt = allStarts[0]!.toISOString()
  const lastAt = allStarts[allStarts.length - 1]?.toISOString() ?? null
  return { nextAt, seriesUntil: until ? until.toISOString() : lastAt }
}

async function createRecurringRow(
  supabase: SupabaseLike,
  payload: Record<string, unknown>,
): Promise<string> {
  const supa = supabase as unknown as {
    from: (t: string) => {
      insert: (d: unknown) => {
        select: (c: string) => {
          single: () => Promise<{ data: { id: string } | null; error: unknown }>
        }
      }
    }
  }
  const { data: series, error } = await supa
    .from('recurring_appointments')
    .insert(payload as unknown as never)
    .select('id')
    .single()
  if (error || !series)
    throw Object.assign(
      new Error(
        'recurring_create_failed: ' + String((error as { message?: string })?.message ?? error),
      ),
      { code: 'recurring_create_failed' },
    )
  return (series as { id: string }).id
}

async function fetchBusinessHoursAndHolidays(
  supabase: SupabaseLike,
  business_id: string,
): Promise<{
  businessHours: unknown[]
  holidays: { date: string; is_open: boolean; location_id: string | null }[]
  effectiveHours: import('./booking-availability').DayHours[]
}> {
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
    holidays = (hol ?? []).map((h: unknown) => {
      const hh = h as { date: string; is_open: boolean; location_id: string | null }
      const d = typeof hh.date === 'string' ? hh.date.slice(0, 10) : String(hh.date)
      return { date: d, is_open: hh.is_open, location_id: hh.location_id }
    })
  } catch {}
  const { computeEffectiveHours } = await import('./booking-availability')
  const effectiveHours = computeEffectiveHours(
    businessHours as unknown as import('./booking-availability').DayHours[],
  )
  return { businessHours, holidays, effectiveHours }
}

function toBusinessDateTime(utcDate: Date, timezone: string): { date: string; time: string } {
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

function isPastOccurrence(startsAt: Date): boolean {
  return startsAt.getTime() <= Date.now()
}

async function checkSlotConflict(
  supabase: SupabaseLike,
  business_id: string,
  employee_id: string | null,
  startsAt: Date,
  endsAt: Date,
  durationMin: number,
): Promise<boolean> {
  if (!employee_id) return false
  try {
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
      .gte('starts_at', new Date(startsAt.getTime() - durationMin * 60_000).toISOString())
      .lte('starts_at', endsAt.toISOString()) as unknown as Promise<{ data: unknown[] | null }>)
    const conflict = (overlapping ?? []).some((ap: unknown) => {
      const a = ap as { starts_at: string; ends_at: string }
      const aStart = new Date(a.starts_at).getTime()
      const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : aStart + durationMin * 60_000
      return startsAt.getTime() < aEnd && endsAt.getTime() > aStart
    })
    if (overlapping && overlapping.length > 0) {
      if (!conflict && !(overlapping[0] as { ends_at?: string })?.ends_at) return true
      if (conflict) return true
    }
    return false
  } catch {
    return false
  }
}

async function tryInsertAppointment(
  supabase: SupabaseLike,
  payload: Record<string, unknown>,
): Promise<{ id?: string; error?: unknown }> {
  const { data: appt, error } = await (
    supabase.from('appointments') as unknown as {
      insert: (d: unknown) => {
        select: (c: string) => {
          single: () => Promise<{ data: { id: string } | null; error: unknown }>
        }
      }
    }
  )
    .insert(payload as unknown as never)
    .select('id')
    .single()
  if (error) return { error }
  if (appt) return { id: (appt as { id: string }).id }
  return {}
}

function mapInsertErrorToReason(msg: string): string {
  if (msg.includes('slot_already_booked') || msg.includes('slot_taken')) return 'slot_taken'
  if (
    msg.includes('outside_availability') ||
    msg.includes('barber_unavailable') ||
    msg.includes('barber_not_qualified')
  )
    return msg.includes('outside') ? 'outside_availability' : 'barber_unavailable'
  return 'insert_failed'
}

async function processSingleOccurrence(
  supabase: SupabaseLike,
  params: {
    idx: number
    startsAt: Date
    durationMin: number
    business_id: string
    location_id: string | null
    client_id: string
    service_id: string
    employee_id: string | null
    price: number
    seriesId: string
    timezone: string
    effectiveHours: import('./booking-availability').DayHours[]
    holidays: { date: string; is_open: boolean; location_id: string | null }[]
  },
  skipped: { index: number; starts_at: string; reason: string }[],
  createdIds: string[],
): Promise<void> {
  const {
    idx,
    startsAt,
    durationMin,
    business_id,
    location_id,
    client_id,
    service_id,
    employee_id,
    price,
    seriesId,
    timezone,
    effectiveHours,
    holidays,
  } = params
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000)
  const { date, time } = toBusinessDateTime(startsAt, timezone)
  if (isPastOccurrence(startsAt)) {
    skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: 'in_past' })
    return
  }
  const { dayOfWeekFromDateString, checkSlotWithHolidays } = await import('./booking-availability')
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
    skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: slotCheck.reason })
    return
  }
  const hasConflict = await checkSlotConflict(
    supabase,
    business_id,
    employee_id,
    startsAt,
    endsAt,
    durationMin,
  )
  if (hasConflict) {
    skipped.push({ index: idx, starts_at: startsAt.toISOString(), reason: 'slot_taken' })
    return
  }
  const res = await tryInsertAppointment(supabase, {
    business_id,
    location_id,
    client_id,
    service_id,
    employee_id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    price,
    status: 'scheduled',
    recurring_id: seriesId,
    source: 'recurring',
  })
  if (res.error) {
    const msg = String((res.error as { message?: string })?.message ?? '')
    skipped.push({
      index: idx,
      starts_at: startsAt.toISOString(),
      reason: mapInsertErrorToReason(msg),
    })
    return
  }
  if (res.id) createdIds.push(res.id)
  else {
    try {
      throw new Error('no id')
    } catch (e) {
      skipped.push({
        index: idx,
        starts_at: startsAt.toISOString(),
        reason: String((e as Error).message ?? 'insert_failed').slice(0, 80),
      })
    }
  }
}

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
  const dtstart = await resolveDtstart(data, params.timezone)
  if (Number.isNaN(dtstart.getTime()))
    throw Object.assign(new Error('invalid_dtstart'), { code: 'invalid_dtstart' })
  const validated = validateRRule(rruleText, dtstart, until)
  if (!validated.ok) throw Object.assign(new Error(validated.reason), { code: validated.code })
  const details = await fetchServiceDetails(
    supabase,
    service_id,
    business_id,
    params.duration_min ?? 0,
    params.price ?? 0,
  )
  const durationMin = details.durationMin
  const price = details.price
  const allStarts = generateOccurrences({
    rrule: rruleText,
    dtstart,
    until,
    countLimit: data.count ?? 52,
  })
  if (allStarts.length === 0)
    throw Object.assign(new Error('no_occurrences'), { code: 'no_occurrences' })
  const { nextAt, seriesUntil } = buildSeriesDates(allStarts, until)
  const seriesId = await createRecurringRow(supabase, {
    business_id,
    location_id,
    client_id,
    service_id,
    employee_id,
    rrule: rruleText,
    next_at: nextAt,
    until: seriesUntil,
    is_active: true,
  })
  const timezone = params.timezone ?? 'America/Bogota'
  const { effectiveHours, holidays } = await fetchBusinessHoursAndHolidays(supabase, business_id)
  const skipped: { index: number; starts_at: string; reason: string }[] = []
  const createdIds: string[] = []
  for (let idx = 0; idx < allStarts.length; idx++) {
    const startsAt = allStarts[idx]!
    await processSingleOccurrence(
      supabase,
      {
        idx,
        startsAt,
        durationMin,
        business_id,
        location_id,
        client_id,
        service_id,
        employee_id,
        price,
        seriesId,
        timezone,
        effectiveHours,
        holidays,
      },
      skipped,
      createdIds,
    )
  }
  return {
    id: seriesId,
    occurrences: allStarts.length,
    created: createdIds.length,
    skipped,
    appointmentIds: createdIds,
  }
}
