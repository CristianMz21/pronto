import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getClient360, normalizePhoneCO } from '@/lib/client-360'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const QuerySchema = z.object({
  phone: z.string().min(6).max(30).optional().nullable(),
  business_id: z.string().uuid().optional().nullable(),
  business_slug: z.string().min(2).max(64).optional().nullable(),
})

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`client-me:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    phone: url.searchParams.get('phone'),
    business_id: url.searchParams.get('business_id'),
    business_slug: url.searchParams.get('business_slug'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  let { phone, business_id: businessId, business_slug: businessSlug } = parsed.data

  // Normalize phone if present
  if (phone) phone = normalizePhoneCO(phone)

  const service = createServiceClient()

  // Resolve businessId if not provided
  if (!businessId) {
    if (businessSlug) {
      const { data: biz } = await service
        .from('businesses')
        .select('id')
        .eq('slug', businessSlug)
        .maybeSingle()
      if (biz) businessId = (biz as { id: string }).id
    }
  }
  if (!businessId) {
    // Try to resolve via user's linked client or owned business
    if (user) {
      // Try find linked client for any business — pick first
      const { data: linked } = await service
        .from('clients')
        .select('business_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (linked) businessId = (linked as { business_id: string }).business_id
      else {
        // Try owned business
        const { data: owned } = await service
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()
        if (owned) businessId = (owned as { id: string }).id
      }
    }
  }
  if (!businessId) {
    // Fallback to escuderia slug
    const { data: esc } = await service
      .from('businesses')
      .select('id')
      .eq('slug', 'escuderia')
      .maybeSingle()
    if (esc) businessId = (esc as { id: string }).id
    else {
      // Last resort: first business
      const { data: anyBiz } = await service.from('businesses').select('id').limit(1).maybeSingle()
      if (anyBiz) businessId = (anyBiz as { id: string }).id
    }
  }

  if (!businessId) return NextResponse.json({ error: 'business_not_found' }, { status: 404 })

  // Need either phone or userId
  const userId = user?.id ?? null
  if (!phone && !userId) {
    return NextResponse.json(
      { error: 'phone_or_auth_required', message: 'Provide phone or auth' },
      { status: 401 },
    )
  }

  try {
    const result = await getClient360(service as unknown as Parameters<typeof getClient360>[0], {
      businessId,
      phone: phone ?? undefined,
      userId: userId ?? undefined,
    })
    return NextResponse.json(result)
  } catch (e) {
    const err = e as Error & { code?: string; status?: number }
    if (err.message === 'client_not_found' || err.code === 'client_not_found') {
      return NextResponse.json({ error: 'client_not_found' }, { status: 404 })
    }
    if (err.message === 'validation_failed') {
      return NextResponse.json(
        { error: 'validation_failed', details: (err as unknown as { details: unknown }).details },
        { status: 422 },
      )
    }
    return NextResponse.json({ error: 'internal', message: err.message }, { status: 500 })
  }
}
