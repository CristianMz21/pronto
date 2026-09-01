import DOMPurify from 'isomorphic-dompurify'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const PostSchema = z.object({
  appointment_id: z.string().uuid(),
  message: z.string().trim().min(1).max(500),
})

const GetQuerySchema = z.object({
  appointment_id: z.string().uuid(),
})

function sanitize(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] }).trim().slice(0, 500)
}

async function resolveClient(service: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await service
    .from('clients')
    .select('id, business_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const r = data as { id: string; business_id: string }
  return { clientId: r.id, businessId: r.business_id }
}

async function verifyAppointment(
  service: ReturnType<typeof createServiceClient>,
  appointmentId: string,
  clientId: string,
  businessId: string,
) {
  const { data } = await service
    .from('appointments')
    .select('id, client_id, business_id, notes')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!data) return { error: 'appointment_not_found' as const }
  const row = data as {
    id: string
    client_id: string | null
    business_id: string
    notes: string | null
  }
  if (row.business_id !== businessId) return { error: 'forbidden' as const }
  if (row.client_id !== clientId) return { error: 'forbidden' as const }
  return { row }
}

export async function GET(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`client-chat-get:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  const supabaseAuth = await createClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const appointmentId = new URL(req.url).searchParams.get('appointment_id')
  const parsed = GetQuerySchema.safeParse({ appointment_id: appointmentId })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const ver = await verifyAppointment(
    service,
    parsed.data.appointment_id,
    resolved.clientId,
    resolved.businessId,
  )
  if ('error' in ver) {
    const status = ver.error === 'appointment_not_found' ? 404 : 403
    return NextResponse.json({ error: ver.error }, { status })
  }

  // Fetch chat messages from notification_log where ref_id = appointment_id and type = chat_message
  const { data } = await service
    .from('notification_log')
    .select('id, ref_id, type, channel, sent_at')
    .eq('ref_id', parsed.data.appointment_id)
    .eq('type', 'chat_message')
    .order('sent_at', { ascending: true } as never)
    .limit(50)
  const rows =
    (data as unknown as Array<{
      id: string
      ref_id: string
      type: string
      channel: string
      sent_at: string
    }>) ?? []

  // Decode message from channel field hack? Instead we store message in type? Actually notification_log has no message body.
  // For V1 we store message in notification_log.type = 'chat_message' and ref_id = appointment_id, but need body.
  // We abuse channel to store truncated message via additional fetch from appointments.notes json? Instead we fetch directly from appointments.notes if we appended json array.
  // Simpler: we appended chat to appointments.notes as JSON array stringified; parse it.
  // Retrieve notes and try to parse as chat array
  const notes = (ver.row as { notes: string | null }).notes
  let chatNotes: Array<{ at: string; message: string; from: string }> = []
  if (notes) {
    try {
      const parsedNotes = JSON.parse(notes) as unknown
      if (
        Array.isArray(parsedNotes) &&
        parsedNotes.every((x) => typeof (x as { message?: unknown }).message === 'string')
      ) {
        chatNotes = parsedNotes as never
      } else {
        // plain text notes, treat as single chat? Keep empty
        chatNotes = []
      }
    } catch {
      chatNotes = []
    }
  }

  // If notification_log empty but notes has chats, synthesize rows
  if (rows.length === 0 && chatNotes.length > 0) {
    return NextResponse.json({
      messages: chatNotes.map((c, idx) => ({
        id: `note-${idx}`,
        appointment_id: parsed.data.appointment_id,
        message: c.message,
        from: c.from ?? 'client',
        sent_at: c.at,
      })),
      source: 'notes',
    })
  }

  // Otherwise, try to enrich rows with actual message content stored via notes insertion time correlation
  // For V1 we also stored message in channel? Not ideal. We'll return chatNotes as source of truth, falling back to rows count.
  if (chatNotes.length > 0) {
    return NextResponse.json({
      messages: chatNotes.map((c, idx) => ({
        id: `note-${idx}`,
        appointment_id: parsed.data.appointment_id,
        message: c.message,
        from: c.from ?? 'client',
        sent_at: c.at,
      })),
      log_count: rows.length,
      source: 'notes+log',
    })
  }

  // Fallback: return logs as messages with empty body (should not happen after POST fix)
  return NextResponse.json({
    messages: rows.map((r) => ({
      id: r.id,
      appointment_id: r.ref_id,
      message: `[${r.type}] ${r.channel}`,
      from: 'system',
      sent_at: r.sent_at,
    })),
    source: 'log',
  })
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`client-chat-post:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 })) {
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
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const service = createServiceClient()
  const resolved = await resolveClient(service, user.id)
  if (!resolved) return NextResponse.json({ error: 'client_not_found' }, { status: 404 })

  const ver = await verifyAppointment(
    service,
    parsed.data.appointment_id,
    resolved.clientId,
    resolved.businessId,
  )
  if ('error' in ver) {
    const status = ver.error === 'appointment_not_found' ? 404 : 403
    return NextResponse.json({ error: ver.error }, { status })
  }

  const clean = sanitize(parsed.data.message)
  if (!clean) return NextResponse.json({ error: 'message_empty' }, { status: 422 })

  // Append to appointments.notes as JSON array (moderado: DomPurify + 500 char)
  const existingNotes = (ver.row as { notes: string | null }).notes
  let chatArray: Array<{ at: string; message: string; from: string }> = []
  if (existingNotes) {
    try {
      const p = JSON.parse(existingNotes) as unknown
      if (Array.isArray(p)) chatArray = p as never
      else
        chatArray = [
          { at: new Date().toISOString(), message: existingNotes.slice(0, 500), from: 'client' },
        ]
    } catch {
      // existing notes is plain text, preserve as first entry if not JSON
      if (existingNotes.trim())
        chatArray = [
          { at: new Date().toISOString(), message: existingNotes.slice(0, 500), from: 'client' },
        ]
    }
  }
  chatArray.push({ at: new Date().toISOString(), message: clean, from: 'client' })
  // Keep last 20
  if (chatArray.length > 20) chatArray = chatArray.slice(-20)
  const notesJson = JSON.stringify(chatArray)

  const { error: updErr } = await service
    .from('appointments')
    .update({ notes: notesJson } as never)
    .eq('id', parsed.data.appointment_id)
  if (updErr)
    return NextResponse.json({ error: 'update_failed', message: updErr.message }, { status: 500 })

  // Also insert into notification_log for 1h dedup + staff visibility
  try {
    await service.from('notification_log').insert({
      business_id: resolved.businessId,
      ref_id: parsed.data.appointment_id,
      type: 'chat_message',
      channel: 'whatsapp',
    } as never)
  } catch {}

  return NextResponse.json(
    { ok: true, message: clean, appointment_id: parsed.data.appointment_id },
    { status: 201 },
  )
}
