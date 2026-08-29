import { z } from 'zod'

// Config: 1pt per 1000 COP, redeem 100pts = 10000 COP (100 COP per point)
export const DEFAULT_EARN_RATE = 1000
export const DEFAULT_REDEEM_RATE = 100
export const DEFAULT_REDEEM_VALUE = 10000

export const EarnSchema = z.object({
  business_id: z.string().uuid(),
  client_id: z.string().uuid(),
  amount: z.coerce.number().min(0).max(100_000_000),
  transaction_id: z.string().uuid().nullable().optional(),
  earn_rate: z.coerce.number().int().min(1).max(100000).optional().default(DEFAULT_EARN_RATE),
})

export const RedeemSchema = z.object({
  business_id: z.string().uuid(),
  client_id: z.string().uuid(),
  points: z.coerce.number().int().min(1).max(1_000_000),
  redeem_rate: z.coerce.number().int().min(1).optional().default(DEFAULT_REDEEM_RATE),
  redeem_value: z.coerce.number().int().min(1).optional().default(DEFAULT_REDEEM_VALUE),
})

export interface LoyaltyAccount {
  client_id: string
  business_id: string
  points: number
  updated_at: string
}

export function calculateEarnPoints(amount: number, earnRate: number = DEFAULT_EARN_RATE): number {
  if (amount <= 0) return 0
  return Math.floor(amount / earnRate)
}

export function calculateRedeemValue(
  points: number,
  redeemRate: number = DEFAULT_REDEEM_RATE,
  redeemValue: number = DEFAULT_REDEEM_VALUE,
): number {
  if (points <= 0) return 0
  // 100 pts = 10000 => 100 per point
  const perPoint = redeemValue / redeemRate
  return Math.round(points * perPoint)
}

export function canRedeem(balance: number, requested: number): boolean {
  return Number.isInteger(requested) && requested > 0 && balance >= requested
}

type SupabaseLike = {
  from: (t: string) => unknown
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export async function getBalance(supabase: SupabaseLike, clientId: string): Promise<number> {
  const parsed = z.string().uuid().safeParse(clientId)
  if (!parsed.success) throw new Error('invalid_client_id')
  const { data, error } = await (
    supabase.from('loyalty_accounts') as unknown as {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => { maybeSingle: () => Promise<{ data: LoyaltyAccount | null; error: unknown }> }
      }
    }
  )
    .select('points')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return (data as LoyaltyAccount | null)?.points ?? 0
}

export async function earnPoints(
  supabase: SupabaseLike,
  params: z.infer<typeof EarnSchema>,
): Promise<{ earned: number; balance: number }> {
  const parsed = EarnSchema.safeParse(params)
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), {
      details: parsed.error.flatten().fieldErrors,
    })
  const { business_id, client_id, amount, transaction_id, earn_rate } = parsed.data
  const earned = calculateEarnPoints(amount, earn_rate)
  if (earned <= 0) return { earned: 0, balance: await getBalance(supabase, client_id) }

  // Try RPC (advisory lock)
  try {
    const { data, error } = await supabase.rpc('loyalty_earn', {
      p_business_id: business_id,
      p_client_id: client_id,
      p_points: earned,
      p_reference: transaction_id ?? null,
    })
    if (!error && data) {
      const bal = (data as LoyaltyAccount).points
      return { earned, balance: bal }
    }
  } catch {}

  // Fallback: manual upsert (race-prone but acceptable for low concurrency fallback)
  const supa = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => { maybeSingle: () => Promise<{ data: LoyaltyAccount | null; error: unknown }> }
      }
      insert: (d: unknown) => Promise<{ error: unknown }>
      update: (d: unknown) => { eq: (a: string, b: unknown) => Promise<{ error: unknown }> }
    }
  }
  const { data: acct } = await supa
    .from('loyalty_accounts')
    .select('points')
    .eq('client_id', client_id)
    .maybeSingle()
  if (acct) {
    await supa
      .from('loyalty_accounts')
      .update({ points: (acct as LoyaltyAccount).points + earned } as unknown as never)
      .eq('client_id', client_id)
    // movement
    await (
      supabase.from('loyalty_movements') as unknown as { insert: (d: unknown) => Promise<unknown> }
    ).insert({
      business_id,
      client_id,
      type: 'earn',
      points: earned,
      reference: transaction_id ?? null,
    })
    return { earned, balance: (acct as LoyaltyAccount).points + earned }
  } else {
    await (
      supabase.from('loyalty_accounts') as unknown as { insert: (d: unknown) => Promise<unknown> }
    ).insert({ client_id, business_id, points: earned })
    await (
      supabase.from('loyalty_movements') as unknown as { insert: (d: unknown) => Promise<unknown> }
    ).insert({
      business_id,
      client_id,
      type: 'earn',
      points: earned,
      reference: transaction_id ?? null,
    })
    return { earned, balance: earned }
  }
}

