import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { sendLowStockAlert } from '@/lib/email'
import { getIp, rateLimit } from '@/lib/rate-limit'
import type { Database } from '@/lib/supabase/database.types'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendTelegramMessage, tplLowStock } from '@/lib/telegram'
import { sendViberMessage, tplLowStock as viberTplLowStock } from '@/lib/viber'
import { sendWhatsAppMessage, tplLowStock as waTplLowStock } from '@/lib/whatsapp'

const LowStockBodySchema = z.object({
  itemId: z.string().min(1),
})

interface InventoryItemRow {
  id: string
  name: string
  quantity: number
  unit: string
  low_stock_threshold: number
  business_id: string
}

interface OwnershipRow {
  id: string
}

interface NotificationLogIdRow {
  id: string
}

interface BusinessLowStockRow {
  owner_id: string
  name: string
  email: string | null
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  viber_bot_token: string | null
  viber_chat_id: string | null
  owner_whatsapp: string | null
}

async function parseLowStockBody(
  req: NextRequest,
): Promise<{ itemId: string } | { error: NextResponse }> {
  let raw: unknown
  try {
    raw = (await req.json()) as unknown
  } catch {
    return { error: NextResponse.json({ error: 'validation_failed' }, { status: 422 }) }
  }
  const parsed = LowStockBodySchema.safeParse(raw)
  if (parsed.success) return { itemId: parsed.data.itemId }
  const hasItemId =
    typeof (raw as Record<string, unknown>)?.itemId === 'string' &&
    ((raw as Record<string, unknown>).itemId as string).length > 0
  if (!hasItemId) return { error: NextResponse.json({ error: 'missing itemId' }, { status: 400 }) }
  return { error: NextResponse.json({ error: 'validation_failed' }, { status: 422 }) }
}

async function fetchInventoryItem(
  supabase: ReturnType<typeof createClient<Database>>,
  itemId: string,
): Promise<InventoryItemRow | null> {
  const { data: itemData } = await supabase
    .from('inventory_items')
    .select('id, name, quantity, unit, low_stock_threshold, business_id')
    .eq('id', itemId)
    .single<InventoryItemRow>()
  return (itemData as unknown as InventoryItemRow | null) ?? null
}

async function checkOwnership(
  supabase: ReturnType<typeof createClient<Database>>,
  businessId: string,
  userId: string,
): Promise<boolean> {
  const { data: ownershipData } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle<OwnershipRow>()
  const ownership = (ownershipData as unknown as OwnershipRow | null) ?? null
  return !!ownership
}

async function checkAlreadySent(
  supabase: ReturnType<typeof createClient<Database>>,
  item: InventoryItemRow,
): Promise<boolean> {
  const { data: alreadySentData } = await supabase
    .from('notification_log')
    .select('id')
    .eq('business_id', item.business_id)
    .eq('ref_id', `low_stock_${item.id}_${item.quantity}`)
    .eq('type', 'low_stock')
    .eq('channel', 'email')
    .maybeSingle<NotificationLogIdRow>()
  return !!((alreadySentData as unknown as NotificationLogIdRow | null) ?? null)
}

async function fetchBizForLowStock(
  supabase: ReturnType<typeof createClient<Database>>,
  businessId: string,
): Promise<BusinessLowStockRow | null> {
  const { data: bizData } = await supabase
    .from('businesses')
    .select(
      'owner_id, name, email, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, owner_whatsapp',
    )
    .eq('id', businessId)
    .single<BusinessLowStockRow>()
  return (bizData as unknown as BusinessLowStockRow | null) ?? null
}

async function notifyOwnerChannels(
  biz: BusinessLowStockRow | null,
  item: InventoryItemRow,
): Promise<void> {
  if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
    await sendTelegramMessage(
      biz.telegram_bot_token,
      biz.telegram_chat_id,
      tplLowStock({
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        threshold: item.low_stock_threshold,
      }),
    )
  }
  if (biz?.viber_bot_token && biz?.viber_chat_id) {
    await sendViberMessage(
      biz.viber_bot_token,
      biz.viber_chat_id,
      viberTplLowStock({
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        threshold: item.low_stock_threshold,
      }),
    )
  }
  if (biz?.owner_whatsapp) {
    await sendWhatsAppMessage(
      biz.owner_whatsapp,
      waTplLowStock({
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        threshold: item.low_stock_threshold,
      }),
    )
  }
}

async function resolveRecipientEmail(
  supabase: ReturnType<typeof createClient<Database>>,
  biz: BusinessLowStockRow | null,
): Promise<string | null> {
  if (biz?.email) return biz.email
  if (!biz?.owner_id) return null
  const { data: authData } = await supabase.auth.admin.getUserById(biz.owner_id)
  const authUser: unknown = (authData as unknown as { user?: { email?: string | null } | null })
    ?.user
  if (
    authUser !== null &&
    typeof authUser === 'object' &&
    'email' in (authUser as Record<string, unknown>)
  ) {
    const emailVal: unknown = (authUser as Record<string, unknown>).email
    return typeof emailVal === 'string' ? emailVal : null
  }
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const _ipPOST: string = getIp(req as unknown as Request)
  if (!rateLimit(`low-stock-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  const sessionClient = await createServerClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await parseLowStockBody(req)
    if ('error' in body) return body.error

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const item = await fetchInventoryItem(supabase, body.itemId)
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const owns = await checkOwnership(supabase, item.business_id, user.id)
    if (!owns) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (item.quantity > item.low_stock_threshold) return NextResponse.json({ skipped: 'stock ok' })

    const already = await checkAlreadySent(supabase, item)
    if (already) return NextResponse.json({ skipped: 'already alerted at this level' })

    const biz = await fetchBizForLowStock(supabase, item.business_id)
    await notifyOwnerChannels(biz, item)

    const recipientEmail = await resolveRecipientEmail(supabase, biz)
    if (!recipientEmail)
      return NextResponse.json({ tg: true, email: 'skipped: no email found for owner' })

    await sendLowStockAlert({
      to: recipientEmail,
      businessName: biz?.name ?? '',
      items: [
        {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          threshold: item.low_stock_threshold,
        },
      ],
    })

    await supabase.from('notification_log').insert({
      business_id: item.business_id,
      ref_id: `low_stock_${item.id}_${item.quantity}`,
      type: 'low_stock',
      channel: 'email',
    } as Database['public']['Tables']['notification_log']['Insert'])

    return NextResponse.json({ sent: true })
  } catch (_err: unknown) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
