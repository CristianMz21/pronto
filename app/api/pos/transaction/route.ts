import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const BodySchema = z
  .object({
    business_id: z.string().uuid(),
    amount: z.number().min(0),
    payment_method: z.enum(['cash', 'card', 'transfer']),
    items: z
      .array(
        z.object({
          service_id: z.string().uuid(),
          name: z.string(),
          price: z.number(),
          qty: z.number().min(1),
        }),
      )
      .min(1),
    employee_id: z.string().uuid().nullable().optional(),
    client_id: z.string().uuid().nullable().optional(),
    tip_amount: z.number().min(0).max(1000000).optional().default(0),
    promo_code: z.string().max(50).optional().nullable(),
    loyalty_points_redeem: z.number().int().min(0).optional().default(0),
    membership_id: z.string().uuid().optional().nullable(),
    location_id: z.string().uuid().optional().nullable(),
    appointment_id: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const count = [
      data.membership_id,
      data.promo_code,
      data.loyalty_points_redeem && data.loyalty_points_redeem > 0 ? 'loyalty' : null,
    ].filter(Boolean).length
    if (count > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Solo un beneficio por transacción (membresía, promo o puntos)',
        path: ['promo_code'],
      })
    }
  })

type PosBody = z.infer<typeof BodySchema>
type Supa = Awaited<ReturnType<typeof createClient>>
type BizRow = {
  id: string
  require_cash_register_for_cash?: boolean | null
  loyalty_earn_rate?: number | null
  loyalty_redeem_rate?: number | null
  loyalty_redeem_value?: number | null
}

function getLoyaltyRates(biz: BizRow) {
  return {
    earnRate: biz.loyalty_earn_rate ?? 1000,
    redeemRate: biz.loyalty_redeem_rate ?? 100,
    redeemValue: biz.loyalty_redeem_value ?? 10000,
  }
}

async function parseBody(req: NextRequest): Promise<{ body?: PosBody; error?: NextResponse }> {
  try {
    const json: unknown = (await req.json()) as unknown
    const body = BodySchema.parse(json)
    return { body }
  } catch (e) {
    return {
      error: NextResponse.json({ error: 'Invalid body', details: String(e) }, { status: 400 }),
    }
  }
}

async function fetchBiz(
  supabase: Supa,
  businessId: string,
): Promise<{ biz?: BizRow; error?: NextResponse }> {
  const { data: biz } = await supabase
    .from('businesses')
    .select(
      'id, require_cash_register_for_cash, loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_value',
    )
    .eq('id', businessId)
    .maybeSingle()
  if (!biz)
    return {
      error: NextResponse.json({ error: 'Business not in my_business_ids' }, { status: 403 }),
    }
  return { biz: biz as BizRow }
}

function validateAmount(body: PosBody): NextResponse | null {
  if (body.amount <= 0 && body.membership_id == null) {
    return NextResponse.json({ error: 'Amount must be >0' }, { status: 400 })
  }
  return null
}

async function fetchBarberoEmployeeId(
  supabase: Supa,
  userId: string,
  businessId: string,
): Promise<string | null> {
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return (emp as { id: string } | null)?.id ?? null
}

async function fetchAllowedServiceIds(
  supabase: Supa,
  employeeId: string,
  serviceIds: string[],
): Promise<Set<string>> {
  const { data: allowed } = await supabase
    .from('employee_services')
    .select('service_id')
    .eq('employee_id', employeeId)
    .in('service_id', serviceIds)
  const set = new Set((allowed as { service_id: string }[] | null)?.map((r) => r.service_id) ?? [])
  return set
}

async function enforceBarberoGuard(
  supabase: Supa,
  userId: string,
  body: PosBody,
): Promise<NextResponse | null> {
  try {
    const { getUserRole } = await import('@/lib/auth/roles')
    const role = await getUserRole(
      supabase as unknown as import('@/lib/supabase/typed').TypedSupabaseClient,
      userId,
      body.business_id,
    )
    if (role !== 'barbero') return null
  } catch {
    return null
  }
  const barberEmployeeId = await fetchBarberoEmployeeId(supabase, userId, body.business_id)
  if (!barberEmployeeId) return NextResponse.json({ error: 'barbero_no_employee' }, { status: 403 })
  if (body.employee_id && body.employee_id !== barberEmployeeId) {
    return NextResponse.json(
      {
        error: 'barbero_employee_mismatch',
        message: 'Barbero can only create transactions for self',
      },
      { status: 403 },
    )
  }
  body.employee_id = barberEmployeeId
  const serviceIds = body.items.map((it) => it.service_id)
  const allowedSet = await fetchAllowedServiceIds(supabase, barberEmployeeId, serviceIds)
  const disallowed = serviceIds.filter((id) => !allowedSet.has(id))
  if (disallowed.length > 0) {
    return NextResponse.json(
      {
        error: 'barbero_service_not_assigned',
        message: 'Service not assigned to barbero',
        disallowed,
      },
      { status: 403 },
    )
  }
  return null
}

