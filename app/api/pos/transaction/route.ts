import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const BodySchema = z.object({
  business_id: z.string().uuid(),
  amount: z.number().min(0), // gross subtotal before discount (server computes discount)
  payment_method: z.enum(['cash', 'card', 'transfer']),
  items: z.array(z.object({ service_id: z.string().uuid(), name: z.string(), price: z.number(), qty: z.number().min(1) })).min(1),
  employee_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  tip_amount: z.number().min(0).max(1000000).optional().default(0),
  promo_code: z.string().max(50).optional().nullable(),
  loyalty_points_redeem: z.number().int().min(0).optional().default(0),
  membership_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  appointment_id: z.string().uuid().optional().nullable(),
}).superRefine((data, ctx) => {
  const count = [data.membership_id, data.promo_code, data.loyalty_points_redeem && data.loyalty_points_redeem > 0 ? 'loyalty' : null].filter(Boolean).length
  if (count > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Solo un beneficio por transacción (membresía, promo o puntos)', path: ['promo_code'] })
  }
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json({ error: 'Invalid body', details: String(e) }, { status: 400 })
  }

  // Verify business belongs to user via RLS (my_business_ids) and fetch cash-register config + loyalty config
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, require_cash_register_for_cash, loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_value')
    .eq('id', body.business_id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not in my_business_ids' }, { status: 403 })

  if (body.amount <= 0 && body.membership_id == null) {
    // Allow 0 if membership covers full amount, else require >0
    const gross = body.items.reduce((s, it) => s + Number(it.price) * it.qty, 0)
    if (gross <= 0) return NextResponse.json({ error: 'Amount must be >0' }, { status: 400 })
  }

  // Barbero guard: enforce employee_id=self and service assignment via employee_services
  let barberEmployeeId: string | null = null
  try {
    const { getUserRole } = await import('@/lib/auth/roles')
    const role = await getUserRole(supabase as unknown as { from: (t: string) => unknown }, user.id, body.business_id)
    if (role === 'barbero') {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .eq('business_id', body.business_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      barberEmployeeId = (emp as { id: string } | null)?.id ?? null
      if (!barberEmployeeId) {
        return NextResponse.json({ error: 'barbero_no_employee' }, { status: 403 })
      }
      if (body.employee_id && body.employee_id !== barberEmployeeId) {
        return NextResponse.json({ error: 'barbero_employee_mismatch', message: 'Barbero can only create transactions for self' }, { status: 403 })
      }
      body.employee_id = barberEmployeeId
      const serviceIds = body.items.map((it) => it.service_id)
      const { data: allowed } = await supabase
        .from('employee_services')
        .select('service_id')
        .eq('employee_id', barberEmployeeId)
        .in('service_id', serviceIds)
      const allowedSet = new Set((allowed as { service_id: string }[] | null)?.map((r) => r.service_id) ?? [])
      const disallowed = serviceIds.filter((id) => !allowedSet.has(id))
      if (disallowed.length > 0) {
        return NextResponse.json({ error: 'barbero_service_not_assigned', message: 'Service not assigned to barbero', disallowed }, { status: 403 })
      }
    }
  } catch {
    // fail open for non-barbero
  }

  // Cash sales require an open cash register only when business config demands it (055)
  const requireCashRegister = (biz as { require_cash_register_for_cash?: boolean | null })?.require_cash_register_for_cash ?? true
  if (body.payment_method === 'cash' && requireCashRegister) {
    const { data: openRegister } = await supabase
      .from('cash_registers')
      .select('id')
      .eq('business_id', body.business_id)
      .eq('status', 'open')
      .maybeSingle()
    if (!openRegister) {
      return NextResponse.json({ error: 'cash_register_closed', message: 'Debes abrir caja antes de cobrar en efectivo' }, { status: 409 })
    }
  }

  // --- Discount computation (US5) ---
  const gross = body.items.reduce((s, it) => s + Number(it.price) * it.qty, 0)
  // Use provided amount as gross if items sum mismatches, prefer items sum as source of truth
  const grossAmount = gross > 0 ? gross : body.amount
  let discountAmount = 0
  let discountReason: string | null = null
  let loyaltyEarned = 0
  let loyaltyRedeemed = body.loyalty_points_redeem ?? 0
  const earnRate = (biz as { loyalty_earn_rate?: number } | null)?.loyalty_earn_rate ?? 1000
  const redeemRate = (biz as { loyalty_redeem_rate?: number } | null)?.loyalty_redeem_rate ?? 100
  const redeemValue = (biz as { loyalty_redeem_value?: number } | null)?.loyalty_redeem_value ?? 10000

  if (body.client_id) {
    // Membership path (advisory lock via lib)
    if (body.membership_id) {
      try {
        const { isEligible } = await import('@/lib/memberships')
        const { data: cm } = await supabase.from('client_memberships').select('remaining, expires_at, status, membership_id').eq('id', body.membership_id).eq('client_id', body.client_id).maybeSingle()
        if (!cm || !isEligible(cm as { remaining: number; expires_at: string; status: string })) {
          const remaining = (cm as { remaining?: number } | null)?.remaining ?? 0
          if (remaining <= 0) return NextResponse.json({ error: 'membership_no_uses_left', message: 'Membresía sin usos restantes' }, { status: 409 })
          return NextResponse.json({ error: 'membership_expired', message: 'Membresía expirada o inválida' }, { status: 409 })
        }
        // Check membership benefits service eligibility if benefits.service_ids defined
        const { data: mem } = await supabase.from('memberships').select('benefits').eq('id', (cm as { membership_id: string }).membership_id).maybeSingle()
        const benefitServices = (mem as { benefits?: { services?: string[] } } | null)?.benefits?.services
        const serviceIds = body.items.map((it) => it.service_id)
        const isBenefitService = !benefitServices || benefitServices.length === 0 || serviceIds.some((id) => benefitServices.includes(id))
        if (!isBenefitService) {
          return NextResponse.json({ error: 'membership_service_not_covered', message: 'Membresía no cubre este servicio' }, { status: 409 })
        }
        // Membership covers full amount of eligible services (or proportional). For simplicity, full gross if eligible.
        discountAmount = grossAmount
        discountReason = `membership:${body.membership_id}`
      } catch (e) {
        const msg = String((e as Error).message)
        if (msg.includes('no_uses_left') || msg.includes('membership_expired')) return NextResponse.json({ error: msg.includes('no_uses') ? 'membership_no_uses_left' : 'membership_expired', message: msg }, { status: 409 })
        console.error('[pos] membership check error', e)
        return NextResponse.json({ error: 'membership_check_failed' }, { status: 500 })
      }
    } else if (body.promo_code) {
      try {
        const { evaluatePromotion, calculateDiscount } = await import('@/lib/promotions')
        const { data: promo } = await supabase.from('promotions').select('id, business_id, location_id, name, type, value, promo_code, valid_from, valid_to, rules, is_active').eq('business_id', body.business_id).eq('promo_code', body.promo_code.toUpperCase()).maybeSingle()
        if (!promo || !(promo as { is_active: boolean }).is_active) return NextResponse.json({ error: 'promo_invalid', message: 'Cupón no válido' }, { status: 404 })
        const { data: client } = await supabase.from('clients').select('birthday, tags, last_visit_at, total_visits').eq('id', body.client_id).maybeSingle()
        const evalRes = evaluatePromotion(promo as unknown as Parameters<typeof evaluatePromotion>[0], {
          date: new Date().toISOString().slice(0, 10),
          serviceIds: body.items.map((it) => it.service_id),
          client: client as unknown as Parameters<typeof evaluatePromotion>[1]['client'],
          amount: grossAmount,
          now: new Date(),
          promoCode: body.promo_code,
          locationId: body.location_id ?? null,
        })
        if (!evalRes.eligible) return NextResponse.json({ error: 'promo_not_eligible', reason: evalRes.reason }, { status: 409 })
        discountAmount = calculateDiscount(promo as unknown as Parameters<typeof calculateDiscount>[0], grossAmount)
        discountReason = `promo:${body.promo_code}`
      } catch (e) {
        console.error('[pos] promo evaluate error', e)
        return NextResponse.json({ error: 'promo_evaluate_failed' }, { status: 500 })
      }
    } else if (loyaltyRedeemed > 0) {
      try {
        const { getBalance, canRedeem, calculateRedeemValue } = await import('@/lib/loyalty')
        const bal = await getBalance(supabase as unknown as Parameters<typeof getBalance>[0], body.client_id)
        if (!canRedeem(bal, loyaltyRedeemed)) return NextResponse.json({ error: 'loyalty_insufficient', message: `Puntos insuficientes: tienes ${bal}`, balance: bal }, { status: 409 })
        discountAmount = calculateRedeemValue(loyaltyRedeemed, redeemRate, redeemValue)
        // Cap discount to gross
        discountAmount = Math.min(grossAmount, discountAmount)
        discountReason = `loyalty:${loyaltyRedeemed}`
      } catch (e) {
        const err = e as Error & { code?: string }
        if (err.code === 'insufficient_points') return NextResponse.json({ error: 'loyalty_insufficient', message: String(err.message) }, { status: 409 })
        console.error('[pos] loyalty check error', e)
        return NextResponse.json({ error: 'loyalty_check_failed' }, { status: 500 })
      }
    } else {
      // Try service combos as fallback (if no other promo, check combo discount)
      try {
        const { findBestCombo } = await import('@/lib/service-combos')
        const { data: combos } = await supabase.from('service_combos').select('id, business_id, location_id, name, service_ids, price, duration_min, is_active').eq('business_id', body.business_id).eq('is_active', true)
        if (combos && (combos as unknown[]).length > 0) {
          const servicesWithPrice = body.items.map((it) => ({ id: it.service_id, price: Number(it.price) }))
          const best = findBestCombo(combos as unknown as Parameters<typeof findBestCombo>[0], servicesWithPrice)
          if (best.combo && best.discount > 0) {
            discountAmount = Math.min(grossAmount, best.discount)
            discountReason = `combo:${best.combo.id}`
          }
        }
      } catch {}
    }
  }

  discountAmount = Math.min(grossAmount, Math.max(0, Math.round(discountAmount)))
  const netAmount = Math.max(0, grossAmount - discountAmount)
  // Loyalty earn on net amount (after discount, before tip)
  if (body.client_id && netAmount > 0) {
    loyaltyEarned = Math.floor(netAmount / earnRate)
  }

  // Insert transaction with audit fields: amount = net, discount_amount, tip separate
  // Commission trigger will use net - tip as base (discount already excluded from amount)
  const insertPayload: Record<string, unknown> = {
    business_id: body.business_id,
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
    loyalty_points_redeemed: loyaltyRedeemed,
  }

  // Handle column existence fallback: if discount_amount column not yet migrated, retry without it
  let data: { receipt_number: string; id: string } | null = null
  let error: { message: string } | null = null
  try {
    const res = await supabase.from('transactions').insert(insertPayload as unknown as never).select('receipt_number, id').single()
    data = res.data as typeof data
    error = res.error as typeof error
  } catch (e) {
    error = { message: String(e) }
  }
  if (error) {
    // Fallback without new columns if migration not yet applied
    const fallbackPayload = {
      business_id: body.business_id,
      client_id: body.client_id ?? null,
      employee_id: body.employee_id ?? null,
      amount: netAmount,
      payment_method: body.payment_method,
      status: 'completed',
      items: body.items as unknown as never,
      tip_amount: body.tip_amount ?? 0,
    }
    const res2 = await supabase.from('transactions').insert(fallbackPayload as unknown as never).select('receipt_number, id').single()
    data = res2.data as typeof data
    error = res2.error as typeof error
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!data) return NextResponse.json({ error: 'transaction_failed' }, { status: 500 })

  // Post-transaction side effects (advisory-locked via libs where possible, non-blocking but awaited for loyalty/membership to ensure consistency)
  // Tips
  if (body.tip_amount && body.tip_amount > 0 && body.employee_id) {
    supabase.from('tips').insert({
      business_id: body.business_id,
      transaction_id: data.id,
      employee_id: body.employee_id,
      amount: body.tip_amount,
      method: body.payment_method,
    } as unknown as never).then(() => {}).catch(() => {})
  }

  if (body.client_id) {
    // Loyalty earn (advisory lock via RPC)
    if (loyaltyEarned > 0) {
      try {
        const { earnPoints } = await import('@/lib/loyalty')
        await earnPoints(supabase as unknown as Parameters<typeof earnPoints>[0], {
          business_id: body.business_id,
          client_id: body.client_id!,
          amount: netAmount,
          transaction_id: data.id,
          earn_rate: earnRate,
        })
      } catch (e) {
        console.error('[pos] loyalty earn failed', e)
      }
    }
    // Loyalty redeem (already validated, now deduct via RPC)
    if (loyaltyRedeemed > 0) {
      try {
        const { redeemPoints } = await import('@/lib/loyalty')
        await redeemPoints(supabase as unknown as Parameters<typeof redeemPoints>[0], {
          business_id: body.business_id,
          client_id: body.client_id!,
          points: loyaltyRedeemed,
          redeem_rate: redeemRate,
          redeem_value: redeemValue,
          reference: data.id,
        } as unknown as Parameters<typeof redeemPoints>[1])
      } catch (e) {
        console.error('[pos] loyalty redeem failed', e)
      }
    }
    // Membership consume (advisory lock) — only if discount from membership
    if (body.membership_id && discountReason?.startsWith('membership:')) {
      try {
        const { consumeMembership } = await import('@/lib/memberships')
        await consumeMembership(supabase as unknown as Parameters<typeof consumeMembership>[0], body.membership_id!)
      } catch (e) {
        console.error('[pos] membership consume failed', e)
      }
    }
  }

  // If appointment_id provided, mark paid (complete flow)
  if (body.appointment_id) {
    supabase.from('appointments').update({ status: 'paid' }).eq('id', body.appointment_id).then(() => {}).catch(() => {})
  }

  return NextResponse.json({ receipt_number: data.receipt_number, id: data.id, loyalty_earned: loyaltyEarned, discount_amount: discountAmount, discount_reason: discountReason, net_amount: netAmount })
}
