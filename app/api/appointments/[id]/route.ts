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

async function resolveAppointmentBusiness(
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

async function validateEmployeePatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  employeeId: string | null,
): Promise<NextResponse | null> {
  if (!employeeId) return null
  const { data: empCheck } = await supabase
    .from('employees')
    .select('id, is_active')
    .eq('id', employeeId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!empCheck) return NextResponse.json({ error: 'employee_not_found' }, { status: 404 })
  if (!(empCheck as { is_active: boolean }).is_active)
    return NextResponse.json({ error: 'barber_inactive' }, { status: 400 })
  return null
}

async function validateStatusPatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  appointmentId: string,
  newStatus: string,
): Promise<{ patchValue?: string; error?: NextResponse }> {
  const { data: current } = await supabase
    .from('appointments')
    .select('status')
    .eq('id', appointmentId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!current) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const curStatus = (current as { status: string }).status
  if (curStatus === 'completed' && newStatus.startsWith('cancelled'))
    return {
      error: NextResponse.json(
        { error: 'fsm_guard', message: 'Cannot cancel a completed appointment' },
        { status: 409 },
      ),
    }
  if (curStatus === 'paid' && newStatus !== 'paid')
    return {
      error: NextResponse.json(
        { error: 'fsm_guard', message: 'Paid appointment cannot change status' },
        { status: 409 },
      ),
    }
  return { patchValue: newStatus }
}

async function isManagerUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  businessId: string,
): Promise<boolean> {
  const { data: bizOwner } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (bizOwner) return true
  const { data: empRole } = await supabase
    .from('employees')
    .select('role')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle()
  const role = (empRole as { role?: string } | null)?.role ?? ''
  return ['manager', 'admin', 'owner'].includes(role.toLowerCase())
}

async function validateTipPatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  appointmentId: string,
  tipAmount: number,
  managerOverride: boolean | undefined,
  userId: string,
): Promise<{ patchValue?: number; error?: NextResponse }> {
  const { data: apptForTip } = await supabase
    .from('appointments')
    .select('price')
    .eq('id', appointmentId)
    .eq('business_id', businessId)
    .maybeSingle()
  const price = (apptForTip as { price?: number } | null)?.price ?? 0
  const { isValidTipAmount } = await import('@/lib/tips')
  let isManager = false
  if (managerOverride) isManager = await isManagerUser(supabase, userId, businessId)
  const check = isValidTipAmount(tipAmount, Number(price), { isManager })
  if (!check.ok)
    return {
      error: NextResponse.json(
        {
          error: check.reason,
          message: 'Propina inválida: debe ser >=0 y <=50% del monto salvo manager',
        },
        { status: 422 },
      ),
    }
  return { patchValue: tipAmount }
}

function mapAppointmentUpdateError(error: unknown): NextResponse | null {
  const msg = String((error as { message?: string })?.message ?? '')
  if (msg.includes('slot_already_booked') || msg.includes('slot_taken'))
    return NextResponse.json({ error: 'slot_taken' }, { status: 409 })
  if (msg.includes('outside_availability'))
    return NextResponse.json({ error: 'outside_availability' }, { status: 400 })
  if (msg.includes('barber_'))
    return NextResponse.json(
      { error: msg.includes('barber_unavailable') ? 'barber_unavailable' : 'barber_not_qualified' },
      { status: 409 },
    )
  return null
}

async function handleWaitlistOnCancel(data: unknown): Promise<void> {
  const appt = data as unknown as {
    starts_at: string
    business_id: string
    location_id: string | null
    service_id: string | null
    employee_id: string | null
  }
  try {
    const service = createServiceClient()
    const { notifyNext } = await import('@/lib/waitlist')
    const notified = await notifyNext(service as unknown as Parameters<typeof notifyNext>[0], {
      business_id: appt.business_id,
      desired_at: appt.starts_at,
      location_id: appt.location_id,
      service_id: appt.service_id,
      employee_id: appt.employee_id,
    })
    if (!notified) return
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
      if (!c?.whatsapp_number) return
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
            accessToken: (biz as { meta_whatsapp_access_token: string }).meta_whatsapp_access_token,
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
    } catch {}
  } catch {}
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const ip = getIp(request)
  if (!rateLimit(`appointments-patch:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 }))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

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
  if (!parsed.success)
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  const body = parsed.data

  const businessId = await resolveAppointmentBusiness(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const patch: Record<string, unknown> = {}

  if (body.employee_id !== undefined) {
    patch.employee_id = body.employee_id || null
    const empErr = await validateEmployeePatch(
      supabase,
      businessId,
      patch.employee_id as string | null,
    )
    if (empErr) return empErr
  }

  if (body.status !== undefined) {
    const res = await validateStatusPatch(supabase, businessId, params.id, body.status)
    if (res.error) return res.error
    patch.status = res.patchValue
  }

  if (body.tip_amount !== undefined) {
    const res = await validateTipPatch(
      supabase,
      businessId,
      params.id,
      body.tip_amount,
      body.manager_override,
      user.id,
    )
    if (res.error) return res.error
    patch.tip_amount = res.patchValue
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'no_changes' }, { status: 400 })

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
    const mapped = mapAppointmentUpdateError(error)
    if (mapped) return mapped
    const msg = String((error as { message?: string })?.message ?? '')
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (patch.status === 'cancelled' || patch.status === 'cancelled_late') {
    await handleWaitlistOnCancel(data)
  }

  return NextResponse.json(data)
}
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
