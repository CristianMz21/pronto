import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'
// Skip auth and middleware — must respond even if Supabase is unreachable
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({}).passthrough()

export async function GET(req?: Request) {
  const r = (req ?? new Request('http://localhost')) as Request
  const ip = getIp(r)
  if (!rateLimit(`health:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const url = new URL(r.url)
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 422 })
  }
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
