import { z } from 'zod'

export const TipSchema = z.object({
  business_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  amount: z.coerce.number().int().min(1).max(10_000_000),
  method: z.enum(['cash', 'card', 'transfer', 'digital']).optional().default('cash'),
})

export const TipAmountSchema = z.object({
  tip_amount: z.coerce.number().int().min(0).max(10_000_000),
  amount: z.coerce.number().min(0).optional(),
  role: z.string().optional(),
})

export type TipInput = z.infer<typeof TipSchema>

export interface Tip {
  id: string
  business_id: string
  transaction_id: string
  employee_id: string
  amount: number
  method: 'cash' | 'card' | 'transfer' | 'digital'
  created_at: string
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Validates tip_amount constraints: >=0 && <= amount*0.5 unless manager override */
export function isValidTipAmount(
  tipAmount: number,
  transactionAmount: number,
  opts?: { isManager?: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(tipAmount) || tipAmount < 0) return { ok: false, reason: 'tip_negative' }
  if (tipAmount === 0) return { ok: true }
  if (transactionAmount <= 0) return { ok: false, reason: 'invalid_amount' }
  const max = Math.floor(transactionAmount * 0.5)
  if (tipAmount > max && !opts?.isManager) return { ok: false, reason: 'tip_exceeds_50_percent' }
  return { ok: true }
}

export function validateTipInput(
  data: unknown,
): { ok: true; data: TipInput } | { ok: false; reason: string; details?: unknown } {
  const parsed = TipSchema.safeParse(data)
  if (!parsed.success)
    return { ok: false, reason: 'validation_failed', details: parsed.error.flatten().fieldErrors }
  return { ok: true, data: parsed.data }
}

// ── DB helpers ───────────────────────────────────────────────────────────────
type SupabaseLike = {
  from: (table: string) => unknown
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export async function createTip(supabase: SupabaseLike, params: TipInput): Promise<Tip> {
  const parsed = TipSchema.safeParse(params)
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), {
      details: parsed.error.flatten().fieldErrors,
      code: 'validation_failed',
    })

  const payload = {
    business_id: parsed.data.business_id,
    transaction_id: parsed.data.transaction_id,
    employee_id: parsed.data.employee_id,
    amount: parsed.data.amount,
    method: parsed.data.method ?? 'cash',
  }

  const { data, error } = await (
    supabase.from('tips') as unknown as {
      insert: (d: unknown) => {
        select: (c: string) => { single: () => Promise<{ data: Tip | null; error: unknown }> }
      }
    }
  )
    .insert(payload)
    .select('*')
    .single()

  if (error || !data)
    throw Object.assign(
      new Error('tip_create_failed: ' + String((error as { message?: string })?.message ?? error)),
      { code: 'tip_create_failed' },
    )

  // Also update transactions.tip_amount for reporting consistency (sum of tips)
  try {
    const { data: tx } = await (
      supabase.from('transactions') as unknown as {
        select: (c: string) => {
          eq: (
            a: string,
            b: unknown,
          ) => {
            maybeSingle: () => Promise<{ data: { tip_amount: number } | null; error: unknown }>
          }
        }
      }
    )
      .select('tip_amount')
      .eq('id', payload.transaction_id)
      .maybeSingle()
    const currentTip = (tx as { tip_amount: number } | null)?.tip_amount ?? 0
    await (
      supabase.from('transactions') as unknown as {
        update: (d: unknown) => { eq: (a: string, b: unknown) => Promise<unknown> }
      }
    )
      .update({ tip_amount: currentTip + payload.amount } as unknown as never)
      .eq('id', payload.transaction_id)
  } catch {}

  return data as Tip
}

export async function listByEmployee(
  supabase: SupabaseLike,
  businessId: string,
  employeeId: string,
  opts?: { from?: string; to?: string },
): Promise<Tip[]> {
  let query = (
    supabase.from('tips') as unknown as {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => {
          eq: (
            c: string,
            d: unknown,
          ) => {
            gte?: (col: string, v: string) => unknown
            order?: (col: string, o: unknown) => Promise<{ data: Tip[] | null; error: unknown }>
          } & Promise<{ data: Tip[] | null; error: unknown }>
        }
      }
    }
  )
    .select('*')
    .eq('business_id', businessId)
    .eq('employee_id', employeeId) as unknown as unknown as Promise<{
    data: Tip[] | null
    error: unknown
  }>

  // Simple fetch then filter by date if needed (keeps types simple)
  const { data, error } = await query
  if (error) throw error
  let tips = (data ?? []) as Tip[]
  if (opts?.from) tips = tips.filter((t) => t.created_at >= opts.from!)
  if (opts?.to) tips = tips.filter((t) => t.created_at <= opts.to!)
  return tips
}

export async function reportTips(
  supabase: SupabaseLike,
  businessId: string,
  opts?: { from?: string; to?: string; location_id?: string | null },
): Promise<{ total: number; byEmployee: { employee_id: string; total: number; count: number }[] }> {
  const { data, error } = await ((
    supabase.from('tips') as unknown as {
      select: (c: string) => {
        eq: (a: string, b: unknown) => Promise<{ data: Tip[] | null; error: unknown }>
      }
    }
  )
    .select('*')
    .eq('business_id', businessId) as unknown as Promise<{ data: Tip[] | null; error: unknown }>)
  if (error) throw error
  let tips = (data ?? []) as Tip[]
  if (opts?.from) tips = tips.filter((t) => t.created_at >= opts.from!)
  if (opts?.to) tips = tips.filter((t) => t.created_at <= opts.to!)

  const total = tips.reduce((s, t) => s + Number(t.amount), 0)
  const map = new Map<string, { total: number; count: number }>()
  for (const tip of tips) {
    const cur = map.get(tip.employee_id) ?? { total: 0, count: 0 }
    cur.total += Number(tip.amount)
    cur.count += 1
    map.set(tip.employee_id, cur)
  }
  const byEmployee = Array.from(map.entries()).map(([employee_id, v]) => ({ employee_id, ...v }))
  byEmployee.sort((a, b) => b.total - a.total)
  return { total, byEmployee }
}
