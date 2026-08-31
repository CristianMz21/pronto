import DOMPurify from 'isomorphic-dompurify'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const BodySchema = z.object({
  item_id: z.string().uuid(),
  from_location_id: z.string().uuid().nullable().optional(),
  to_location_id: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().min(0.001).max(1_000_000),
  note: z.string().max(500).optional().nullable(),
  // Optional idempotency key (if provided, we check recent duplicate to avoid double transfer on retry)
  idempotency_key: z.string().max(100).optional().nullable(),
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

async function validateLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  fromId: string | null,
  toId: string | null,
): Promise<NextResponse | null> {
  if (fromId) {
    const { data: fromLoc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', fromId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!fromLoc)
      return NextResponse.json(
        { error: 'from_location_not_found', message: 'Sede origen no pertenece a este negocio' },
        { status: 404 },
      )
  }
  if (toId) {
    const { data: toLoc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', toId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!toLoc)
      return NextResponse.json(
        { error: 'to_location_not_found', message: 'Sede destino no pertenece a este negocio' },
        { status: 404 },
      )
  }
  if (fromId && toId && fromId === toId)
    return NextResponse.json(
      { error: 'same_location', message: 'Origen y destino no pueden ser la misma sede' },
      { status: 422 },
    )
  return null
}

function buildTransferNote(
  note: string | null,
  fromId: string | null,
  toId: string | null,
  idempotencyKey: string | null,
): string {
  if (note) return `${note}${idempotencyKey ? ` [${idempotencyKey}]` : ''}`
  return `Transfer ${fromId ?? '—'} → ${toId ?? '—'}${idempotencyKey ? ` [${idempotencyKey}]` : ''}`
}

async function checkIdempotency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  itemId: string,
  idempotencyKey: string | null,
): Promise<NextResponse | null> {
  if (!idempotencyKey) return null
  const { data: recent } = await supabase
    .from('inventory_movements')
    .select('id')
    .eq('business_id', businessId)
    .eq('item_id', itemId)
    .eq('type', 'transfer')
    .ilike('note', `%${idempotencyKey}%`)
    .limit(1)
    .maybeSingle()
  if (recent) return NextResponse.json({ ok: true, idempotent: true })
  return null
}

async function tryRpcTransfer(
  businessId: string,
  itemId: string,
  quantity: number,
  fromId: string | null,
  toId: string | null,
  note: string | null,
  idempotencyKey: string | null,
  userId: string,
): Promise<NextResponse | null> {
  try {
    const svc = createServiceClient()
    const { error: rpcError } = await (
      svc as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
      }
    ).rpc('transfer_inventory', {
      p_business_id: businessId,
      p_item_id: itemId,
      p_quantity: quantity,
      p_from_location_id: fromId,
      p_to_location_id: toId,
      p_note: buildTransferNote(note, fromId, toId, idempotencyKey),
      p_user_id: userId,
    })
    if (!rpcError) return NextResponse.json({ ok: true })
    const rpcMsg = String(rpcError.message ?? '')
    if (rpcMsg.includes('insufficient_stock'))
      return NextResponse.json({ error: 'insufficient_stock', message: rpcMsg }, { status: 409 })
    if (rpcMsg.includes('item_not_found'))
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (rpcMsg.includes('from_location_not_found') || rpcMsg.includes('to_location_not_found'))
      return NextResponse.json({ error: 'location_not_found', message: rpcMsg }, { status: 404 })
    if (rpcMsg.includes('same_location'))
      return NextResponse.json(
        { error: 'same_location', message: 'Origen y destino no pueden ser la misma sede' },
        { status: 422 },
      )
    if (
      !rpcMsg.includes('does not exist') &&
      !rpcMsg.includes('not found') &&
      !rpcMsg.includes('schema cache')
    ) {
      if (rpcMsg.includes('quantity_must_be_positive'))
        return NextResponse.json({ error: 'validation_failed', message: rpcMsg }, { status: 422 })
      if (rpcMsg && !rpcMsg.includes('transfer_inventory'))
        return NextResponse.json({ error: rpcMsg }, { status: 500 })
    }
  } catch {}
  return null
}

async function fallbackTransfer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  itemId: string,
  quantity: number,
  fromId: string | null,
  toId: string | null,
  note: string | null,
  idempotencyKey: string | null,
  userId: string,
  currentQty: number,
): Promise<NextResponse> {
  const { data: freshItem } = await supabase
    .from('inventory_items')
    .select('quantity')
    .eq('id', itemId)
    .eq('business_id', businessId)
    .maybeSingle()
  const freshQty = Number((freshItem as { quantity: number } | null)?.quantity ?? currentQty)
  if (freshQty < quantity)
    return NextResponse.json(
      {
        error: 'insufficient_stock',
        message: `Stock insuficiente: ${freshQty} disponible, ${quantity} solicitados`,
      },
      { status: 409 },
    )

  const insertNote = buildTransferNote(note, fromId, toId, idempotencyKey)
  const { error: insErr } = await supabase
    .from('inventory_movements')
    .insert({
      business_id: businessId,
      item_id: itemId,
      type: 'transfer',
      quantity,
      note: insertNote,
      created_by: userId,
      from_location_id: fromId,
      to_location_id: toId,
    } as unknown as never)
  if (!insErr) return NextResponse.json({ ok: true })

  const msg = String(insErr.message ?? '')
  if (msg.includes('transfer') || msg.includes('check') || msg.includes('type')) {
    const { error: outErr } = await supabase
      .from('inventory_movements')
      .insert({
        business_id: businessId,
        item_id: itemId,
        type: 'adjustment',
        quantity: -quantity,
        note: `Transfer out to ${toId ?? '—'}${idempotencyKey ? ` [${idempotencyKey}]` : ''}`,
        created_by: userId,
      } as unknown as never)
    if (outErr) return NextResponse.json({ error: outErr.message }, { status: 500 })
    const { error: inErr } = await supabase
      .from('inventory_movements')
      .insert({
        business_id: businessId,
        item_id: itemId,
        type: 'adjustment',
        quantity,
        note: `Transfer in from ${fromId ?? '—'}${idempotencyKey ? ` [${idempotencyKey}]` : ''}`,
        created_by: userId,
      } as unknown as never)
    if (inErr) return NextResponse.json({ error: inErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, fallback: true })
  }
  if (msg.includes('column')) {
    const { error: adjErr } = await supabase
      .from('inventory_movements')
      .insert({
        business_id: businessId,
        item_id: itemId,
        type: 'adjustment',
        quantity: -quantity,
        note: `Transfer (legacy) ${fromId ?? '—'} → ${toId ?? '—'}`,
        created_by: userId,
      } as unknown as never)
    if (adjErr) return NextResponse.json({ error: adjErr.message }, { status: 500 })
    await supabase
      .from('inventory_movements')
      .insert({
        business_id: businessId,
        item_id: itemId,
        type: 'adjustment',
        quantity,
        note: `Transfer (legacy) in`,
        created_by: userId,
      } as unknown as never)
    return NextResponse.json({ ok: true, fallback: true })
  }
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function POST(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`inventory-transfer:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
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
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )

  const { item_id, quantity } = parsed.data
  const fromId = parsed.data.from_location_id ?? null
  const toId = parsed.data.to_location_id ?? null
  const note = parsed.data.note ? sanitize(parsed.data.note) : null
  const idempotencyKey = parsed.data.idempotency_key ?? null

  const { data: item, error: itemErr } = await supabase
    .from('inventory_items')
    .select('id, business_id, quantity, name')
    .eq('id', item_id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  if (!item)
    return NextResponse.json(
      { error: 'not_found', message: 'Item no encontrado en este negocio' },
      { status: 404 },
    )

  const locErr = await validateLocations(supabase, businessId, fromId, toId)
  if (locErr) return locErr

  const currentQty = Number((item as { quantity: number }).quantity ?? 0)
  if (currentQty < quantity)
    return NextResponse.json(
      {
        error: 'insufficient_stock',
        message: `Stock insuficiente: ${currentQty} disponible, ${quantity} solicitados`,
      },
      { status: 409 },
    )

  const idem = await checkIdempotency(supabase, businessId, item_id, idempotencyKey)
  if (idem) return idem

  const rpcRes = await tryRpcTransfer(
    businessId,
    item_id,
    quantity,
    fromId,
    toId,
    note,
    idempotencyKey,
    user.id,
  )
  if (rpcRes) return rpcRes

  return fallbackTransfer(
    supabase,
    businessId,
    item_id,
    quantity,
    fromId,
    toId,
    note,
    idempotencyKey,
    user.id,
    currentQty,
  )
}
