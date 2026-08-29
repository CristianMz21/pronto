import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const ParamsSchema = z.object({ id: z.string().uuid() })
const BodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sku: z.string().max(50).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  unit: z.string().max(20).optional().nullable(),
  low_stock_threshold: z.any().optional(),
  cost_price: z.any().optional().nullable(),
  sell_price: z.any().optional().nullable(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`inventory-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const params = await props.params
  const parsedParams = ParamsSchema.safeParse(params)
  if (!parsedParams.success)
    return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsedBody = BodySchema.safeParse(rawBody)
  if (!parsedBody.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsedBody.error.flatten().fieldErrors },
      { status: 422 },
    )
  const body = parsedBody.data

  const { data, error } = await supabase
    .from('inventory_items')
    .update({
      name: body.name,
      sku: (body.sku as string) || null,
      category: (body.category as string) || null,
      unit: body.unit,
      low_stock_threshold: Number(body.low_stock_threshold) || 5,
      cost_price: body.cost_price ? Number(body.cost_price) : null,
      sell_price: body.sell_price ? Number(body.sell_price) : null,
    } as unknown as never)
    .eq('id', parsedParams.data.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'sku_taken', message: 'An item with this SKU already exists.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
