import { z } from 'zod'

export const PromotionRulesSchema = z.object({
  day_of_week: z.array(z.number().min(0).max(6)).optional(),
  service_ids: z.array(z.string().uuid()).optional(),
  client_segment: z.enum(['birthday','vip','inactive_30','inactive_42','inactive_60','new','frequent','all']).optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  min_amount: z.number().min(0).optional(),
  max_uses_per_client: z.number().int().min(1).optional(),
}).passthrough()

export const PromotionSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['percent','fixed','combo']),
  value: z.coerce.number().min(0).max(1_000_000),
  promo_code: z.string().max(50).nullable().optional().transform((v) => (v?.trim() ? v.trim().toUpperCase() : null)),
  valid_from: z.string().datetime().nullable().optional().or(z.literal('')),
  valid_to: z.string().datetime().nullable().optional().or(z.literal('')),
  rules: PromotionRulesSchema.optional().default({}),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
  is_active: z.boolean().optional().default(true),
})

export type PromotionInput = z.infer<typeof PromotionSchema>

export interface Promotion {
  id: string
  business_id: string
  location_id: string | null
  name: string
  type: 'percent' | 'fixed' | 'combo'
  value: number
  promo_code: string | null
  valid_from: string
  valid_to: string | null
  rules: z.infer<typeof PromotionRulesSchema>
  is_active: boolean
}

export interface EvaluateContext {
  date?: string // YYYY-MM-DD for day_of_week check
  serviceIds?: string[] // services in cart/booking
  client?: {
    birthday?: string | null
    tags?: string[]
    last_visit_at?: string | null
    total_visits?: number
  } | null
  amount?: number
  now?: Date
  promoCode?: string | null
  locationId?: string | null
}

export function isPromotionActive(promo: Promotion, now: Date = new Date()): boolean {
  if (!promo.is_active) return false
  const from = promo.valid_from ? new Date(promo.valid_from) : null
  const to = promo.valid_to ? new Date(promo.valid_to) : null
  if (from && !isNaN(from.getTime()) && now.getTime() < from.getTime()) return false
  if (to && !isNaN(to.getTime()) && now.getTime() > to.getTime()) return false
  return true
}

function matchesDayOfWeek(rules: Promotion['rules'], ctxDate?: string): boolean {
  if (!rules?.day_of_week || rules.day_of_week.length === 0) return true
  if (!ctxDate) return false // rule requires date but none given => no match
  const dow = new Date(ctxDate + 'T12:00:00Z').getUTCDay()
  if (isNaN(dow)) return false
  return rules.day_of_week.includes(dow)
}

function matchesServiceIds(rules: Promotion['rules'], serviceIds?: string[]): boolean {
  if (!rules?.service_ids || rules.service_ids.length === 0) return true
  if (!serviceIds || serviceIds.length === 0) return false
  return serviceIds.some((id) => rules.service_ids!.includes(id))
}

function inDaysFromNow(dateStr: string, days: number, now: Date): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return false
  const thisYear = now.getFullYear()
  const bThisYear = new Date(thisYear, d.getMonth(), d.getDate())
  const diff = Math.ceil((bThisYear.getTime() - now.getTime()) / 86400000)
  return diff >= 0 && diff <= days
}

function matchesClientSegment(rules: Promotion['rules'], client: EvaluateContext['client'], now: Date): boolean {
  const seg = rules?.client_segment
  if (!seg || seg === 'all') return true
  if (!client) return false
  const tags = (client.tags ?? []).map((t) => t.toLowerCase())
  const visits = client.total_visits ?? 0
  const last = client.last_visit_at
  const nowMs = now.getTime()
  if (seg === 'vip') return tags.includes('vip')
  if (seg === 'birthday') return client.birthday ? inDaysFromNow(client.birthday, 7, now) : false
  if (seg === 'new') return visits > 0 && visits < 3
  if (seg === 'frequent') return visits >= 10
  if (seg === 'inactive_30') return last ? (nowMs - new Date(last).getTime()) / 86400000 >= 30 : true
  if (seg === 'inactive_42') return last ? (nowMs - new Date(last).getTime()) / 86400000 >= 42 : true
  if (seg === 'inactive_60') return last ? (nowMs - new Date(last).getTime()) / 86400000 >= 60 : true
  return true
}

