import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MODULES, ModuleKey } from '@/lib/modules'
import { rateLimit, getIp } from '@/lib/rate-limit'

const VALID_MODULES = Object.keys(MODULES) as ModuleKey[]

export async function PATCH(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`business-modules:${ip}`, { limit: 30, windowMs: 60 * 1000 })) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { enabled_modules?: unknown }

  if (!Array.isArray(body.enabled_modules)) {
    return NextResponse.json({ error: 'enabled_modules must be an array' }, { status: 400 })
  }

  const modules = (body.enabled_modules as unknown[]).filter(
    (m): m is string => typeof m === 'string' && (VALID_MODULES as string[]).includes(m)
  )

  const { error } = await supabase
    .from('businesses')
    .update({ enabled_modules: modules })
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