async function validateLocation(supabase: Supa, body: PosBody): Promise<NextResponse | null> {
  if (!body.location_id) return null
  const { data: loc } = await supabase
    .from('locations')
    .select('id')
    .eq('id', body.location_id)
    .eq('business_id', body.business_id)
    .maybeSingle()
  if (!loc)
    return NextResponse.json(
      { error: 'location_not_found', message: 'Sucursal no encontrada en este negocio' },
      { status: 404 },
    )
  return null
}

async function checkCashRegister(
  supabase: Supa,
  biz: BizRow,
  body: PosBody,
): Promise<NextResponse | null> {
  const requireCashRegister = biz.require_cash_register_for_cash ?? true
  if (body.payment_method !== 'cash' || !requireCashRegister) return null
  let cashQuery = supabase
    .from('cash_registers')
    .select('id')
    .eq('business_id', body.business_id)
    .eq('status', 'open')
  if (body.location_id) {
    cashQuery = (cashQuery as unknown as { eq: (c: string, v: string) => typeof cashQuery }).eq(
      'location_id',
      body.location_id,
    ) as typeof cashQuery
  }
  const { data: openRegister } = await cashQuery.maybeSingle()
  if (!openRegister)
    return NextResponse.json(
      { error: 'cash_register_closed', message: 'Debes abrir caja antes de cobrar en efectivo' },
      { status: 409 },
    )
  return null
}

async function computeMembershipDiscount(
  supabase: Supa,
  body: PosBody,
  grossAmount: number,
): Promise<{ amount: number; reason: string | null; error?: NextResponse }> {
  try {
    const { isEligible } = await import('@/lib/memberships')
    const { data: cm } = await supabase
      .from('client_memberships')
      .select('remaining, expires_at, status, membership_id')
      .eq('id', body.membership_id!)
      .eq('client_id', body.client_id!)
      .maybeSingle()
    if (!cm || !isEligible(cm as { remaining: number; expires_at: string; status: string })) {
      const remaining = (cm as { remaining?: number } | null)?.remaining ?? 0
      if (remaining <= 0)
        return {
          amount: 0,
          reason: null,
          error: NextResponse.json(
            { error: 'membership_no_uses_left', message: 'Membresía sin usos restantes' },
            { status: 409 },
          ),
        }
      return {
        amount: 0,
        reason: null,
        error: NextResponse.json(
          { error: 'membership_expired', message: 'Membresía expirada o inválida' },
          { status: 409 },
        ),
      }
    }
    const { data: mem } = await supabase
      .from('memberships')
      .select('benefits')
      .eq('id', (cm as { membership_id: string }).membership_id)
      .maybeSingle()
    const benefitServices = (mem as { benefits?: { services?: string[] } } | null)?.benefits
      ?.services
    const serviceIds = body.items.map((it) => it.service_id)
    const isBenefit =
      !benefitServices ||
      benefitServices.length === 0 ||
      serviceIds.some((id) => benefitServices.includes(id))
    if (!isBenefit)
      return {
        amount: 0,
        reason: null,
        error: NextResponse.json(
          { error: 'membership_service_not_covered', message: 'Membresía no cubre este servicio' },
          { status: 409 },
        ),
      }
    return { amount: grossAmount, reason: `membership:${body.membership_id}` }
  } catch (e) {
    const msg = String((e as Error).message)
    if (msg.includes('no_uses_left') || msg.includes('membership_expired')) {
      return {
        amount: 0,
        reason: null,
        error: NextResponse.json(
          {
            error: msg.includes('no_uses') ? 'membership_no_uses_left' : 'membership_expired',
            message: msg,
          },
          { status: 409 },
        ),
      }
    }
    return {
      amount: 0,
      reason: null,
      error: NextResponse.json({ error: 'membership_check_failed' }, { status: 500 }),
    }
  }
}

