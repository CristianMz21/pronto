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

  // Verify business belongs to user via RLS (my_business_ids)
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', body.business_id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not in my_business_ids' }, { status: 403 })

  if (body.amount <= 0) return NextResponse.json({ error: 'Amount must be >0' }, { status: 400 })

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
