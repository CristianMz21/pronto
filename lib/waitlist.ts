import { z } from 'zod'

// ── Zod schemas (validate at boundaries) ─────────────────────────────────────
export const EnqueueSchema = z.object({
  business_id: z.string().uuid(),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
  service_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable().optional().or(z.literal('')),
  client_id: z.string().uuid(),
  desired_at: z.string().datetime(),
  status: z
    .enum(['waiting', 'notified', 'converted', 'expired', 'cancelled'])
    .optional()
    .default('waiting'),
})

export const NotifyNextSchema = z.object({
  business_id: z.string().uuid(),
  location_id: z.string().uuid().nullable().optional(),
  service_id: z.string().uuid().optional(),
  employee_id: z.string().uuid().nullable().optional(),
  desired_at: z.string().datetime().optional(),
})

export const ConvertSchema = z.object({
  waitlist_id: z.string().uuid(),
  business_id: z.string().uuid().optional(),
})

export type WaitlistInput = z.infer<typeof EnqueueSchema>

export interface WaitlistEntry {
  id: string
  business_id: string
  location_id: string | null
  service_id: string
  employee_id: string | null
  client_id: string
  desired_at: string
  status: 'waiting' | 'notified' | 'converted' | 'expired' | 'cancelled'
  notified_at: string | null
  created_at: string
  clients?: { id: string; name: string; phone: string | null; email: string | null } | null
  services?: { id: string; name: string } | null
  employees?: { id: string; name: string } | null
}

// ── Pure helpers (unit-testable) ─────────────────────────────────────────────
export const WAITLIST_NOTIFY_WINDOW_MIN = 30
export const WAITLIST_EXPIRE_MIN = 30

export function isWaiting(entry: Pick<WaitlistEntry, 'status'>): boolean {
  return entry.status === 'waiting'
}

export function isNotified(entry: Pick<WaitlistEntry, 'status'>): boolean {
  return entry.status === 'notified'
}

/** True if notified entry has expired (>30m since notified_at) */
export function isExpired(
  entry: Pick<WaitlistEntry, 'status' | 'notified_at'>,
  now: Date = new Date(),
): boolean {
  if (entry.status !== 'notified' || !entry.notified_at) return false
  const notified = new Date(entry.notified_at).getTime()
  if (Number.isNaN(notified)) return false
  return now.getTime() - notified > WAITLIST_EXPIRE_MIN * 60_000
}

/** Validate desired_at is in future + respects lead time */
export function canEnqueue(
  desiredAt: string,
  now: Date = new Date(),
  minAdvanceMinutes = 30,
  enabled = true,
): { ok: true } | { ok: false; reason: string } {
  const desired = new Date(desiredAt).getTime()
  if (Number.isNaN(desired)) return { ok: false, reason: 'invalid_date' }
  if (desired <= now.getTime()) return { ok: false, reason: 'in_past' }
  if (enabled && minAdvanceMinutes > 0 && desired < now.getTime() + minAdvanceMinutes * 60_000) {
    return { ok: false, reason: 'too_soon' }
  }
  return { ok: true }
}

// ── DB helpers ───────────────────────────────────────────────────────────────
type SupabaseLike = {
  from: (table: string) => unknown
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export async function enqueue(
  supabase: SupabaseLike,
  params: WaitlistInput,
): Promise<WaitlistEntry> {
  const parsed = EnqueueSchema.safeParse(params)
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), {
      details: parsed.error.flatten().fieldErrors,
    })

  const { business_id, location_id, service_id, employee_id, client_id, desired_at } = parsed.data

  // Guard: unique (business_id, client_id, desired_at) — let DB enforce, but surface friendly error
  const payload = {
    business_id,
    location_id: location_id || null,
    service_id,
    employee_id: employee_id || null,
    client_id,
    desired_at,
    status: 'waiting' as const,
  }

  const { data, error } = await (
    supabase.from('waitlist') as unknown as {
      insert: (d: unknown) => {
        select: (c: string) => {
          single: () => Promise<{ data: WaitlistEntry | null; error: unknown }>
        }
      }
    }
  )
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    const msg = String((error as { message?: string })?.message ?? '')
    if (
      msg.includes('duplicate') ||
      msg.includes('unique') ||
      (error as { code?: string }).code === '23505'
    ) {
      throw Object.assign(new Error('waitlist_duplicate'), { code: 'waitlist_duplicate' })
    }
    throw error
  }
  return data as WaitlistEntry
}

