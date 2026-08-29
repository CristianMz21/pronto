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
    })
    .select('receipt_number, id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ receipt_number: data.receipt_number, id: data.id })
}