export function evaluatePromotion(promo: Promotion, ctx: EvaluateContext): { eligible: boolean; reason?: string } {
  const now = ctx.now ?? new Date()
  if (!isPromotionActive(promo, now)) return { eligible: false, reason: 'inactive_or_expired' }
  if (promo.promo_code && ctx.promoCode && promo.promo_code.toUpperCase() !== ctx.promoCode.toUpperCase()) {
    return { eligible: false, reason: 'promo_code_mismatch' }
  }
  // If promo has code and ctx has no code, we still allow via evaluate (code optional), but if strict mode needed, callers can check
  if (!matchesDayOfWeek(promo.rules, ctx.date)) return { eligible: false, reason: 'day_of_week' }
  if (!matchesServiceIds(promo.rules, ctx.serviceIds)) return { eligible: false, reason: 'service_ids' }
  if (!matchesClientSegment(promo.rules, ctx.client ?? null, now)) return { eligible: false, reason: 'client_segment' }
  if (promo.rules?.min_amount != null && (ctx.amount ?? 0) < promo.rules.min_amount) return { eligible: false, reason: 'min_amount' }
  // location filter
  if (promo.location_id && ctx.locationId && promo.location_id !== ctx.locationId) return { eligible: false, reason: 'location' }
  return { eligible: true }
}

export function calculateDiscount(promo: Promotion, amount: number): number {
  if (amount <= 0) return 0
  if (promo.type === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(promo.value)))
    return Math.round((amount * pct) / 100)
  }
  if (promo.type === 'fixed') {
    return Math.min(amount, Math.round(Number(promo.value)))
  }
  if (promo.type === 'combo') {
    // Combo: value is fixed discount for bundle (or could be combo price – caller handles)
    return Math.min(amount, Math.round(Number(promo.value)))
  }
  return 0
}

/**
 * Evaluate and apply promo to amount, enforcing stack guard (no double promo).
 * Returns discount and final amount, or throws if already discounted.
 */
export function applyPromotion(
  promo: Promotion,
  ctx: EvaluateContext & { amount: number; alreadyDiscounted?: boolean }
): { discount: number; finalAmount: number } {
  if (ctx.alreadyDiscounted) throw Object.assign(new Error('promo_stack_guard'), { code: 'promo_already_applied' })
  const evalRes = evaluatePromotion(promo, ctx)
  if (!evalRes.eligible) throw Object.assign(new Error(`promo_not_eligible:${evalRes.reason}`), { code: 'promo_not_eligible', reason: evalRes.reason })
  const discount = calculateDiscount(promo, ctx.amount)
  return { discount, finalAmount: Math.max(0, ctx.amount - discount) }
}

// --- DB helper: evaluate best promo for context (server) ---
export async function evaluateBestPromotion(
  supabase: { from: (t: string) => { select: (c: string) => { eq: (c:string,v:unknown)=> { eq: (c:string,v:unknown)=>unknown } } } },
  businessId: string,
  ctx: EvaluateContext
): Promise<{ promo: Promotion | null; discount: number }> {
  // Fetch active promos (no raw SQL via supabase eq)
  const { data, error } = await (supabase.from('promotions') as unknown as {
    select: (c:string)=>{ eq:(a:string,b:unknown)=>{ eq:(c:string,d:unknown)=>Promise<{data:Promotion[]|null;error:unknown}> } }
  }).select('*').eq('business_id', businessId).eq('is_active', true) as unknown as Promise<{data:Promotion[]|null;error:unknown}>
  if (error || !data) return { promo: null, discount: 0 }
  let best: Promotion | null = null
  let bestDiscount = 0
  const amount = ctx.amount ?? 0
  for (const p of data as Promotion[]) {
    const ev = evaluatePromotion(p, ctx)
    if (!ev.eligible) continue
    const d = calculateDiscount(p, amount)
    if (d > bestDiscount) {
      bestDiscount = d
      best = p
    }
  }
  return { promo: best, discount: bestDiscount }
}
