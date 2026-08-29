import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit, getIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/
const QuerySchema = z.object({
  slug: z.string().min(3).max(30).regex(SLUG_RE, 'invalid slug'),
})

export async function GET(request: Request) {
  const ip = getIp(request)
  if (!rateLimit(`check-slug:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const { searchParams } = new URL(request.url)
  const slugRaw = (searchParams.get('slug') ?? '').toLowerCase().trim()
  const parsed = QuerySchema.safeParse({ slug: slugRaw })
  if (!parsed.success) {
    return NextResponse.json({ available: false })
  }
  const slug = parsed.data.slug

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ available: false })

  const admin = createServiceClient()

  // Find the current user's business so we exclude it from the "taken" check
  // (the user's own current slug should not block them from keeping it)
  const { data: ownBusiness } = await admin
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  let query = admin.from('businesses').select('id', { count: 'exact', head: true }).eq('slug', slug)

  if (ownBusiness) {
    query = query.neq('id', ownBusiness.id)
  }

  const { count } = await query

  return NextResponse.json({ available: count === 0 })
}
