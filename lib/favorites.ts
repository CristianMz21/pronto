import { z } from 'zod'

import { checkSlotWithinHours, type DayHours } from '@/lib/booking-availability'

/**
 * Customer 360 — favorites M2M client ↔ employee (barber)
 * Slice: Foundational (T007)
 * Spec: FR-C8, FR-C11 favorites with próxima disponibilidad
 * Table: public.favorites PK (client_id, employee_id)
 * Depends: lib/booking-availability.ts for nextAvailability
 */

// ── Schema ───────────────────────────────────────────────────────────────────

export const FavoriteSchema = z.object({
  client_id: z.string().uuid(),
  employee_id: z.string().uuid(),
})

export type Favorite = z.infer<typeof FavoriteSchema>
export type FavoriteInput = z.infer<typeof FavoriteSchema>

export const ToggleFavoriteSchema = FavoriteSchema.extend({
  // toggle semantics: if exists delete, else insert
})

export interface FavoriteWithMeta extends Favorite {
  created_at: string
  employee?: { id: string; name: string; avatar_url?: string | null } | null
}

// ── Helpers pure ─────────────────────────────────────────────────────────────

export function isFavorite(
  list: Pick<Favorite, 'client_id' | 'employee_id'>[],
  clientId: string,
  employeeId: string,
): boolean {
  return list.some((f) => f.client_id === clientId && f.employee_id === employeeId)
}

export function toggleInMemory(
  list: Favorite[],
  input: FavoriteInput,
): { next: Favorite[]; added: boolean } {
  const parsed = FavoriteSchema.safeParse(input)
  if (!parsed.success) throw parsed.error
  const exists = list.some(
    (f) => f.client_id === input.client_id && f.employee_id === input.employee_id,
  )
  if (exists) {
    return {
      next: list.filter(
        (f) => !(f.client_id === input.client_id && f.employee_id === input.employee_id),
      ),
      added: false,
    }
  }
  return { next: [...list, { ...input }], added: true }
}

// ── nextAvailability ─────────────────────────────────────────────────────────
// Calculates next slot availability for a favorite barber using business_hours.
// Reuses checkSlotWithinHours (single source of truth).
// For MVP, we compute next available 30-min slot within 7 days, 09:00-19:00 default.
// Caller provides businessHours + bookedSlots + employeeId; we return ISO string or null.

