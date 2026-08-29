import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const QuerySchema = z.object({
  barcode: z.string().min(1).max(100),
})

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`inventory-lookup:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!business) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const rawBarcode = new URL(req.url).searchParams.get('barcode')?.trim().slice(0, 100) ?? ''
  const parsedQ = QuerySchema.safeParse({ barcode: rawBarcode })
  if (!parsedQ.success) return NextResponse.json({ found: false })
  const barcode = parsedQ.data.barcode

  const { data: item } = await supabase
    .from('inventory_items')
    .select(
      'id, name, sku, barcode, description, category, unit, quantity, cost_price, sell_price, low_stock_threshold, photo_url',
    )
    .eq('business_id', business.id)
    .eq('barcode', barcode)
    .maybeSingle()

  if (!item) return NextResponse.json({ found: false })
  return NextResponse.json({ found: true, item })
}
