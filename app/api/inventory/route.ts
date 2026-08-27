import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { rateLimit, getIp } from '@/lib/rate-limit'

const BodySchema = z.object({
  name:                z.string().min(1).max(200),
  sku:                 z.string().max(50).optional().nullable(),
  category:            z.string().max(100).optional().nullable(),
  unit:                z.string().max(20).optional().nullable(),
  quantity:            z.coerce.number().min(0).max(1_000_000).optional(),
  cost_price:          z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  sell_price:          z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  low_stock_threshold: z.coerce.number().min(0).max(1_000_000).optional(),
  barcode:             z.string().max(100).optional().nullable(),
  description:         z.string().max(1000).optional().nullable(),
})

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim()
}

export async function POST(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`inventory-create:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses').select('id').eq('owner_id', user.id).maybeSingle()
  if (!business) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })
  }
  const body = parsed.data

  const { data: item, error } = await supabase.from('inventory_items').insert({
    business_id: business.id,
    name: sanitize(body.name),
    sku: body.sku ? sanitize(body.sku) : null,
    category: body.category ? sanitize(body.category) : null,
    unit: body.unit ? sanitize(body.unit) : 'pcs',
    quantity: body.quantity ?? 0,
    cost_price: body.cost_price ?? null,
    sell_price: body.sell_price ?? null,
    low_stock_threshold: body.low_stock_threshold ?? 5,
    barcode: (body as unknown as { barcode?: string }).barcode ? sanitize((body as unknown as { barcode?: string }).barcode!) : null,
  }).select('id').single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'sku_taken', message: 'An item with this SKU already exists.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: item.id }, { status: 201 })
}
