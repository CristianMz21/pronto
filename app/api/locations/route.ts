import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { formatLocationSlug } from '@/lib/locations'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  is_active: z.boolean().optional().default(true),
})

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

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data, error } = await supabase
    .from('locations')
    .select('id, business_id, name, slug, address, phone, is_active, created_at')
    .eq('business_id', businessId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`locations-create:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
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

  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const slug = formatLocationSlug(parsed.data.slug || parsed.data.name)
  if (!slug)
    return NextResponse.json(
      { error: 'validation_failed', details: { slug: ['invalid slug'] } },
      { status: 422 },
    )

  // Validate slug format: only lowercase alphanum + hyphen
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        details: { slug: ['slug must be lowercase alphanumeric with hyphens'] },
      },
      { status: 422 },
    )
  }

  const payload = {
    business_id: businessId,
    name: sanitize(parsed.data.name),
    slug,
    address: parsed.data.address ? sanitize(parsed.data.address) : null,
    phone: parsed.data.phone ? sanitize(parsed.data.phone) : null,
    is_active: parsed.data.is_active ?? true,
  }

  const { data, error } = await supabase
    .from('locations')
    .insert(payload as unknown as never)
    .select('id, slug')
    .single()
  if (error) {
    const msg = String(error.message ?? '')
    const code = (error as { code?: string }).code ?? ''
    if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json(
        { error: 'slug_taken', message: 'Ya existe una sucursal con ese slug en este negocio' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: msg || 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
