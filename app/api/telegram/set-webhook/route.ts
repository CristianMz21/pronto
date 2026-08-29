/**
 * POST /api/telegram/set-webhook
 *
 * Регистрирует URL вебхука в Telegram для конкретного бота.
 * Вызывается из Settings → Notifications когда пользователь нажимает "Connect".
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { getTelegramBotInfo, setTelegramWebhook } from '@/lib/telegram'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

export async function POST(req: NextRequest) {
  const _ipPOST = getIp(req as unknown as Request)
  if (!rateLimit(`set-webhook-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: biz } = await supabase
      .from('businesses')
      .select('id, telegram_bot_token')
      .eq('owner_id', user.id)
      .single()

    if (!biz?.telegram_bot_token) {
      return NextResponse.json(
        { error: 'No bot token saved. Save it in Settings first.' },
        { status: 400 },
      )
    }

    if (!APP_URL || APP_URL.includes('localhost')) {
      return NextResponse.json(
        {
          error:
            'Telegram webhooks require a public HTTPS URL. Set NEXT_PUBLIC_APP_URL to your deployed domain.',
        },
        { status: 400 },
      )
    }

    // Проверяем токен — получаем info о боте
    const botInfo = await getTelegramBotInfo(biz.telegram_bot_token)
    if (!botInfo.ok) {
      return NextResponse.json(
        { error: 'Invalid bot token. Check it in @BotFather.' },
        { status: 400 },
      )
    }

    // Регистрируем вебхук
    const webhookUrl = `${APP_URL}/api/telegram/webhook?bid=${biz.id}`
    const result = await setTelegramWebhook(biz.telegram_bot_token, webhookUrl)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.description ?? 'Failed to set webhook' },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      botUsername: botInfo.result?.username,
      webhookUrl,
    })
  } catch (_err) {
    // console.error('[telegram/set-webhook]', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
