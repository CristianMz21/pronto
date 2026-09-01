import DOMPurify from 'isomorphic-dompurify'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  ClientPreferencesRowSchema,
  PreferencesSchema,
  NotificationPrefsSchema,
  ClientStatusSchema,
  parsePreferences,
  parseNotificationPrefs,
  serializePreferences,
  serializeNotificationPrefs,
} from '@/lib/preferences'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const PutSchema = z.object({
  preferences: PreferencesSchema.optional(),
  status: ClientStatusSchema.optional(),
  preferred_barber_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  notification_prefs: NotificationPrefsSchema.optional(),
})

function sanitizeNotes(v: string): string {
  return (DOMPurify as unknown as { sanitize: (a: string, b: unknown) => string })
    .sanitize(v, { ALLOWED_TAGS: [] })
    .trim()
    .slice(0, 500)
}

async function resolveClientId(
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
  if (!rateLimit(`client-prefs-get:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const resolved = await resolveClientId(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const { data: client } = await service
    .from('clients')
    .select('preferences, status, preferred_barber_id, notification_prefs')
    .eq('id', resolved.clientId)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })
  const c = client as {
    preferences: unknown
    status: string
    preferred_barber_id: string | null
    notification_prefs: unknown
  }
  return NextResponse.json({
    preferences: parsePreferences(c.preferences),
    status: c.status,
    preferred_barber_id: c.preferred_barber_id,
    notification_prefs: parseNotificationPrefs(c.notification_prefs),
  })
}

export async function PUT(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`client-prefs:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Allow raw preferences at top level or nested
  const normalized =
    body && typeof body === 'object' && 'preferences' in (body as Record<string, unknown>)
      ? body
      : { preferences: body }
  const parsed = PutSchema.safeParse(normalized)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const service = createServiceClient()
  const resolved = await resolveClientId(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const { data: existing } = await service
    .from('clients')
    .select('preferences')
    .eq('id', resolved.clientId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const currentPrefs = parsePreferences((existing as { preferences: unknown }).preferences)
  const patch = parsed.data.preferences ?? {}
  // Sanitize notes if present
  if (patch.notes) patch.notes = sanitizeNotes(patch.notes)
  // Merge: if provided, replace whole, but ensure we sanitize
  const merged = { ...currentPrefs, ...patch } as typeof currentPrefs
  // Validate merged before write
  const validated = PreferencesSchema.safeParse(merged)
  if (!validated.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: validated.error.flatten() },
      { status: 422 },
    )
  }

  const updatePayload: Record<string, unknown> = {}
  if (parsed.data.preferences !== undefined) {
    // If client sent full preferences object, we treat as merge result
    // Remove undefined keys
    const clean = serializePreferences(validated.data)
    updatePayload.preferences = clean
  }
  if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status
  if (parsed.data.preferred_barber_id !== undefined)
    updatePayload.preferred_barber_id = parsed.data.preferred_barber_id
  if (parsed.data.notification_prefs !== undefined)
    updatePayload.notification_prefs = serializeNotificationPrefs(parsed.data.notification_prefs)

  // Validate preferred_barber_id belongs to same business if provided
  if (updatePayload.preferred_barber_id && typeof updatePayload.preferred_barber_id === 'string') {
    const { data: emp } = await service
      .from('employees')
      .select('id')
      .eq('id', updatePayload.preferred_barber_id as string)
      .eq('business_id', resolved.businessId)
      .maybeSingle()
    if (!emp) {
      return NextResponse.json({ error: 'barber_not_found' }, { status: 404 })
    }
  }

  const { error } = await service
    .from('clients')
    .update(updatePayload as never)
    .eq('id', resolved.clientId)
  if (error) {
    return NextResponse.json({ error: 'update_failed', message: error.message }, { status: 500 })
  }

  // Return updated
  const { data: updated } = await service
    .from('clients')
    .select('preferences, status, preferred_barber_id, notification_prefs')
    .eq('id', resolved.clientId)
    .maybeSingle()
  const u = updated as {
    preferences: unknown
    status: string
    preferred_barber_id: string | null
    notification_prefs: unknown
  }
  return NextResponse.json({
    ok: true,
    preferences: parsePreferences(u.preferences),
    status: u.status,
    preferred_barber_id: u.preferred_barber_id,
    notification_prefs: parseNotificationPrefs(u.notification_prefs),
  })
}

// Export schema for tasks health
export const _schema = ClientPreferencesRowSchema
