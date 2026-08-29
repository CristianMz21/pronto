import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const PatchSchema = z.object({
  employee_id: z.string().uuid().nullable().or(z.literal('')).optional(),
  status: z
    .enum([
      'scheduled',
      'confirmed',
      'checked-in',
      'in-service',
      'completed',
      'cancelled',
      'cancelled_late',
      'no_show',
      'paid',
      'pending',
    ])
    .optional(),
  tip_amount: z.coerce.number().int().min(0).max(1_000_000).optional(),
  // For manager override when tip >50%
  manager_override: z.boolean().optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`appointments-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const params = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }
  const body = parsed.data

  // Resolve business (owner or employee)
  let businessId: string | null = null
  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) businessId = (owned as { id: string }).id
  else {
    const { data: emp } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (emp) businessId = (emp as { business_id: string }).business_id
  }
  if (!businessId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const patch: Record<string, unknown> = {}

  if (body.employee_id !== undefined) {
    patch.employee_id = body.employee_id || null
    // If employee_id provided, verify it belongs to business and is active
    if (patch.employee_id) {
      const { data: empCheck } = await supabase
        .from('employees')
        .select('id, is_active')
        .eq('id', patch.employee_id as string)
        .eq('business_id', businessId)
        .maybeSingle()
      if (!empCheck) return NextResponse.json({ error: 'employee_not_found' }, { status: 404 })
      if (!(empCheck as { is_active: boolean }).is_active)
        return NextResponse.json({ error: 'barber_inactive' }, { status: 400 })
    }
  }

  if (body.status !== undefined) {
    // FSM guard: allow any transition for now except completed->cancelled (per spec 039/047)
    // Fetch current status to enforce
    const { data: current } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', params.id)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const curStatus = (current as { status: string }).status
    if (curStatus === 'completed' && body.status.startsWith('cancelled')) {
      return NextResponse.json(
        { error: 'fsm_guard', message: 'Cannot cancel a completed appointment' },
        { status: 409 },
      )
    }
    if (curStatus === 'paid' && body.status !== 'paid') {
      // paid is terminal
      return NextResponse.json(
        { error: 'fsm_guard', message: 'Paid appointment cannot change status' },
        { status: 409 },
      )
    }
    patch.status = body.status
  }

  if (body.tip_amount !== undefined) {
    // Validate tip_amount
    const { data: apptForTip } = await supabase
      .from('appointments')
      .select('price')
      .eq('id', params.id)
      .eq('business_id', businessId)
      .maybeSingle()
    const price = (apptForTip as { price?: number } | null)?.price ?? 0
    const { isValidTipAmount } = await import('@/lib/tips')
    // Check role for manager override
    let isManager = false
    if (body.manager_override) {
      // Verify user is manager/owner/admin
      const { data: bizOwner } = await supabase
        .from('businesses')
        .select('id')
        .eq('id', businessId)
        .eq('owner_id', user.id)
        .maybeSingle()
      if (bizOwner) isManager = true
      else {
        const { data: empRole } = await supabase
          .from('employees')
          .select('role')
          .eq('user_id', user.id)
          .eq('business_id', businessId)
          .eq('is_active', true)
          .maybeSingle()
        const role = (empRole as { role?: string } | null)?.role ?? ''
        if (['manager', 'admin', 'owner'].includes(role.toLowerCase())) isManager = true
      }
    }
    const check = isValidTipAmount(body.tip_amount, Number(price), { isManager })
    if (!check.ok)
      return NextResponse.json(
        {
          error: check.reason,
          message: 'Propina inválida: debe ser >=0 y <=50% del monto salvo manager',
        },
        { status: 422 },
      )
    patch.tip_amount = body.tip_amount
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'no_changes' }, { status: 400 })

  // Use authenticated client for update to keep RLS + test mocks compatible; service only for side-effects
  const { data, error } = (await supabase
    .from('appointments')
    .update(patch as unknown as never)
    .eq('id', params.id)
    .eq('business_id', businessId)
    .select(
      'id, status, employee_id, starts_at, business_id, location_id, service_id, employees(id, name)',
    )
    .single()) as unknown as { data: unknown; error: unknown }

  if (error) {
    const msg = String((error as { message?: string })?.message ?? '')
    if (msg.includes('slot_already_booked') || msg.includes('slot_taken'))
      return NextResponse.json({ error: 'slot_taken' }, { status: 409 })
    if (msg.includes('outside_availability'))
      return NextResponse.json({ error: 'outside_availability' }, { status: 400 })
    if (msg.includes('barber_'))
      return NextResponse.json(
        {
          error: msg.includes('barber_unavailable') ? 'barber_unavailable' : 'barber_not_qualified',
        },
        { status: 409 },
      )
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // If cancelled, trigger waitlist notifyNext (US7 T068) — fire-and-forget
  if (patch.status === 'cancelled' || patch.status === 'cancelled_late') {
    try {
      const appt = data as unknown as {
        starts_at: string
        business_id: string
        location_id: string | null
        service_id: string | null
        employee_id: string | null
      }
      // Use service client so RLS bypass (create lazily to avoid breaking tests that don't mock it)
      const service = createServiceClient()
      const { notifyNext } = await import('@/lib/waitlist')
      // @ts-expect-error - tsc strict fix
      const notified = await notifyNext(service as unknown as Parameters<typeof notifyNext>[0], {
        business_id: appt.business_id,
        desired_at: appt.starts_at,
        location_id: appt.location_id,
        service_id: appt.service_id ?? undefined,
        employee_id: appt.employee_id ?? undefined,
      })
      if (notified) {
        // Attempt to send WhatsApp to notified client (fire-and-forget)
        try {
          const service2 = createServiceClient()
          const { data: client } = await service2
            .from('clients')
            .select('name, phone, whatsapp_number, email')
            .eq('id', (notified as { client_id: string }).client_id)
            .maybeSingle()
          const c = client as {
            name: string
            whatsapp_number: string | null
            phone: string | null
          } | null
          if (c?.whatsapp_number) {
            const { sendWhatsAppMessage } = await import('@/lib/whatsapp')
            const { data: biz } = await service2
              .from('businesses')
              .select('name, meta_whatsapp_phone_number_id, meta_whatsapp_access_token')
              .eq('id', appt.business_id)
              .maybeSingle()
            const waCreds = (
              biz as {
                meta_whatsapp_phone_number_id?: string
                meta_whatsapp_access_token?: string
              } | null
            )?.meta_whatsapp_phone_number_id
              ? {
                  phoneNumberId: (biz as { meta_whatsapp_phone_number_id: string })
                    .meta_whatsapp_phone_number_id,
                  accessToken: (biz as { meta_whatsapp_access_token: string })
                    .meta_whatsapp_access_token,
                }
              : undefined
            const dateStr = new Date(appt.starts_at).toLocaleString('es-CO', {
              timeZone: (biz as { timezone?: string } | null)?.timezone ?? 'America/Bogota',
            })
            await sendWhatsAppMessage(
              c.whatsapp_number,
              {
                type: 'waitlist' as unknown as string,
                clientName: c.name,
                slot: dateStr,
                businessName: (biz as { name?: string } | null)?.name ?? '',
              } as unknown as Parameters<typeof sendWhatsAppMessage>[1],
              waCreds,
            )
          }
        } catch {}
      }
    } catch (_e) {
      // console.error('[appointments PATCH] waitlist notifyNext error', e)
    }
  }

  // If tip_amount patched, also create tips row for reporting (if transaction exists?)
  // For MVP, we just keep tip_amount on appointment/transactions; separate tips table via POST /api/tips would be used. No extra action needed.

  return NextResponse.json(data)
}
// @ts-expect-error - tsc strict fix
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id, business_id, client_id, employee_id, service_id, starts_at, ends_at, status, price, tip_amount, notes, recurring_id',
    )
    .eq('id', params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(data)
}
