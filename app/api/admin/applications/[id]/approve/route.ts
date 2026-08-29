import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/auth/roles'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user as unknown as { email?: string | null; user_metadata?: Record<string, unknown> | null })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: app } = await admin.from('barbershop_applications').select('*').eq('id', id).maybeSingle()
  if (!app || (app as { status: string }).status !== 'pending') {
    return NextResponse.json({ error: 'not_pending' }, { status: 400 })
  }

  const licenseKey = randomUUID()
  const { error: updErr } = await admin.from('barbershop_applications').update({ status: 'approved', license_key: licenseKey }).eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Create auth user for owner (if not exists)
  const email = (app as { email: string }).email
  const { data: existing } = await admin.from('businesses').select('id').eq('license_key', licenseKey).maybeSingle()
  // For MVP, we don't auto-create auth user here; we just generate license and let owner register via /register with license_key
  // In production, you would create the user via admin.auth.admin.createUser and send magic link
  return NextResponse.json({ license_key: licenseKey, message: 'Aprobado' })
}
