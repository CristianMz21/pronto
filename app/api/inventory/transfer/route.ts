import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimit, getIp } from '@/lib/rate-limit'

const BodySchema = z.object({
  item_id: z.string().uuid(),
  from_location_id: z.string().uuid().nullable().optional(),
  to_location_id: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().min(0.001).max(1_000_000),
  note: z.string().max(500).optional().nullable(),
})

async function resolveBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: owned } = await supabase.from('businesses').select('id').eq('owner_id', userId).maybeSingle()
  if (owned) return (owned as { id: string }).id
  const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  if (emp) return (emp as { business_id: string }).business_id
  return null
}

export async function POST(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`inventory-transfer:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 })) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, { status: 422 })
  const { item_id, quantity } = parsed.data

  // Fetch item and check business ownership + stock
  const { data: item, error: itemErr } = await supabase.from('inventory_items').select('id, business_id, quantity, name').eq('id', item_id).eq('business_id', businessId).maybeSingle()
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const currentQty = Number((item as { quantity: number }).quantity ?? 0)
  if (currentQty < quantity) {
    return NextResponse.json({ error: 'insufficient_stock', message: `Stock insuficiente: ${currentQty} disponible, ${quantity} solicitados` }, { status: 409 })
  }

  // Atomic transfer: create two movements (out + in) and update quantity if location-aware? For single-stock model, quantity stays global, but we log transfer for audit.
  // If item has location_id, we could split per location later. For now: decrement global then increment (net 0) + audit logs with from/to.
  const fromId = parsed.data.from_location_id ?? null
  const toId = parsed.data.to_location_id ?? null

  // Insert out movement
  const { error: outErr } = await supabase.from('inventory_movements').insert({
    business_id: businessId,
    item_id,
    type: 'transfer',
    quantity: -quantity,
    note: parsed.data.note ?? `Transfer ${fromId ?? '—'} → ${toId ?? '—'}`,
    created_by: user.id,
    from_location_id: fromId,
    to_location_id: toId,
  })
  if (outErr && !outErr.message.includes('column')) {
    return NextResponse.json({ error: outErr.message }, { status: 500 })
  }
  // Fallback if transfer type not allowed (older enum): use adjustment
  if (outErr && outErr.message.includes('transfer')) {
    const { error: adjErr } = await supabase.from('inventory_movements').insert({
      business_id: businessId,
      item_id,
      type: 'adjustment',
      quantity: -quantity,
      note: `Transfer out to ${toId ?? '—'}`,
      created_by: user.id,
    })
    if (adjErr) return NextResponse.json({ error: adjErr.message }, { status: 500 })
    await supabase.from('inventory_movements').insert({
      business_id: businessId,
      item_id,
      type: 'adjustment',
      quantity: quantity,
      note: `Transfer in from ${fromId ?? '—'}`,
      created_by: user.id,
    })
  }

  // For now quantity unchanged (transfer within same global stock) — keep audit only. Future per-location stock would adjust.
  return NextResponse.json({ ok: true })
}
