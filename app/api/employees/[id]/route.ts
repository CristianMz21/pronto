import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(120).optional().nullable().or(z.literal('')),
  role: z.enum(['admin', 'staff', 'barbero']).optional(),
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

function buildEmployeeUpdates(b: z.infer<typeof PatchSchema>): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  if (b.name !== undefined) updates.name = sanitize(b.name)
  if (b.phone !== undefined) updates.phone = b.phone ? sanitize(b.phone) : null
  if (b.email !== undefined) updates.email = b.email ? sanitize(b.email) : null
  if (b.role !== undefined) updates.role = b.role
  if (b.color !== undefined) updates.color = b.color || null
  if (b.specialties !== undefined) updates.specialties = b.specialties ?? []
  if (b.commission_rate !== undefined) updates.commission_rate = b.commission_rate ?? null
  if (b.commission_fixed !== undefined) updates.commission_fixed = b.commission_fixed ?? null
  if (b.is_active !== undefined) updates.is_active = b.is_active
  if (b.location_id !== undefined) updates.location_id = b.location_id || null
  return updates
}

async function getAuthBusinessId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ businessId: string } | { error: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  return { businessId }
}

async function parseBody(request: Request): Promise<{ raw: unknown } | { error: NextResponse }> {
  try {
    const raw: unknown = await request.json()
    return { raw }
  } catch {
    return { error: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`employees-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const params = await props.params
  const supabase = await createClient()
  const auth = await getAuthBusinessId(supabase)
  if ('error' in auth) return auth.error

  const body = await parseBody(request)
  if ('error' in body) return body.error

  const parsed = PatchSchema.safeParse(body.raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const updates = buildEmployeeUpdates(parsed.data)
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'no_updates' }, { status: 400 })

  const { data, error } = await supabase
    .from('employees')
    .update(updates as unknown as never)
    .eq('id', params.id)
    .eq('business_id', auth.businessId)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`employees-delete:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const params = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Soft delete: set is_active false to keep FK integrity (appointments, commissions)
  const { error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('business_id', businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
