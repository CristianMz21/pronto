import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const BodySchema = z.object({
  business_id: z.string().uuid(),
  amount: z.number().min(0),
  payment_method: z.enum(['cash', 'card', 'transfer']),
  items: z.array(z.object({ service_id: z.string().uuid(), name: z.string(), price: z.number(), qty: z.number().min(1) })).min(1),
  employee_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  tip_amount: z.number().min(0).max(1000000).optional().default(0),
  promo_code: z.string().max(50).optional().nullable(),
  loyalty_points_redeem: z.number().int().min(0).optional().default(0),
  membership_id: z.string().uuid().optional().nullable(),
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

  // Verify business belongs to user via RLS (my_business_ids) and fetch cash-register config (055)
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, require_cash_register_for_cash')
    .eq('id', body.business_id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not in my_business_ids' }, { status: 403 })

  if (body.amount <= 0) return NextResponse.json({ error: 'Amount must be >0' }, { status: 400 })

  // Barbero guard: enforce employee_id=self and service assignment via employee_services
  // Resolve role to detect barbero; allow owner/staff unrestricted
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
      // Force employee_id to self regardless of payload
      if (body.employee_id && body.employee_id !== barberEmployeeId) {
        return NextResponse.json({ error: 'barbero_employee_mismatch', message: 'Barbero can only create transactions for self' }, { status: 403 })
      }
      body.employee_id = barberEmployeeId
      // Validate each service_id is assigned via employee_services
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
    // If role resolution fails, proceed without barbero enforcement (fail open for non-barbero)
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

  // Loyalty: auto-earn 1 point per $1000, redeem validation
  let loyaltyEarned = 0
  let loyaltyRedeemed = body.loyalty_points_redeem ?? 0
  if (body.client_id) {
    // Earn
    loyaltyEarned = Math.floor(body.amount / 1000)
    // Redeem check
    if (loyaltyRedeemed > 0) {
      const { data: acct } = await supabase.from('loyalty_accounts').select('points').eq('client_id', body.client_id).maybeSingle()
      const available = (acct as { points: number } | null)?.points ?? 0
      if (loyaltyRedeemed > available) {
        return NextResponse.json({ error: 'loyalty_insufficient', message: `Puntos insuficientes: tienes ${available}` }, { status: 400 })
      }
    }
    // Membership check
    if (body.membership_id) {
      const { data: mem } = await supabase.from('client_memberships').select('remaining, expires_at, status').eq('id', body.membership_id).eq('client_id', body.client_id).maybeSingle()
      if (!mem || (mem as { status: string }).status !== 'active' || new Date((mem as { expires_at: string }).expires_at) < new Date() || (mem as { remaining: number }).remaining <= 0) {
        return NextResponse.json({ error: 'membership_invalid', message: 'Membresía no válida o sin usos' }, { status: 400 })
      }
    }
    // Promotion check
    if (body.promo_code) {
      const { data: promo } = await supabase.from('promotions').select('is_active, valid_from, valid_to').eq('business_id', body.business_id).eq('promo_code', body.promo_code).maybeSingle()
      if (!promo || !(promo as { is_active: boolean }).is_active) {
        return NextResponse.json({ error: 'promo_invalid', message: 'Cupón no válido' }, { status: 400 })
      }
      const now = new Date()
      if ((promo as { valid_from: string }).valid_from && new Date((promo as { valid_from: string }).valid_from) > now) {
        return NextResponse.json({ error: 'promo_not_started', message: 'Cupón aún no válido' }, { status: 400 })
      }
      if ((promo as { valid_to: string | null }).valid_to && new Date((promo as { valid_to: string }).valid_to) < now) {
        return NextResponse.json({ error: 'promo_expired', message: 'Cupón expirado' }, { status: 400 })
      }
    }
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      business_id: body.business_id,
      client_id: body.client_id ?? null,
      employee_id: body.employee_id ?? null,
      amount: body.amount,
      payment_method: body.payment_method,
      status: 'completed',
      items: body.items as unknown as never,
      tip_amount: body.tip_amount ?? 0,
    } as unknown as never)
    .select('receipt_number, id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Post-transaction: tips, loyalty, membership consume (non-blocking)
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
    if (loyaltyEarned > 0) {
      supabase.from('loyalty_movements').insert({ business_id: body.business_id, client_id: body.client_id!, type: 'earn', points: loyaltyEarned, reference: data.id } as unknown as never).then(() => {}).catch(() => {})
      // Upsert account
      supabase.from('loyalty_accounts').select('points').eq('client_id', body.client_id!).maybeSingle().then(async ({ data: acct }) => {
        if (acct) {
          await supabase.from('loyalty_accounts').update({ points: (acct as { points: number }).points + loyaltyEarned } as unknown as never).eq('client_id', body.client_id!)
        } else {
          await supabase.from('loyalty_accounts').insert({ client_id: body.client_id!, business_id: body.business_id, points: loyaltyEarned } as unknown as never)
        }
      }).catch(() => {})
    }
    if (loyaltyRedeemed > 0) {
      supabase.from('loyalty_movements').insert({ business_id: body.business_id, client_id: body.client_id!, type: 'redeem', points: -loyaltyRedeemed, reference: data.id } as unknown as never).then(() => {}).catch(() => {})
      supabase.from('loyalty_accounts').select('points').eq('client_id', body.client_id!).maybeSingle().then(async ({ data: acct }) => {
        if (acct) await supabase.from('loyalty_accounts').update({ points: Math.max(0, (acct as { points: number }).points - loyaltyRedeemed) } as unknown as never).eq('client_id', body.client_id!)
      }).catch(() => {})
    }
    if (body.membership_id) {
      supabase.from('client_memberships').select('remaining').eq('id', body.membership_id!).maybeSingle().then(async ({ data: mem }) => {
        if (mem) await supabase.from('client_memberships').update({ remaining: Math.max(0, (mem as { remaining: number }).remaining - 1) } as unknown as never).eq('id', body.membership_id!)
      }).catch(() => {})
    }
  }

  return NextResponse.json({ receipt_number: data.receipt_number, id: data.id, loyalty_earned: loyaltyEarned })
}
