import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { verifyWhatsAppCredentials } from '@/lib/whatsapp'

const BodySchema = z.object({
  business_id: z.string().uuid(),
  phone_number_id: z.string().max(100).nullable().optional(),
  access_token: z.string().max(2000).nullable().optional(),
  verify: z.boolean().optional().default(false),
})

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

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`wa-verify:${ip}`, { limit: 10, windowMs: 60 * 1000 }))
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
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const body = parsed.data

  // Ensure business_id matches resolved tenant
  if (body.business_id !== businessId) {
    // allow admin of that business only — already checked via resolve, but enforce
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Persist credentials (even if verify false, save them)
  const phoneId = body.phone_number_id?.trim() || null
  const token = body.access_token?.trim() || null

  const { error: updErr } = await supabase
    .from('businesses')
    .update({
      meta_whatsapp_phone_number_id: phoneId,
      meta_whatsapp_access_token: token,
    })
    .eq('id', businessId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  if (body.verify) {
    if (!phoneId || !token)
      return NextResponse.json(
        { error: 'missing_credentials', message: 'phone_number_id and access_token required' },
        { status: 400 },
      )
    const result = await verifyWhatsAppCredentials({ phoneNumberId: phoneId, accessToken: token })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, saved: true })
}