export async function listWaiting(
  supabase: SupabaseLike,
  businessId: string,
  opts?: { location_id?: string | null; limit?: number },
): Promise<WaitlistEntry[]> {
  const limit = opts?.limit ?? 50
  const q = (
    supabase.from('waitlist') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          v: unknown,
        ) => {
          eq: (
            col: string,
            v: unknown,
          ) => {
            order: (
              col: string,
              o: unknown,
            ) => { limit: (n: number) => Promise<{ data: WaitlistEntry[] | null; error: unknown }> }
          }
        }
      }
    }
  )
    .select('*, clients(id, name, phone, email), services(id, name), employees(id, name)')
    .eq('business_id', businessId)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(limit)

  // Location filter if provided
  if (opts?.location_id) {
    // Supabase chaining: need to handle dynamic — fetch all then filter for simplicity in V1, or add eq if available
    const { data } = await q
    const filtered = (data ?? []).filter(
      (w) => !w.location_id || w.location_id === opts.location_id,
    )
    return filtered
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as WaitlistEntry[]
}

/**
 * notifyNext: picks the first waiting entry matching the freed slot and marks it notified.
 * Matching logic: same business_id, desired_at day+time approx equal to cancelled slot's starts_at,
 * optionally same location/service/employee. For MVP we notify the oldest waiting overall for that business+desired_at date.
 * Returns the notified entry or null if none waiting.
 */
export async function notifyNext(
  supabase: SupabaseLike,
  params: {
    business_id: string
    desired_at?: string
    location_id?: string | null
    service_id?: string | null
    employee_id?: string | null
  },
): Promise<WaitlistEntry | null> {
  const { business_id, desired_at, location_id, service_id, employee_id } = params
  // Find oldest waiting matching business + optional filters, ordered by created_at
  const supa = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => {
          eq: (
            c: string,
            d: unknown,
          ) => {
            order: (
              col: string,
              opts: unknown,
            ) => {
              limit: (n: number) => Promise<{ data: WaitlistEntry[] | null; error: unknown }>
            }
          }
        }
      }
      update: (d: unknown) => {
        eq: (
          a: string,
          b: unknown,
        ) => {
          select: (c: string) => {
            single: () => Promise<{ data: WaitlistEntry | null; error: unknown }>
          }
        }
      }
      rpc?: unknown
    }
  }
  // @ts-expect-error - tsc strict fix
  let _query: Promise<{ data: WaitlistEntry[] | null; error: unknown }>
  // Build query — simple: business_id + waiting, then JS filter for optional params (avoids chaining complexity with nullable eq)
  const base = supa
    .from('waitlist')
    .select('*')
    .eq('business_id', business_id)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(50)
  const { data: candidates, error } = await base
  if (error || !candidates || candidates.length === 0) return null

  let filtered = candidates as WaitlistEntry[]
  if (desired_at) {
    const target = new Date(desired_at).toISOString()
    // Match same exact desired_at, or same day if desired_at not exact (fallback)
    filtered = filtered.filter((w) => w.desired_at === target)
    if (filtered.length === 0) {
      // Fallback: same calendar day
      const targetDay = target.slice(0, 10)
      filtered = (candidates as WaitlistEntry[]).filter(
        (w) => w.desired_at.slice(0, 10) === targetDay,
      )
    }
  }
  if (location_id !== undefined && location_id !== null) {
    filtered = filtered.filter((w) => !w.location_id || w.location_id === location_id)
  }
  if (service_id) filtered = filtered.filter((w) => w.service_id === service_id)
  if (employee_id !== undefined) {
    if (employee_id)
      filtered = filtered.filter((w) => !w.employee_id || w.employee_id === employee_id)
  }

  if (filtered.length === 0) return null
  const next = filtered[0]

  const now = new Date().toISOString()
  const { data: updated, error: updErr } = await supa
    .from('waitlist')
    .update({ status: 'notified', notified_at: now })
    // @ts-expect-error - tsc strict fix
    .eq('id', next.id)
    .select('*')
    .single()
  if (updErr) throw updErr
  return updated as WaitlistEntry
}

