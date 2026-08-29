import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimit, getIp } from '@/lib/rate-limit'

const BodySchema = z.object({
  employee_id: z.string().uuid(),
  service_id: z.string().uuid(),
  action: z.enum(['assign', 'unassign']).default('assign'),
})

async function resolveBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: owned } = await supabase.from('businesses').select('id').eq('owner_id', userId).maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const employee_id = searchParams.get('employee_id')
  if (!employee_id) return NextResponse.json({ error: 'missing_employee_id' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data, error } = await supabase.from('employee_services').select('service_id').eq('employee_id', employee_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`emp-svc:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })
  const { employee_id, service_id, action } = parsed.data

  if (action === 'unassign') {
    const { error } = await supabase.from('employee_services').delete().eq('employee_id', employee_id).eq('service_id', service_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from('employee_services').insert({ employee_id, service_id })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true, already: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
