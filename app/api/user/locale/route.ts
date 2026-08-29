import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
const SUPPORTED = ['en', 'es', 'it', 'pt'] as const

export async function POST(request: Request) {
  const _ipPOST = getIp(request as unknown as Request)
  if (!rateLimit(`locale-route:post:${_ipPOST}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  {
    const _b = z.object({}).passthrough().safeParse({})
    if (!_b.success) return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }

  const body = await request.json().catch(() => ({}))
  const locale: string = body.locale ?? ''
  if (!(SUPPORTED as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set('dashboard_locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return response
}