/** Convert a notified (or waiting) entry into a confirmed appointment. Caller must create appointment; we mark converted. */
export async function convert(supabase: SupabaseLike, waitlistId: string): Promise<WaitlistEntry> {
  const parsed = z.string().uuid().safeParse(waitlistId)
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), { code: 'validation_failed' })

  const supa = supabase as unknown as {
    from: (t: string) => {
      update: (d: unknown) => {
        eq: (
          a: string,
          b: unknown,
        ) => {
          select: (c: string) => {
            single: () => Promise<{ data: WaitlistEntry | null; error: unknown }>
          }
        }
      }
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => { maybeSingle: () => Promise<{ data: WaitlistEntry | null; error: unknown }> }
      }
    }
  }
  // Verify current status allows conversion (waiting or notified)
  const { data: current } = await (
    supa.from('waitlist') as unknown as {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => { maybeSingle: () => Promise<{ data: WaitlistEntry | null; error: unknown }> }
      }
    }
  )
    .select('status')
    .eq('id', waitlistId)
    .maybeSingle()
  if (!current) throw Object.assign(new Error('waitlist_not_found'), { code: 'waitlist_not_found' })
  if ((current as WaitlistEntry).status === 'converted')
    throw Object.assign(new Error('already_converted'), { code: 'already_converted' })
  if (
    (current as WaitlistEntry).status === 'expired' ||
    (current as WaitlistEntry).status === 'cancelled'
  ) {
    throw Object.assign(new Error('waitlist_not_convertible'), { code: 'waitlist_not_convertible' })
  }

  const { data, error } = await supa
    .from('waitlist')
    .update({ status: 'converted' })
    .eq('id', waitlistId)
    .select('*')
    .single()
  if (error) throw error
  return data as WaitlistEntry
}

/** Expire notified entries older than 30m and waiting past desired_at */
export async function expireStale(
  supabase: SupabaseLike,
  now: Date = new Date(),
): Promise<{ expiredNotified: number; expiredWaiting: number }> {
  const supa = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          v: unknown,
        ) => {
          lt: (col: string, v: unknown) => Promise<{ data: WaitlistEntry[] | null; error: unknown }>
        } & {
          in: (
            col: string,
            v: unknown[],
          ) => Promise<{ data: WaitlistEntry[] | null; error: unknown }>
        }
      }
      update: (d: unknown) => {
        in: (col: string, v: unknown[]) => Promise<{ data: unknown; error: unknown }>
      }
    }
  }
  const cutoff = new Date(now.getTime() - WAITLIST_EXPIRE_MIN * 60_000).toISOString()
  const nowIso = now.toISOString()

  // Find notified where notified_at < cutoff
  // Supabase chain: select id where status=notified and notified_at < cutoff
  // We use direct query via from().select then JS filter for simplicity (small table)
  const { data: notifiedCandidates } = await ((
    supabase.from('waitlist') as unknown as {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => {
          lt: (col: string, v: unknown) => Promise<{ data: WaitlistEntry[] | null; error: unknown }>
        }
      }
    }
  )
    .select('id')
    .eq('status', 'notified')
    .lt('notified_at', cutoff) as unknown as Promise<{
    data: WaitlistEntry[] | null
    error: unknown
  }>)

  let expiredNotified = 0
  if (notifiedCandidates && notifiedCandidates.length > 0) {
    const ids = notifiedCandidates.map((r) => r.id)
    await (
      supa.from('waitlist').update({ status: 'expired' } as unknown as never) as unknown as {
        in: (c: string, v: unknown[]) => Promise<unknown>
      }
    ).in('id', ids)
    expiredNotified = ids.length
  }

  // Waiting past desired_at (desired_at < now)
  const { data: waitingPast } = await ((
    supabase.from('waitlist') as unknown as {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => {
          lt: (col: string, v: unknown) => Promise<{ data: WaitlistEntry[] | null; error: unknown }>
        }
      }
    }
  )
    .select('id')
    .eq('status', 'waiting')
    .lt('desired_at', nowIso) as unknown as Promise<{
    data: WaitlistEntry[] | null
    error: unknown
  }>)

  let expiredWaiting = 0
  if (waitingPast && waitingPast.length > 0) {
    const ids = waitingPast.map((r) => r.id)
    await (
      supa.from('waitlist').update({ status: 'expired' } as unknown as never) as unknown as {
        in: (c: string, v: unknown[]) => Promise<unknown>
      }
    ).in('id', ids)
    expiredWaiting = ids.length
  }

  return { expiredNotified, expiredWaiting }
}
