import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  price: z.coerce.number().min(0).max(1_000_000).optional(),
  duration_min: z.coerce.number().min(5).max(480).optional(),
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

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`services-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const params = await props.params
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
  const parsed = PatchSchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const b = parsed.data
  const updates: Record<string, unknown> = {}
  if (b.name !== undefined) updates.name = sanitize(b.name)
  if (b.description !== undefined)
    updates.description = b.description ? sanitize(b.description) : null
  if (b.price !== undefined) updates.price = b.price
  if (b.duration_min !== undefined) updates.duration_min = b.duration_min
  if (b.category !== undefined) updates.category = b.category ? sanitize(b.category) : null
  if (b.is_active !== undefined) updates.is_active = b.is_active
  if (b.is_featured !== undefined) updates.is_featured = b.is_featured
  if (b.color !== undefined) updates.color = b.color || null
  if (b.cost !== undefined) updates.cost = b.cost
  if (b.location_id !== undefined) updates.location_id = b.location_id || null
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'no_updates' }, { status: 400 })

  const { data, error } = await supabase
    .from('services')
    .update(updates as unknown as never)
    .eq('id', params.id)
    .eq('business_id', businessId)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`services-delete:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const params = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { error } = await supabase
    .from('services')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
