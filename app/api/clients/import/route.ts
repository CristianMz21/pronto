import DOMPurify from 'isomorphic-dompurify'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const ImportRowSchema = z.object({
  name: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
})
const BodySchema = z.object({ clients: z.array(ImportRowSchema).max(500).optional() })

function sanitize(s: string, max: number): string {
  return DOMPurify.sanitize(String(s), { ALLOWED_TAGS: [] }).trim().slice(0, max)
}

export async function POST(req: NextRequest) {
  // ── Rate limit: 20 imports per 10 min per IP (bulk operation) ─────────────
  const ip = getIp(req)
  if (!rateLimit(`clients-import:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Get business ──────────────────────────────────────────────────────────
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // ── Parse + validate body (Zod) ─────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }
  const rawRows = parsed.data.clients ?? []

  // ── Sanitize rows (DomPurify + trim) ─────────────────────────────────────
  const sanitized = rawRows.map((row) => ({
    name: sanitize(row.name ?? '', 100),
    phone: sanitize(row.phone ?? '', 50),
    email: sanitize(row.email ?? '', 100),
    notes: sanitize(row.notes ?? '', 1000),
  }))

  // Skip rows where name is empty after sanitization
  const validRows = sanitized.filter((r) => r.name.length > 0)

  if (validRows.length === 0) {
    return NextResponse.json({ imported: 0, skipped: rawRows.length, errors: [] })
  }

  // ── Bulk upsert with ON CONFLICT DO NOTHING ───────────────────────────────
  // Rows without a phone get inserted as new clients (no dedup key).
  // Rows with a phone dedup against (business_id, phone).

  const withPhone = validRows.filter((r) => r.phone.length > 0)
  const withoutPhone = validRows.filter((r) => r.phone.length === 0)

  let imported = 0
  let skipped = rawRows.length - validRows.length // rows dropped due to empty name

  // Rows with phone — upsert with conflict target
  if (withPhone.length > 0) {
    const rows = withPhone.map((r) => ({
      business_id: business.id,
      name: r.name,
      phone: r.phone || null,
      email: r.email || null,
      notes: r.notes || null,
      tags: [] as string[],
    }))

    const { data, error } = await supabase
      .from('clients')
      .upsert(rows, {
        onConflict: 'business_id,phone',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      // console.error('[import] upsert error (with phone):', error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    imported += data?.length ?? 0
    skipped += withPhone.length - (data?.length ?? 0)
  }

  // Rows without phone — plain insert (no dedup possible)
  if (withoutPhone.length > 0) {
    const rows = withoutPhone.map((r) => ({
      business_id: business.id,
      name: r.name,
      phone: null,
      email: r.email || null,
      notes: r.notes || null,
      tags: [] as string[],
    }))

    const { data, error } = await supabase.from('clients').insert(rows).select('id')

    if (error) {
      // console.error('[import] insert error (no phone):', error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    imported += data?.length ?? 0
  }

  return NextResponse.json({ imported, skipped, errors: [] })
}
