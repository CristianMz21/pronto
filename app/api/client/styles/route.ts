/* eslint-disable sonarjs/cognitive-complexity */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { validatePhotoFile, MAX_PHOTO_BYTES } from '@/lib/styles'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const GetQuerySchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
})

async function resolveClient(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<{ clientId: string; businessId: string } | null> {
  const { data } = await service
    .from('clients')
    .select('id, business_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; business_id: string }
  return { clientId: row.id, businessId: row.business_id }
}

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`styles-get:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const parsed = GetQuerySchema.safeParse({ client_id: url.searchParams.get('client_id') })
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  // If client_id provided and not matching auth's client, forbid
  if (parsed.data.client_id && parsed.data.client_id !== resolved.clientId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data, error } = await service
    .from('client_styles')
    .select('*')
    .eq('client_id', resolved.clientId)
    .order('created_at', { ascending: false } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`styles-post:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_formdata' }, { status: 400 })
  }

  const file = form.get('photo') as File | null
  const serviceIdRaw = form.get('service_id') as string | null
  const employeeIdRaw = form.get('employee_id') as string | null
  const notesRaw = form.get('notes') as string | null

  if (!file) return NextResponse.json({ error: 'photo_required' }, { status: 400 })

  // Validate file size + mime via helper
  const check = validatePhotoFile({ size: file.size, type: file.type, name: file.name })
  if (!check.ok) {
    const status = check.reason === 'file_too_large' ? 413 : 422
    return NextResponse.json({ error: check.reason, max_bytes: MAX_PHOTO_BYTES }, { status })
  }

  // Validate service/employee belong to business if provided
  let serviceId: string | null = serviceIdRaw?.trim() || null
  let employeeId: string | null = employeeIdRaw?.trim() || null
  if (serviceId) {
    const c = z.string().uuid().safeParse(serviceId)
    if (!c.success) return NextResponse.json({ error: 'invalid_service_id' }, { status: 422 })
    const { data: svc } = await service
      .from('services')
      .select('id')
      .eq('id', serviceId)
      .eq('business_id', resolved.businessId)
      .maybeSingle()
    if (!svc) return NextResponse.json({ error: 'service_not_found' }, { status: 404 })
  } else serviceId = null

  if (employeeId) {
    const c = z.string().uuid().safeParse(employeeId)
    if (!c.success) return NextResponse.json({ error: 'invalid_employee_id' }, { status: 422 })
    const { data: emp } = await service
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .eq('business_id', resolved.businessId)
      .maybeSingle()
    if (!emp) return NextResponse.json({ error: 'employee_not_found' }, { status: 404 })
  } else employeeId = null

  const notes = notesRaw?.toString().slice(0, 500) ?? null

  // Upload to storage bucket client-styles
  const arrayBuf = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${resolved.businessId}/${resolved.clientId}/${Date.now()}_${safeName}`

  const { error: uploadErr } = await service.storage
    .from('client-styles')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadErr) {
    const msg = String(uploadErr.message ?? '')
    if (msg.includes('size') || msg.includes('limit')) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
    }
    return NextResponse.json({ error: 'upload_failed', message: msg }, { status: 500 })
  }

  let photoUrl: string
  try {
    const { data, error } = await service.storage.from('client-styles').createSignedUrl(path, 3600)
    if (!error && data?.signedUrl) photoUrl = data.signedUrl
    else {
      const { data: pub } = service.storage.from('client-styles').getPublicUrl(path)
      photoUrl = pub.publicUrl
    }
  } catch {
    const { data: pub } = service.storage.from('client-styles').getPublicUrl(path)
    photoUrl = pub.publicUrl
  }

  const payload = {
    client_id: resolved.clientId,
    business_id: resolved.businessId,
    service_id: serviceId,
    employee_id: employeeId,
    photo_url: photoUrl,
    notes,
    is_favorite: false,
  }

  const { data, error } = await service
    .from('client_styles')
    .insert(payload as never)
    .select('*')
    .single()
  if (error) {
    // Clean up storage on db fail
    try {
      await service.storage.from('client-styles').remove([path])
    } catch {}
    return NextResponse.json({ error: 'insert_failed', message: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`styles-del:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'invalid_id' }, { status: 422 })

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  // Verify owns
  const { data: existing } = await service
    .from('client_styles')
    .select('photo_url, client_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if ((existing as { client_id: string }).client_id !== resolved.clientId)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { error } = await service.from('client_styles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort storage cleanup
  try {
    const url = (existing as { photo_url: string }).photo_url
    const m = url.match(/client-styles\/(.+?)(?:\?|$)/)
    if (m?.[1]) await service.storage.from('client-styles').remove([decodeURIComponent(m[1])])
  } catch {}

  return NextResponse.json({ ok: true })
}
