import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json()

  const { data, error } = await supabase.from('inventory_items').update({
    name: body.name,
    sku: (body.sku as string) || null,
    category: (body.category as string) || null,
    unit: body.unit,
    low_stock_threshold: Number(body.low_stock_threshold) || 5,
    cost_price: body.cost_price ? Number(body.cost_price) : null,
    sell_price: body.sell_price ? Number(body.sell_price) : null,
  }).eq('id', params.id).select().single()

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
