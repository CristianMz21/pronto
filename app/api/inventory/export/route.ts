import { type NextRequest, NextResponse } from 'next/server'
// SECURITY: xlsx@0.18.5 has GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) + GHSA-5pgg-2g8v-p4x9 (ReDoS)
// — no fix available upstream. Kept because export is server-only, no user-supplied workbook parsing,
// and output is trusted json_to_sheet. Mitigation: never call XLSX.read on untrusted input.
// TODO(strict-audit): migrate to exceljs@4.4+ (actively maintained) when inventory export is refactored —
// tracked as tech-debt, npm audit --audit-level=high will still flag until then.
import * as XLSX from 'xlsx'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
export async function GET(_req: NextRequest) {
  const _ipGET = getIp(_req as unknown as Request)
  if (!rateLimit(`export-route:get:${_ipGET}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _parsed = z
      .object({})
      .passthrough()
      .safeParse(Object.fromEntries(new URL(_req.url).searchParams))
    if (!_parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: items } = await supabase
    .from('inventory_items')
    .select(
      'name,sku,barcode,category,unit,quantity,low_stock_threshold,cost_price,sell_price,description',
    )
    .eq('business_id', business.id)
    .order('name')

  const rows = (items ?? []).map((item) => ({
    Name: item.name,
    SKU: item.sku ?? '',
    Barcode: item.barcode ?? '',
    Category: item.category ?? '',
    Unit: item.unit,
    Stock: item.quantity,
    'Low stock alert': item.low_stock_threshold,
    'Cost price': item.cost_price ?? '',
    'Sell price': item.sell_price ?? '',
    Description: item.description ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Products')

  ws['!cols'] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 8 },
    { wch: 8 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 40 },
  ]

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `pronto-products-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
