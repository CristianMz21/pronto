/* eslint-disable @typescript-eslint/no-base-to-string */
import { z } from 'zod'

import type { Preferences, NotificationPrefs, ClientStatus } from '@/lib/preferences'
import { parseNotificationPrefs, parsePreferences, parseClientStatus } from '@/lib/preferences'

/**
 * Customer 360 — unified client hub (Perfil → Reservas → Historial → Barbero favorito → Preferencias → Estilos → Pagos → Puntos → Reseñas)
 * Slice: Foundational (T008)
 * Spec: FR-C1 GET /api/client/me 360, FR-C3 Inicio timeline, FR-C4 Mis reservas, FR-C6 check-in, FR-C7 reviews, FR-C12 loyalty, FR-C14 pagos
 * Depends: tables clients, appointments, loyalty_accounts, client_memberships, favorites, client_styles, reviews, transactions
 * Locale: es-CO/COP/America/Bogota, currency COP via lib/utils formatCurrency
 */

export const GetClient360Schema = z.object({
  businessId: z.string().uuid(),
  phone: z
    .string()
    .min(6)
    .max(20)
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  userId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  // Either phone or userId required (validated in helper)
})

export type GetClient360Input = z.infer<typeof GetClient360Schema>

export interface Client360 {
  client: {
    id: string
    business_id: string
    name: string
    phone: string | null
    email: string | null
    birthday: string | null
    preferences: Preferences
    status: ClientStatus
    preferred_barber_id: string | null
    notification_prefs: NotificationPrefs
    location_id: string | null
    created_at: string
    total_visits: number
    total_spent: number
    last_visit_at: string | null
    tags?: string[]
  }
  upcoming: AppointmentSummary[]
  history: AppointmentSummary[]
  loyalty: LoyaltySummary | null
  memberships: MembershipSummary[]
  favorites: FavoriteSummary[]
  styles: StyleSummary[]
  reviews: ReviewSummary[]
  transactions: TransactionSummary[]
  promotions: PromotionSummary[]
  stats: {
    upcomingCount: number
    historyCount: number
    completedCount: number
    cancelledCount: number
  }
}

export interface AppointmentSummary {
  id: string
  business_id: string
  client_id: string | null
  employee_id: string | null
  service_id: string | null
  starts_at: string
  ends_at: string
  status: string
  price: number | null
  checkin_code: string | null
  payment_status: string | null
  deposit_amount: number | null
  guest_name: string | null
  notes: string | null
  service_name?: string | null
  employee_name?: string | null
}

export interface LoyaltySummary {
  points: number
  earned: number
  redeemed: number
}

export interface MembershipSummary {
  id: string
  membership_id: string
  name: string
  remaining: number
  expires_at: string
  status: string
}

export interface FavoriteSummary {
  client_id: string
  employee_id: string
  created_at: string
  employee_name?: string | null
  nextAvailability?: string | null
}

export interface StyleSummary {
  id: string
  photo_url: string
  service_id: string | null
  employee_id: string | null
  notes: string | null
  is_favorite: boolean
  created_at: string
}

export interface ReviewSummary {
  id: string
  appointment_id: string
  rating: number
  tags: string[]
  comment: string | null
  created_at: string
}

export interface TransactionSummary {
  id: string
  amount: number
  payment_method: string
  status: string
  tip_amount: number
  created_at: string
}

export interface PromotionSummary {
  id: string
  name: string
  type: string
  value: number
  promo_code: string | null
  valid_from: string
  valid_to: string | null
  is_active: boolean
  eligible: boolean
  reason?: string
}

type SupabaseLike = {
  from: (table: string) => unknown
  auth?: { getUser: () => Promise<{ data: { user: unknown } }> }
}

