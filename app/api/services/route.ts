import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const BodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  price: z.coerce.number().min(0).max(1_000_000),
  duration_min: z.coerce.number().min(5).max(480).default(30),
  category: z.string().max(50).optional().nullable(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable()
    .or(z.literal('')),
  cost: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  capacity: z.coerce.number().min(1).max(100).optional(),
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

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data, error } = await supabase
    .from('services')
    .select(
      'id, name, description, price, duration_min, category, is_active, is_featured, color, cost, location_id, created_at',
    )
    .eq('business_id', businessId)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`services-create:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
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
    description: b.description ? sanitize(b.description) : null,
    price: b.price,
    duration_min: b.duration_min,
    category: b.category ? sanitize(b.category) : null,
    is_active: b.is_active ?? true,
    is_featured: b.is_featured ?? false,
    color: b.color || null,
    cost: b.cost ?? null,
    location_id: b.location_id || null,
  }

  const { data, error } = await supabase
    .from('services')
    .insert(payload as unknown as never)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