export interface NextAvailabilityOpts {
  businessHours: DayHours[]
  // booked slots as { starts_at: string, ends_at: string } for this employee
  bookedSlots: { starts_at: string; ends_at: string }[]
  timezone?: string // default America/Bogota
  slotDurationMin?: number // default 30
  fromDate?: Date // for deterministic tests
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function dayOfWeekFromDate(d: Date, timezone = 'America/Bogota'): number {
  // Use Intl to get weekday in business timezone
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(d)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? d.getDay()
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Find next available slot for a favorite barber within 7 days.
 * Returns ISO string (UTC) or null if none.
 * Pure + testable; respects business_hours break and bookedSlots overlap.
 */
export function nextAvailability(opts: NextAvailabilityOpts): string | null {
  const {
    businessHours,
    bookedSlots,
    timezone = 'America/Bogota',
    slotDurationMin = 30,
    fromDate = new Date(),
  } = opts

  // Normalize booked slots to minutes per day? Instead we check per candidate slot absolute
  // For simplicity, iterate days 0..6, generate slots 09:00..19:00 every 30m, test each candidate
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const candidateDate = new Date(fromDate)
    candidateDate.setUTCDate(candidateDate.getUTCDate() + dayOffset)
    // Convert candidateDate to business timezone date YYYY-MM-DD for hours lookup
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(candidateDate)
    const [y, m, d] = ymd.split('-').map(Number)
    const dow = dayOfWeekFromDate(candidateDate, timezone)
    const dayHours = businessHours.find((h) => h.day_of_week === dow)
    if (!dayHours || !dayHours.is_open) continue

    // Generate slots for this day
    const openMin = (() => {
      const [h, mi] = dayHours.open_time.split(':').map(Number)
      return (h ?? 9) * 60 + (mi ?? 0)
    })()
    const closeMin = (() => {
      const [h, mi] = dayHours.close_time.split(':').map(Number)
      return (h ?? 19) * 60 + (mi ?? 0)
    })()

    for (let slotMin = openMin; slotMin + slotDurationMin <= closeMin; slotMin += 30) {
      const time = toHHMM(slotMin)
      // Check within hours + break
      const hoursCheck = checkSlotWithinHours(dayHours, time, slotDurationMin)
      if (!hoursCheck.ok) continue

      // Build candidate UTC Date via wall-clock in timezone
      // Reuse booking-availability parseDateTimeInTz for accurate DST handling
      // Inline to avoid circular import heavy logic — use same algorithm
      const candidateUtc = (() => {
        // Use noon anchor to get offset
        const noonUtc = new Date(Date.UTC(y as number, (m as number) - 1, d as number, 12, 0))
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
        const [h, mi] = time.split(':').map(Number)
        return new Date(
          Date.UTC(y as number, (m as number) - 1, d as number, h ?? 0, mi ?? 0) - offsetMs,
        )
      })()

      // Skip past slots
      if (candidateUtc.getTime() <= fromDate.getTime()) continue

      // Check bookedSlots overlap (capacity =1 assumption for barber)
      const candidateEnd = new Date(candidateUtc.getTime() + slotDurationMin * 60_000)
      const hasOverlap = bookedSlots.some((b) => {
        const bStart = new Date(b.starts_at).getTime()
        const bEnd = new Date(b.ends_at).getTime()
        return overlaps(candidateUtc.getTime(), candidateEnd.getTime(), bStart, bEnd)
      })
      if (hasOverlap) continue

      return candidateUtc.toISOString()
    }
  }
  return null
}

// ── DB helpers ───────────────────────────────────────────────────────────────
type SupabaseLike = {
  from: (table: string) => unknown
}

export async function toggleFavorite(
  supabase: SupabaseLike,
  input: FavoriteInput,
): Promise<{ added: boolean; favorite?: FavoriteWithMeta | null }> {
  const parsed = FavoriteSchema.safeParse(input)
  if (!parsed.success) throw parsed.error

  const { client_id, employee_id } = parsed.data

  // Check existing via select
  const supa = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          eq: (
            col2: string,
            val2: unknown,
          ) => {
            maybeSingle: () => Promise<{ data: Favorite | null; error: unknown }>
          }
        }
      }
      insert: (d: unknown) => {
        select: (c: string) => { single: () => Promise<{ data: unknown; error: unknown }> }
      }
      delete: () => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          eq: (col2: string, val2: unknown) => Promise<{ error: unknown }>
        }
      }
    }
  }

  const { data: existing } = await supa
    .from('favorites')
    .select('*')
    .eq('client_id', client_id)
    .eq('employee_id', employee_id)
    .maybeSingle()

  if (existing) {
    const { error } = await (
      supa.from('favorites').delete() as unknown as {
        eq: (
          a: string,
          b: unknown,
        ) => { eq: (c: string, d: unknown) => Promise<{ error: unknown }> }
      }
    )
      .eq('client_id', client_id)
      .eq('employee_id', employee_id)
    if (error) throw error
    return { added: false, favorite: null }
  }

  const { data, error } = await supa
    .from('favorites')
    .insert({ client_id, employee_id })
    .select('*')
    .single()
  if (error) {
    const msg = String((error as { message?: string })?.message ?? '')
    if (msg.includes('duplicate') || (error as { code?: string }).code === '23505') {
      // Race: already inserted
      return { added: true, favorite: existing as unknown as FavoriteWithMeta }
    }
    throw error
  }
  return { added: true, favorite: data as FavoriteWithMeta }
}

export async function listFavorites(
  supabase: SupabaseLike,
  clientId: string,
): Promise<FavoriteWithMeta[]> {
  const parsed = z.string().uuid().safeParse(clientId)
  if (!parsed.success) throw new Error('invalid_client_id')

  const { data, error } = await (
    supabase.from('favorites') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => Promise<{ data: FavoriteWithMeta[] | null; error: unknown }>
      }
    }
  )
    .select('*, employees!inner(id,name,avatar_url)')
    .eq('client_id', clientId)

  if (error) throw error
  return (data as FavoriteWithMeta[] | null) ?? []
}