function toNumberCOP(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

/**
 * Core helper: fetch united 360 for a client by phone or userId within a business.
 * - Prioritizes user_id link (056_clients_auth) then phone fallback
 * - Parallel fetches Promise.all for upcoming/history/loyalty/memberships/favorites/styles/reviews/transactions
 * - p95 <1.5s target per plan.md
 */
export async function getClient360(
  supabase: SupabaseLike,
  input: GetClient360Input,
): Promise<Client360> {
  const parsed = GetClient360Schema.safeParse(input)
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), { details: parsed.error.flatten() })

  const { businessId, phone, userId } = parsed.data
  if (!phone && !userId)
    throw Object.assign(new Error('phone_or_userId_required'), { code: 'phone_or_userId_required' })

  // 1. Resolve client row (priority user_id)
  let clientRow: unknown = null

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
            maybeSingle: () => Promise<{ data: unknown; error: unknown }>
            single: () => Promise<{ data: unknown; error: unknown }>
          }
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>
          single: () => Promise<{ data: unknown; error: unknown }>
          limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
        }
        limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
      }
    }
  }

  if (userId) {
    const { data } = await supa
      .from('clients')
      .select('*')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .maybeSingle()
    clientRow = data
  }

  if (!clientRow && phone) {
    // Normalize phone: try exact, then E.164 variations are DB-stored as phone text
    const { data } = await supa
      .from('clients')
      .select('*')
      .eq('business_id', businessId)
      .eq('phone', phone)
      .maybeSingle()
    clientRow = data
    // Fallback: like phone suffix if full not found (handles +57 prefix variations)
    if (!clientRow && phone.length >= 7) {
      // For tests / mock supabase, this branch is no-op; real DB would use ilike
      const { data: list } = await supa
        .from('clients')
        .select('*')
        .eq('business_id', businessId)
        .limit(100)
      const arr = (list as unknown[]) ?? []
      const found = (arr as Array<Record<string, unknown>>).find((c) =>
        String(c.phone ?? '')
          .replace(/\D/g, '')
          .endsWith(phone.replace(/\D/g, '').slice(-10)),
      )
      clientRow = found ?? null
    }
  }

  if (!clientRow)
    throw Object.assign(new Error('client_not_found'), { code: 'client_not_found', status: 404 })

  const c = clientRow as Record<string, unknown>
  const clientId = String(c.id)

  // 2. Parallel fetches
  const nowIso = new Date().toISOString()

  const [
    upcomingRes,
    historyRes,
    loyaltyRes,
    membershipsRes,
    favoritesRes,
    stylesRes,
    reviewsRes,
    transactionsRes,
    promotionsRes,
  ] = await Promise.allSettled([
    // upcoming: starts_at >= now, order asc, limit 5
    (
      (supa.from('appointments') as unknown as { select: (c: string) => unknown }).select(
        '*, services(name), employees(name)',
      ) as unknown as {
        eq: (
          a: string,
          b: unknown,
        ) => {
          eq: (
            a2: string,
            b2: unknown,
          ) => {
            gte: (
              a3: string,
              b3: unknown,
            ) => {
              order: (
                a4: string,
                o: unknown,
              ) => {
                limit: (n: number) => Promise<{ data: AppointmentSummary[] | null; error: unknown }>
              }
            }
          }
        }
      }
    )
      .eq('business_id', businessId)
      .eq('client_id', clientId)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(5),

    // history: starts_at < now order desc limit 20
    (
      (supa.from('appointments') as unknown as { select: (c: string) => unknown }).select(
        '*, services(name), employees(name)',
      ) as unknown as {
        eq: (
          a: string,
          b: unknown,
        ) => {
          eq: (
            a2: string,
            b2: unknown,
          ) => {
            lt: (
              a3: string,
              b3: unknown,
            ) => {
              order: (
                a4: string,
                o: unknown,
              ) => {
                limit: (n: number) => Promise<{ data: AppointmentSummary[] | null; error: unknown }>
              }
            }
          }
        }
      }
    )
      .eq('business_id', businessId)
      .eq('client_id', clientId)
      .lt('starts_at', nowIso)
      .order('starts_at', { ascending: false })
      .limit(20),

    // loyalty_accounts
    (
      supa.from('loyalty_accounts') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
        }
      }
    )
      .select('points')
      .eq('client_id', clientId)
      .maybeSingle(),

    // client_memberships with join memberships
    (
      supa.from('client_memberships') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            eq: (c2: string, v2: unknown) => Promise<{ data: unknown[] | null; error: unknown }>
          }
        }
      }
    )
      .select('*, memberships(name)')
      .eq('business_id', businessId)
      .eq('client_id', clientId),

    // favorites
    (
      supa.from('favorites') as unknown as {
        select: (c: string) => {
          eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null; error: unknown }>
        }
      }
    )
      .select('*, employees(name,avatar_url)')
      .eq('client_id', clientId),

    // client_styles
    (
      supa.from('client_styles') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            order: (c2: string, o: unknown) => Promise<{ data: unknown[] | null; error: unknown }>
          }
        }
      }
    )
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),

    // reviews
    (
      supa.from('reviews') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            order: (c2: string, o: unknown) => Promise<{ data: unknown[] | null; error: unknown }>
          }
        }
      }
    )
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),

    // transactions last 10 completed
    (
      supa.from('transactions') as unknown as {
        select: (c: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            eq: (
              c2: string,
              v2: unknown,
            ) => {
              eq: (
                c3: string,
                v3: unknown,
              ) => {
                order: (
                  c4: string,
                  o: unknown,
                ) => {
                  limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>
                }
              }
            }
          }
        }
      }
    )
      .select('*')
      .eq('business_id', businessId)
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10),

    // promotions eligible (active, for business)
    (
      supa.from('promotions') as unknown as {
        select: (c: string) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (c2: string, v2: unknown) => Promise<{ data: unknown[] | null; error: unknown }>
          }
        }
      }
    )
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true),
  ])

  const getData = <T>(r: PromiseSettledResult<{ data: T | null; error: unknown }>): T | null => {
    if (r.status === 'fulfilled' && !r.value.error) return r.value.data as T
    return null
  }

  const upcoming =
    (getData(
      upcomingRes as unknown as PromiseSettledResult<{
        data: AppointmentSummary[] | null
        error: unknown
      }>,
    ) as AppointmentSummary[] | null) ?? []
  const history =
    (getData(
      historyRes as unknown as PromiseSettledResult<{
        data: AppointmentSummary[] | null
        error: unknown
      }>,
    ) as AppointmentSummary[] | null) ?? []
  const loyaltyRaw = getData(
    loyaltyRes as unknown as PromiseSettledResult<{
      data: { points: number } | null
      error: unknown
    }>,
  )
  const membershipsRaw =
    (getData(
      membershipsRes as unknown as PromiseSettledResult<{ data: unknown[] | null; error: unknown }>,
    ) as unknown[] | null) ?? []
  const favoritesRaw =
    (getData(
      favoritesRes as unknown as PromiseSettledResult<{ data: unknown[] | null; error: unknown }>,
    ) as unknown[] | null) ?? []
  const stylesRaw =
    (getData(
      stylesRes as unknown as PromiseSettledResult<{ data: unknown[] | null; error: unknown }>,
    ) as unknown[] | null) ?? []
  const reviewsRaw =
    (getData(
      reviewsRes as unknown as PromiseSettledResult<{ data: unknown[] | null; error: unknown }>,
    ) as unknown[] | null) ?? []
  const transactionsRaw =
    (getData(
      transactionsRes as unknown as PromiseSettledResult<{
        data: unknown[] | null
        error: unknown
      }>,
    ) as unknown[] | null) ?? []
  const promotionsRaw =
    (getData(
      promotionsRes as unknown as PromiseSettledResult<{ data: unknown[] | null; error: unknown }>,
    ) as unknown[] | null) ?? []

  // Normalize client
  const client: Client360['client'] = {
    id: String(c.id),
    business_id: String(c.business_id),
    name: String(c.name ?? ''),
    phone: (c.phone as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    birthday: (c.birthday as string | null) ?? null,
    preferences: parsePreferences(c.preferences),
    status: parseClientStatus(c.status),
    preferred_barber_id: (c.preferred_barber_id as string | null) ?? null,
    notification_prefs: parseNotificationPrefs(c.notification_prefs),
    location_id: (c.location_id as string | null) ?? null,
    created_at: String(c.created_at ?? new Date().toISOString()),
    total_visits: typeof c.total_visits === 'number' ? c.total_visits : 0,
    total_spent: toNumberCOP(c.total_spent),
    last_visit_at: (c.last_visit_at as string | null) ?? null,
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
  }

  // Compute promotions eligible (lightweight evaluation, 1/week spam guard not enforced here — UI shows eligible flag)
  let promotionsEvaluated: PromotionSummary[] = []
  try {
    const { evaluatePromotion } = await import('@/lib/promotions')
    const now = new Date()
    const clientCtx = {
      birthday: client.birthday ?? null,
      tags: client.tags ?? [],
      last_visit_at: client.last_visit_at ?? null,
      total_visits: client.total_visits,
    }
    promotionsEvaluated = (promotionsRaw as Array<Record<string, unknown>>)
      .map((p) => {
        const promo = {
          id: String(p.id),
          business_id: String(p.business_id),
          location_id: (p.location_id as string | null) ?? null,
          name: String(p.name ?? ''),
          type: (p.type as 'percent' | 'fixed' | 'combo') ?? 'percent',
          value: typeof p.value === 'number' ? p.value : Number(p.value ?? 0),
          promo_code: (p.promo_code as string | null) ?? null,
          valid_from: String(p.valid_from ?? now.toISOString()),
          valid_to: (p.valid_to as string | null) ?? null,
          rules: (p.rules as Record<string, unknown>) ?? {},
          is_active: !!p.is_active,
        } as unknown as Parameters<typeof evaluatePromotion>[0]
        const res = evaluatePromotion(promo, {
          client: clientCtx,
          now,
          amount: 0,
        })
        return {
          id: promo.id as string,
          name: promo.name as string,
          type: promo.type as string,
          value: promo.value as number,
          promo_code: promo.promo_code as string | null,
          valid_from: promo.valid_from as string,
          valid_to: promo.valid_to as string | null,
          is_active: promo.is_active as boolean,
          eligible: res.eligible,
          reason: res.reason,
        } as PromotionSummary
      })
      .filter((p) => p.eligible)
      .slice(0, 5)
  } catch {
    promotionsEvaluated = []
  }

  const completedCount = (history as AppointmentSummary[]).filter(
    (a) => a.status === 'completed',
  ).length
  const cancelledCount = (history as AppointmentSummary[]).filter(
    (a) => a.status === 'cancelled' || a.status === 'cancelled_late',
  ).length

  return {
    client,
    upcoming: (upcoming as AppointmentSummary[]).map((a) => ({
      ...a,
      price: a.price !== null && a.price !== undefined ? toNumberCOP(a.price) : null,
      checkin_code:
        ((a as unknown as Record<string, unknown>).checkin_code as string | null) ?? null,
      payment_status:
        ((a as unknown as Record<string, unknown>).payment_status as string | null) ?? null,
      deposit_amount:
        ((a as unknown as Record<string, unknown>).deposit_amount as number | null) ?? null,
      guest_name: ((a as unknown as Record<string, unknown>).guest_name as string | null) ?? null,
    })),
    history: (history as AppointmentSummary[]).map((a) => ({
      ...a,
      price: a.price !== null && a.price !== undefined ? toNumberCOP(a.price) : null,
    })),
    loyalty: loyaltyRaw
      ? { points: (loyaltyRaw as { points: number }).points ?? 0, earned: 0, redeemed: 0 }
      : null,
    memberships: (membershipsRaw as Array<Record<string, unknown>>).map((m) => ({
      id: String(m.id),
      membership_id: String(m.membership_id ?? m.id),
      name: String(
        (m as unknown as { memberships?: { name: string } }).memberships?.name ?? m.name ?? '',
      ),
      remaining: typeof m.remaining === 'number' ? m.remaining : 0,
      expires_at: String(m.expires_at ?? ''),
      status: String(m.status ?? 'active'),
    })),
    favorites: (favoritesRaw as Array<Record<string, unknown>>).map((f) => ({
      client_id: String(f.client_id),
      employee_id: String(f.employee_id),
      created_at: String(f.created_at ?? ''),
      employee_name: (f.employees as { name?: string } | null)?.name ?? null,
      nextAvailability: null,
    })),
    styles: (stylesRaw as Array<Record<string, unknown>>).map((s) => ({
      id: String(s.id),
      photo_url: String(s.photo_url),
      service_id: (s.service_id as string | null) ?? null,
      employee_id: (s.employee_id as string | null) ?? null,
      notes: (s.notes as string | null) ?? null,
      is_favorite: !!s.is_favorite,
      created_at: String(s.created_at ?? ''),
    })),
    reviews: (reviewsRaw as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      appointment_id: String(r.appointment_id),
      rating: typeof r.rating === 'number' ? r.rating : 0,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      comment: (r.comment as string | null) ?? null,
      created_at: String(r.created_at ?? ''),
    })),
    transactions: (transactionsRaw as Array<Record<string, unknown>>).map((t) => ({
      id: String(t.id),
      amount: toNumberCOP(t.amount),
      payment_method: String(t.payment_method ?? 'cash'),
      status: String(t.status ?? 'completed'),
      tip_amount: typeof t.tip_amount === 'number' ? t.tip_amount : 0,
      created_at: String(t.created_at ?? ''),
    })),
    promotions: promotionsEvaluated,
    stats: {
      upcomingCount: (upcoming as unknown[]).length,
      historyCount: (history as unknown[]).length,
      completedCount,
      cancelledCount,
    },
  }
}

/** Lightweight helper for phone normalization (E.164 Colombia +57) */
export function normalizePhoneCO(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('57') && digits.length === 12) return `+${digits}`
  if (digits.length === 10 && digits.startsWith('3')) return `+57${digits}`
  if (phone.startsWith('+')) return phone
  return phone
}
