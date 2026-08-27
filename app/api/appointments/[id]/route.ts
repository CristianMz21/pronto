import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimit, getIp } from '@/lib/rate-limit'

const PatchSchema = z.object({
  employee_id: z.string().uuid().nullable().or(z.literal('')).optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`appointments-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })
  }
  const body = parsed.data

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!business) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // employee_id: empty string or null → unassign; UUID string → assign
  const employee_id: string | null = body.employee_id || null

  const { data, error } = await supabase
    .from('appointments')
    .update({ employee_id })
    .eq('id', params.id)
    .eq('business_id', business.id)
    .select('id, employees(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
