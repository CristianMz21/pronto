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
  itemId: z.string().uuid(),
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const _ipPOST: string = getIp(req as unknown as Request)
  if (!rateLimit(`low-stock-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  // Verify the caller is an authenticated user who owns the business for this item.
  const sessionClient = await createServerClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const raw: unknown = (await req.json()) as unknown
    const parsed = LowStockBodySchema.safeParse(raw)
    if (!parsed.success) {
      const hasItemId =
        typeof (raw as Record<string, unknown>)?.itemId === 'string' &&
        ((raw as Record<string, unknown>).itemId as string).length > 0
      if (!hasItemId) return NextResponse.json({ error: 'missing itemId' }, { status: 400 })
      return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
    }
    const { itemId }: { itemId: string } = parsed.data

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: itemData } = await supabase
      .from('inventory_items')
      .select('id, name, quantity, unit, low_stock_threshold, business_id')
      .eq('id', itemId)
      .single<InventoryItemRow>()

    const item: InventoryItemRow | null = (itemData as unknown as InventoryItemRow | null) ?? null

    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })

    // Confirm the authenticated user owns this business
    const { data: ownershipData } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', item.business_id)
      .eq('owner_id', user.id)
      .maybeSingle<OwnershipRow>()

    const ownership: OwnershipRow | null = (ownershipData as unknown as OwnershipRow | null) ?? null

    if (!ownership) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (item.quantity > item.low_stock_threshold) return NextResponse.json({ skipped: 'stock ok' })

    // Dedup — SELECT first so a failed send remains retryable (INSERT happens after)
    const { data: alreadySentData } = await supabase
      .from('notification_log')
      .select('id')
      .eq('business_id', item.business_id)
      .eq('ref_id', `low_stock_${item.id}_${item.quantity}`)
      .eq('type', 'low_stock')
      .eq('channel', 'email')
      .maybeSingle<NotificationLogIdRow>()

    const alreadySent: NotificationLogIdRow | null =
      (alreadySentData as unknown as NotificationLogIdRow | null) ?? null

    if (alreadySent) return NextResponse.json({ skipped: 'already alerted at this level' })

    // FIX: include owner_id so we can fall back to auth email when businesses.email is null
    const { data: bizData } = await supabase
      .from('businesses')
      .select(
        'owner_id, name, email, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, owner_whatsapp',
      )
      .eq('id', item.business_id)
      .single<BusinessLowStockRow>()

    const biz: BusinessLowStockRow | null =
      (bizData as unknown as BusinessLowStockRow | null) ?? null

    // ── Telegram → владельцу ─────────────────────────────────────────────────
    if (biz?.telegram_bot_token && biz?.telegram_chat_id) {
      const token: string = biz.telegram_bot_token
      const chatId: string = biz.telegram_chat_id
      await sendTelegramMessage(
        token,
        chatId,
        tplLowStock({
          itemName: item.name,
          quantity: item.quantity,
          unit: item.unit,
          threshold: item.low_stock_threshold,
        }),
      )
    }

    // ── Viber → владельцу ────────────────────────────────────────────────────
    if (biz?.viber_bot_token && biz?.viber_chat_id) {
      const token: string = biz.viber_bot_token
      const chatId: string = biz.viber_chat_id
      await sendViberMessage(
        token,
        chatId,
        viberTplLowStock({
          itemName: item.name,
          quantity: item.quantity,
          unit: item.unit,
          threshold: item.low_stock_threshold,
        }),
      )
    }

    // ── WhatsApp → владельцу ─────────────────────────────────────────────────
    if (biz?.owner_whatsapp) {
      const to: string = biz.owner_whatsapp
      await sendWhatsAppMessage(
        to,
        waTplLowStock({
          itemName: item.name,
          quantity: item.quantity,
          unit: item.unit,
          threshold: item.low_stock_threshold,
        }),
      )
    }

    // ── Email → владельцу ────────────────────────────────────────────────────
    // businesses.email may be NULL — fall back to the owner's Supabase auth email.
    let recipientEmail: string | null = biz?.email ?? null
    if (!recipientEmail && biz?.owner_id) {
      const ownerId: string = biz.owner_id
      const { data: authData } = await supabase.auth.admin.getUserById(ownerId)
      const authUser: unknown = (authData as unknown as { user?: { email?: string | null } | null })
        ?.user
      if (
        authUser !== null &&
        typeof authUser === 'object' &&
        'email' in (authUser as Record<string, unknown>)
      ) {
        const emailVal: unknown = (authUser as Record<string, unknown>).email
        recipientEmail = typeof emailVal === 'string' ? emailVal : null
      } else {
        recipientEmail = null
      }
    }

    if (!recipientEmail) {
      return NextResponse.json({ tg: true, email: 'skipped: no email found for owner' })
    }

    const toEmail: string = recipientEmail
    const businessName: string | undefined = biz?.name ?? undefined
    await sendLowStockAlert({
      to: toEmail,
      businessName: businessName ?? '',
      items: [
        {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          threshold: item.low_stock_threshold,
        },
      ],
    })

    // Record AFTER successful send so a failed send remains retryable
    await supabase.from('notification_log').insert({
      business_id: item.business_id,
      ref_id: `low_stock_${item.id}_${item.quantity}`,
      type: 'low_stock',
      channel: 'email',
    } as Database['public']['Tables']['notification_log']['Insert'])

    return NextResponse.json({ sent: true })
  } catch (_err: unknown) {
    // console.error('[email/low-stock]', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
