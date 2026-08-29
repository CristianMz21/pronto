import DOMPurify from 'isomorphic-dompurify'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const ImportRowSchema = z.object({
  name: z.string().max(200).optional(),
  sku: z.string().max(50).optional(),
  barcode: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  unit: z.string().max(20).optional(),
  quantity: z.string().max(20).optional(),
  cost_price: z.string().max(20).optional(),
  sell_price: z.string().max(20).optional(),
  description: z.string().max(1000).optional(),
})
const BodySchema = z.object({ rows: z.array(ImportRowSchema).max(500).optional() })

const sanitize = (s: string, max = 500) =>
  DOMPurify.sanitize(s ?? '', { ALLOWED_TAGS: [] })
    .trim()
    .slice(0, max)

function parseNum(val: string | undefined): number | null {
  if (!val) return null
  const raw = String(val).replace(',', '.').trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return n
}
function parseMoney(val: string | undefined): number | null {
  const n = parseNum(val)
  if (n == null) return null
  // COP: integer (no centavos), other currencies 2 decimals. Store as numeric(10,2) and round to 2 decimals;
  // Math.round avoids floating errors (e.g. 0.1+0.2). COP values like 30000 remain 30000 after rounding.
  return Math.round(n * 100) / 100
}
function parseQty(val: string | undefined): number {
  const n = parseNum(val)
  if (n == null) return 0
  return Math.round(n * 1000) / 1000
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`inventory-import:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

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
  const rawRows = parsed.data.rows ?? []

  const sanitized = rawRows
    .map((row) => ({
      name: sanitize(String(row.name ?? ''), 200),
      sku: row.sku ? sanitize(String(row.sku), 50) : '',
      barcode: row.barcode ? sanitize(String(row.barcode), 100) : '',
      category: row.category ? sanitize(String(row.category), 100) : '',
      unit: row.unit ? sanitize(String(row.unit), 20) : 'pcs',
      quantity: String(row.quantity ?? '0'),
      cost_price: String(row.cost_price ?? ''),
      sell_price: String(row.sell_price ?? ''),
      description: row.description ? sanitize(String(row.description), 1000) : '',
    }))
    .filter((r) => r.name.length > 0)

  const skippedEmpty = rawRows.length - sanitized.length

  if (sanitized.length === 0) {
    return NextResponse.json({ imported: 0, skipped: rawRows.length, errors: [] })
  }

  const { data: existing } = await supabase
    .from('inventory_items')
    .select('barcode, sku, name')
    .eq('business_id', business.id)

  const existingBarcodes = new Set(
    (existing ?? []).filter((e) => e.barcode).map((e) => e.barcode as string),
  )
  const existingSkus = new Set((existing ?? []).filter((e) => e.sku).map((e) => e.sku as string))
  const existingNames = new Set(
    (existing ?? [])
      .filter((e) => !e.barcode && !e.sku)
      .map((e) => (e.name as string).toLowerCase().trim()),
  )

  let skippedDupes = 0
  const toInsert: typeof sanitized = []

  for (const row of sanitized) {
    if (row.barcode && existingBarcodes.has(row.barcode)) {
      skippedDupes++
      continue
    }
    if (!row.barcode && row.sku && existingSkus.has(row.sku)) {
      skippedDupes++
      continue
    }
    if (!row.barcode && !row.sku && existingNames.has(row.name.toLowerCase().trim())) {
      skippedDupes++
      continue
    }
    if (row.barcode) existingBarcodes.add(row.barcode)
    if (row.sku) existingSkus.add(row.sku)
    if (!row.barcode && !row.sku) existingNames.add(row.name.toLowerCase().trim())
    toInsert.push(row)
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ imported: 0, skipped: skippedEmpty + skippedDupes, errors: [] })
  }

  const rows = toInsert.map((r) => ({
    business_id: business.id,
    name: r.name,
    sku: r.sku || null,
    barcode: r.barcode || null,
    category: r.category || null,
    unit: r.unit || 'pcs',
    quantity: parseQty(r.quantity),
    cost_price: parseMoney(r.cost_price),
    sell_price: parseMoney(r.sell_price),
    description: r.description || null,
    low_stock_threshold: 5,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('inventory_items')
    .insert(rows)
    .select('id')

  if (insertError) {
    console.error('[inventory/import] insert error:', insertError.message)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const imported = inserted?.length ?? 0
  const skipped = skippedEmpty + skippedDupes + (toInsert.length - imported)

  return NextResponse.json({ imported, skipped, errors: [] })
}