async function computePromoDiscount(
  supabase: Supa,
  body: PosBody,
  grossAmount: number,
): Promise<{ amount: number; reason: string | null; error?: NextResponse }> {
  try {
    const { evaluatePromotion, calculateDiscount } = await import('@/lib/promotions')
    const { data: promo } = await supabase
      .from('promotions')
      .select(
        'id, business_id, location_id, name, type, value, promo_code, valid_from, valid_to, rules, is_active',
      )
      .eq('business_id', body.business_id)
      .eq('promo_code', body.promo_code!.toUpperCase())
      .maybeSingle()
    if (!promo || !(promo as { is_active: boolean }).is_active) {
      return {
        amount: 0,
        reason: null,
        error: NextResponse.json(
          { error: 'promo_invalid', message: 'Cupón no válido' },
          { status: 404 },
        ),
      }
    }
    const { data: client } = await supabase
      .from('clients')
      .select('birthday, tags, last_visit_at, total_visits')
      .eq('id', body.client_id!)
      .maybeSingle()
    const evalRes = evaluatePromotion(
      promo as unknown as Parameters<typeof evaluatePromotion>[0],
      // @ts-expect-error - tsc strict fix
      {
        date: new Date().toISOString().slice(0, 10),
        serviceIds: body.items.map((it) => it.service_id),
        client: client as unknown as Parameters<typeof evaluatePromotion>[1]['client'],
        amount: grossAmount,
        now: new Date(),
        promoCode: body.promo_code,
        locationId: body.location_id ?? null,
      },
    )
    if (!evalRes.eligible)
      return {
        amount: 0,
        reason: null,
        error: NextResponse.json(
          { error: 'promo_not_eligible', reason: evalRes.reason },
          { status: 409 },
        ),
      }
    const discount = calculateDiscount(
      promo as unknown as Parameters<typeof calculateDiscount>[0],
      grossAmount,
    )
    return { amount: discount, reason: `promo:${body.promo_code}` }
  } catch {
    return {
      amount: 0,
      reason: null,
      error: NextResponse.json({ error: 'promo_evaluate_failed' }, { status: 500 }),
    }
  }
}

async function computeLoyaltyDiscount(
  supabase: Supa,
  body: PosBody,
  grossAmount: number,
  redeemRate: number,
  redeemValue: number,
): Promise<{ amount: number; reason: string | null; error?: NextResponse }> {
  const loyaltyRedeemed = body.loyalty_points_redeem ?? 0
  try {
    const { getBalance, canRedeem, calculateRedeemValue } = await import('@/lib/loyalty')
    const bal = await getBalance(
      supabase as unknown as Parameters<typeof getBalance>[0],
      body.client_id!,
    )
    if (!canRedeem(bal, loyaltyRedeemed)) {
      return {
        amount: 0,
        reason: null,
        error: NextResponse.json(
          {
            error: 'loyalty_insufficient',
            message: `Puntos insuficientes: tienes ${bal}`,
            balance: bal,
          },
          { status: 409 },
        ),
      }
    }
    let discount = calculateRedeemValue(loyaltyRedeemed, redeemRate, redeemValue)
    discount = Math.min(grossAmount, discount)
    return { amount: discount, reason: `loyalty:${loyaltyRedeemed}` }
  } catch (e) {
    const err = e as Error & { code?: string }
    if (err.code === 'insufficient_points')
      return {
        amount: 0,
        reason: null,
        error: NextResponse.json(
          { error: 'loyalty_insufficient', message: String(err.message) },
          { status: 409 },
        ),
      }
    return {
      amount: 0,
      reason: null,
      error: NextResponse.json({ error: 'loyalty_check_failed' }, { status: 500 }),
    }
  }
}

async function computeComboDiscount(
  supabase: Supa,
  body: PosBody,
  grossAmount: number,
): Promise<{ amount: number; reason: string | null }> {
  try {
    const { findBestCombo } = await import('@/lib/service-combos')
    const { data: combos } = await supabase
      .from('service_combos')
      .select('id, business_id, location_id, name, service_ids, price, duration_min, is_active')
      .eq('business_id', body.business_id)
      .eq('is_active', true)
    if (!combos || (combos as unknown[]).length === 0) return { amount: 0, reason: null }
    const servicesWithPrice = body.items.map((it) => ({
      id: it.service_id,
      price: Number(it.price),
    }))
    const best = findBestCombo(
      combos as unknown as Parameters<typeof findBestCombo>[0],
      servicesWithPrice,
    )
    if (best.combo && best.discount > 0)
      return { amount: Math.min(grossAmount, best.discount), reason: `combo:${best.combo.id}` }
    return { amount: 0, reason: null }
  } catch {
    return { amount: 0, reason: null }
  }
}