export async function redeemPoints(
  supabase: SupabaseLike,
  params: z.infer<typeof RedeemSchema> & { reference?: string | null },
): Promise<{ redeemed: number; discount: number; balance: number }> {
  const parsed = RedeemSchema.safeParse(params)
  if (!parsed.success)
    throw Object.assign(new Error('validation_failed'), {
      details: parsed.error.flatten().fieldErrors,
    })
  const { business_id, client_id, points, redeem_rate, redeem_value } = parsed.data

  // Balance check
  const balance = await getBalance(supabase, client_id)
  if (!canRedeem(balance, points))
    throw Object.assign(new Error('insufficient_points'), { code: 'insufficient_points', balance })

  // Try RPC
  try {
    const { data, error } = await supabase.rpc('loyalty_redeem', {
      p_business_id: business_id,
      p_client_id: client_id,
      p_points: points,
      p_reference: (params as { reference?: string | null }).reference ?? null,
    })
    if (!error && data) {
      const bal = (data as LoyaltyAccount).points
      return {
        redeemed: points,
        discount: calculateRedeemValue(points, redeem_rate, redeem_value),
        balance: bal,
      }
    }
    const msg = String((error as { message?: string })?.message ?? '')
    if (msg.includes('insufficient_points'))
      throw Object.assign(new Error('insufficient_points'), {
        code: 'insufficient_points',
        balance,
      })
  } catch (e) {
    const msg = String((e as Error)?.message ?? '')
    if (msg.includes('insufficient_points')) throw e
  }

  // Fallback manual
  const supa = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          a: string,
          b: unknown,
        ) => { maybeSingle: () => Promise<{ data: LoyaltyAccount | null; error: unknown }> }
      }
      update: (d: unknown) => { eq: (a: string, b: unknown) => Promise<{ error: unknown }> }
      insert: (d: unknown) => Promise<unknown>
    }
  }
  const { data: acct } = await supa
    .from('loyalty_accounts')
    .select('points')
    .eq('client_id', client_id)
    .maybeSingle()
  const bal = (acct as LoyaltyAccount | null)?.points ?? 0
  if (bal < points)
    throw Object.assign(new Error('insufficient_points'), {
      code: 'insufficient_points',
      balance: bal,
    })
  await supa
    .from('loyalty_accounts')
    .update({ points: bal - points } as unknown as never)
    .eq('client_id', client_id)
  await (
    supabase.from('loyalty_movements') as unknown as { insert: (d: unknown) => Promise<unknown> }
  ).insert({
    business_id,
    client_id,
    type: 'redeem',
    points: -points,
    reference: (params as { reference?: string | null }).reference ?? null,
  })
  return {
    redeemed: points,
    discount: calculateRedeemValue(points, redeem_rate, redeem_value),
    balance: bal - points,
  }
}

export function insufficientCheck(
  balance: number,
  requested: number,
): { ok: boolean; reason?: string } {
  if (!Number.isInteger(requested) || requested <= 0) return { ok: false, reason: 'invalid_points' }
  if (balance < requested) return { ok: false, reason: 'insufficient_points' }
  return { ok: true }
}
