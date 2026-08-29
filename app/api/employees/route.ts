import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const BodySchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(120).optional().nullable().or(z.literal('')),
  role: z.enum(['admin', 'staff', 'barbero']).default('barbero'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable()
    .or(z.literal('')),
  specialties: z.array(z.string().max(40)).max(20).optional().nullable(),
  commission_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  commission_fixed: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  is_active: z.boolean().optional(),
  location_id: z.string().uuid().optional().nullable().or(z.literal('')),
})

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

async function resolveBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase
    .from('employees')
    .select('business_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

export async function GET(_request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data, error } = await supabase
    .from('employees')
    .select(
      'id, name, phone, email, role, color, specialties, commission_rate, commission_fixed, is_active, location_id, user_id, created_at',
    )
    .eq('business_id', businessId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`employees-create:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const b = parsed.data

  const payload: Record<string, unknown> = {
    business_id: businessId,
    name: sanitize(b.name),
    phone: b.phone ? sanitize(b.phone) : null,
    email: b.email ? sanitize(b.email) : null,
    role: b.role,
    color: b.color || null,
    specialties: b.specialties ?? [],
    commission_rate: b.commission_rate ?? null,
    commission_fixed: b.commission_fixed ?? null,
    is_active: b.is_active ?? true,
    location_id: b.location_id || null,
  }

  const { data, error } = await supabase
    .from('employees')
    .insert(payload as unknown as never)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