async function computeDiscount(
  supabase: Supa,
  body: PosBody,
  biz: BizRow,
  grossAmount: number,
): Promise<{ discountAmount: number; discountReason: string | null; error?: NextResponse }> {
  if (!body.client_id) return { discountAmount: 0, discountReason: null }
  const { redeemRate, redeemValue } = getLoyaltyRates(biz)
  if (body.membership_id) {
    const res = await computeMembershipDiscount(supabase, body, grossAmount)
    if (res.error) return { discountAmount: 0, discountReason: null, error: res.error }
    return { discountAmount: res.amount, discountReason: res.reason }
  }
  if (body.promo_code) {
    const res = await computePromoDiscount(supabase, body, grossAmount)
    if (res.error) return { discountAmount: 0, discountReason: null, error: res.error }
    return { discountAmount: res.amount, discountReason: res.reason }
  }
  if ((body.loyalty_points_redeem ?? 0) > 0) {
    const res = await computeLoyaltyDiscount(supabase, body, grossAmount, redeemRate, redeemValue)
    if (res.error) return { discountAmount: 0, discountReason: null, error: res.error }
    return { discountAmount: res.amount, discountReason: res.reason }
  }
  const combo = await computeComboDiscount(supabase, body, grossAmount)
  return { discountAmount: combo.amount, discountReason: combo.reason }
}

function finalizeDiscount(
  grossAmount: number,
  discountAmount: number,
): { discountAmount: number; netAmount: number } {
  const finalDiscount = Math.min(grossAmount, Math.max(0, Math.round(discountAmount)))
  return { discountAmount: finalDiscount, netAmount: Math.max(0, grossAmount - finalDiscount) }
}

function computeLoyaltyEarned(netAmount: number, body: PosBody, earnRate: number): number {
  if (!body.client_id || netAmount <= 0) return 0
  return Math.floor(netAmount / earnRate)
}

function buildInsertPayload(
  body: PosBody,
  netAmount: number,
  discountAmount: number,
  discountReason: string | null,
  loyaltyEarned: number,
): Record<string, unknown> {
  return {
    business_id: body.business_id,
    location_id: body.location_id ?? null,
    client_id: body.client_id ?? null,
    employee_id: body.employee_id ?? null,
    amount: netAmount,
    payment_method: body.payment_method,
    status: 'completed',
    items: body.items as unknown as never,
    tip_amount: body.tip_amount ?? 0,
    discount_amount: discountAmount,
    discount_reason: discountReason,
    promo_code: body.promo_code ? body.promo_code.toUpperCase() : null,
    membership_id: body.membership_id ?? null,
    loyalty_points_earned: loyaltyEarned,
    loyalty_points_redeemed: body.loyalty_points_redeem ?? 0,
  }
}

async function insertTransaction(
  supabase: Supa,
  payload: Record<string, unknown>,
  body: PosBody,
  netAmount: number,
): Promise<{ data?: { receipt_number: string; id: string }; error?: { message: string } }> {
  try {
    const res = await supabase
      .from('transactions')
      .insert(payload as unknown as never)
      .select('receipt_number, id')
      .single()
    if (res.error) throw res.error
    return { data: res.data as { receipt_number: string; id: string } }
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e)
    void msg
  }
  // fallback without new columns
  const fallback = {
    business_id: body.business_id,
    client_id: body.client_id ?? null,
    employee_id: body.employee_id ?? null,
    amount: netAmount,
    payment_method: body.payment_method,
    status: 'completed',
    items: body.items as unknown as never,
    tip_amount: body.tip_amount ?? 0,
  }
  const res2 = await supabase
    .from('transactions')
    .insert(fallback as unknown as never)
    .select('receipt_number, id')
    .single()
  if (res2.error) return { error: res2.error as { message: string } }
  return { data: res2.data as { receipt_number: string; id: string } }
}

function fireTipInsert(supabase: Supa, body: PosBody, txId: string): void {
  if (!body.tip_amount || body.tip_amount <= 0 || !body.employee_id) return
  void (
    supabase
      .from('tips')
      .insert({
        business_id: body.business_id,
        transaction_id: txId,
        employee_id: body.employee_id,
        amount: body.tip_amount,
        method: body.payment_method,
      } as unknown as never) as unknown as Promise<unknown>
  )
    .then(() => {})
    .catch(() => {})
}

async function handlePostTransactionEffects(
  supabase: Supa,
  body: PosBody,
  biz: BizRow,
  txId: string,
  netAmount: number,
  discountReason: string | null,
  loyaltyEarned: number,
): Promise<void> {
  fireTipInsert(supabase, body, txId)
  if (!body.client_id) {
    await handleAppointmentPaid(supabase, body)
    return
  }
  const { earnRate, redeemRate, redeemValue } = getLoyaltyRates(biz)
  const loyaltyRedeemed = body.loyalty_points_redeem ?? 0
  if (loyaltyEarned > 0) await handleLoyaltyEarn(supabase, body, biz, txId, netAmount, earnRate)
  if (loyaltyRedeemed > 0) await handleLoyaltyRedeem(supabase, body, txId, redeemRate, redeemValue)
  if (body.membership_id && discountReason?.startsWith('membership:'))
    await handleMembershipConsume(supabase, body)
  await handleAppointmentPaid(supabase, body)
}

async function handleLoyaltyEarn(
  supabase: Supa,
  body: PosBody,
  _biz: BizRow,
  txId: string,
  netAmount: number,
  earnRate: number,
): Promise<void> {
  try {
    const { earnPoints } = await import('@/lib/loyalty')
    await earnPoints(supabase as unknown as Parameters<typeof earnPoints>[0], {
      business_id: body.business_id,
      client_id: body.client_id!,
      amount: netAmount,
      transaction_id: txId,
      earn_rate: earnRate,
    })
  } catch {}
}

async function handleLoyaltyRedeem(
  supabase: Supa,
  body: PosBody,
  txId: string,
  redeemRate: number,
  redeemValue: number,
): Promise<void> {
  try {
    const { redeemPoints } = await import('@/lib/loyalty')
    await redeemPoints(
      supabase as unknown as Parameters<typeof redeemPoints>[0],
      {
        business_id: body.business_id,
        client_id: body.client_id!,
        points: body.loyalty_points_redeem ?? 0,
        redeem_rate: redeemRate,
        redeem_value: redeemValue,
        reference: txId,
      } as unknown as Parameters<typeof redeemPoints>[1],
    )
  } catch {}
}

async function handleMembershipConsume(supabase: Supa, body: PosBody): Promise<void> {
  try {
    const { consumeMembership } = await import('@/lib/memberships')
    await consumeMembership(
      supabase as unknown as Parameters<typeof consumeMembership>[0],
      body.membership_id!,
    )
  } catch {}
}

async function handleAppointmentPaid(supabase: Supa, body: PosBody): Promise<void> {
  if (!body.appointment_id) return
  void (
    supabase
      .from('appointments')
      .update({ status: 'paid' })
      .eq('id', body.appointment_id) as unknown as Promise<unknown>
  )
    .then(() => {})
    .catch(() => {})
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`pos-transaction:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await parseBody(req)
  if (parsed.error) return parsed.error
  const body = parsed.body!

  const bizRes = await fetchBiz(supabase, body.business_id)
  if (bizRes.error) return bizRes.error
  const biz = bizRes.biz!

  const amountErr = validateAmount(body)
  if (amountErr) return amountErr

  const barberErr = await enforceBarberoGuard(supabase, user.id, body)
  if (barberErr) return barberErr

  const locErr = await validateLocation(supabase, body)
  if (locErr) return locErr

  const cashErr = await checkCashRegister(supabase, biz, body)
  if (cashErr) return cashErr

  const gross = body.items.reduce((s, it) => s + Number(it.price) * it.qty, 0)
  const grossAmount = gross > 0 ? gross : body.amount

  const discountRes = await computeDiscount(supabase, body, biz, grossAmount)
  if (discountRes.error) return discountRes.error

  const { discountAmount: rawDiscount, discountReason } = discountRes
  const { discountAmount, netAmount } = finalizeDiscount(grossAmount, rawDiscount)
  const { earnRate } = getLoyaltyRates(biz)
  const loyaltyEarned = computeLoyaltyEarned(netAmount, body, earnRate)

  const payload = buildInsertPayload(body, netAmount, discountAmount, discountReason, loyaltyEarned)
  const insertRes = await insertTransaction(supabase, payload, body, netAmount)
  if (insertRes.error) return NextResponse.json({ error: insertRes.error.message }, { status: 400 })
  const data = insertRes.data
  if (!data) return NextResponse.json({ error: 'transaction_failed' }, { status: 500 })

  await handlePostTransactionEffects(
    supabase,
    body,
    biz,
    data.id,
    netAmount,
    discountReason,
    loyaltyEarned,
  )

  return NextResponse.json({
    receipt_number: data.receipt_number,
    id: data.id,
    loyalty_earned: loyaltyEarned,
    discount_amount: discountAmount,
    discount_reason: discountReason,
    net_amount: netAmount,
  })
}
