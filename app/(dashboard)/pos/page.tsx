import { History } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { Header } from '@/components/layout/header'
import { getUserRole } from '@/lib/auth/roles'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'
import { formatInBusinessTimezone } from '@/lib/utils'

import { POSTerminal } from './pos-terminal'

interface SearchParams {
  bookingId?: string
  clientId?: string
  serviceId?: string
  staffId?: string
  location?: string
}

type PosBusiness = {
  id: string
  currency: string
  timezone: string
  require_cash_register_for_cash?: boolean | null
  slug?: string
}

async function resolvePosBusiness(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | undefined,
): Promise<PosBusiness | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, currency, timezone, require_cash_register_for_cash, slug')
    .eq('owner_id', userId ?? '')
    .maybeSingle()
  if (owned) return owned as unknown as PosBusiness
  const { data: empBiz } = await supabase
    .from('employees')
    .select(
      'business_id, businesses!inner(id, currency, timezone, require_cash_register_for_cash, slug)',
    )
    .eq('user_id', userId ?? '')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!empBiz?.businesses) return null
  return empBiz.businesses as unknown as PosBusiness
}

async function resolvePosRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | undefined,
  businessId: string,
): Promise<string | null> {
  try {
    return await getUserRole(
      supabase as unknown as Parameters<typeof getUserRole>[0],
      userId ?? '',
      businessId,
    )
  } catch {
    return null
  }
}

async function fetchBarberId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | undefined,
  businessId: string,
): Promise<string | null> {
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', userId ?? '')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return (emp as { id: string } | null)?.id ?? null
}

async function fetchPosData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  biz: PosBusiness,
  selectedLocation: string | null,
  isBarbero: boolean,
  barberEmployeeId: string | null,
) {
  let servicesQuery = supabase
    .from('services')
    .select('id, name, price, duration_min, category, location_id')
    .eq('business_id', biz.id)
    .eq('is_active', true)
    .order('name')
  let employeesQuery = supabase
    .from('employees')
    .select('id, name, location_id')
    .eq('business_id', biz.id)
    .eq('is_active', true)
    .order('name')

  if (selectedLocation) {
    servicesQuery = servicesQuery.or(
      `location_id.eq.${selectedLocation},location_id.is.null`,
    ) as typeof servicesQuery
    employeesQuery = employeesQuery.eq('location_id', selectedLocation) as typeof employeesQuery
  }

  if (isBarbero && barberEmployeeId) {
    employeesQuery = employeesQuery.eq('id', barberEmployeeId) as typeof employeesQuery
    const { data: empServices } = await supabase
      .from('employee_services')
      .select('service_id')
      .eq('employee_id', barberEmployeeId)
    const allowedIds =
      (empServices as { service_id: string }[] | null)?.map((r) => r.service_id) ?? []
    if (allowedIds.length > 0)
      servicesQuery = servicesQuery.in('id', allowedIds) as typeof servicesQuery
    else
      servicesQuery = servicesQuery.eq(
        'id',
        '00000000-0000-0000-0000-000000000000',
      ) as typeof servicesQuery
  }

  let cashQuery = supabase
    .from('cash_registers')
    .select('id')
    .eq('business_id', biz.id)
    .eq('status', 'open')
  if (selectedLocation)
    cashQuery = cashQuery.eq('location_id', selectedLocation) as typeof cashQuery

  const [
    { data: services },
    { data: employees },
    { data: clients },
    { data: openRegister },
    { data: locations },
  ] = await Promise.all([
    servicesQuery,
    employeesQuery,
    supabase
      .from('clients')
      .select('id, name, phone')
      .eq('business_id', biz.id)
      .order('name')
      .limit(200),
    cashQuery.maybeSingle(),
    supabase.from('locations').select('id, name').eq('business_id', biz.id).order('name'),
  ])
  return { services, employees, clients, openRegister, locations }
}

async function buildBookingContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  searchParams: SearchParams,
  biz: PosBusiness,
  isBarbero: boolean,
  barberEmployeeId: string | null,
) {
  if (!searchParams.bookingId) return undefined
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, starts_at, clients(name), services(name), employees(id, name)')
    .eq('id', searchParams.bookingId)
    .eq('business_id', biz.id)
    .maybeSingle()
  if (!appt) return undefined
  const clientName = (appt.clients as { name: string } | null)?.name ?? 'Walk-in'
  const serviceName = (appt.services as { name: string } | null)?.name ?? ''
  const tz = biz.timezone ?? 'UTC'
  return {
    bookingId: appt.id,
    clientId: searchParams.clientId ?? '',
    serviceId: searchParams.serviceId ?? '',
    staffId:
      isBarbero && barberEmployeeId
        ? barberEmployeeId
        : (searchParams.staffId ??
          (appt.employees as { id: string; name: string } | null)?.id ??
          ''),
    label: `${clientName} — ${serviceName} — ${formatInBusinessTimezone(appt.starts_at, tz, 'time')}`,
  }
}

export default async function POSPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()

  const business = await resolvePosBusiness(supabase, user?.id)
  if (!business) return null
  const biz = business

  const role = await resolvePosRole(supabase, user?.id, biz.id)
  const isBarbero = role === 'barbero'

  let barberEmployeeId: string | null = null
  if (isBarbero) barberEmployeeId = await fetchBarberId(supabase, user?.id, biz.id)

  const selectedLocation = searchParams.location ?? null

  const { services, employees, clients, openRegister, locations } = await fetchPosData(
    supabase,
    biz,
    selectedLocation,
    isBarbero,
    barberEmployeeId,
  )

  const bookingContext = await buildBookingContext(
    supabase,
    searchParams,
    biz,
    isBarbero,
    barberEmployeeId,
  )

  const t = await getTranslations('pos')

  return (
    <>
      <Header
        title={t('title')}
        actions={
          <Link
            href="/pos/history"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <History className="w-4 h-4" /> Sales history
          </Link>
        }
      />
      {((locations as unknown as Array<{ id: string; name: string }> | null)?.length ?? 0) > 1 &&
        !isBarbero && (
          <div className="px-6 pt-3 flex gap-2 text-xs">
            <Link
              href="/pos"
              className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              Todas
            </Link>
            {(locations as unknown as Array<{ id: string; name: string }>)?.map(
              (l: { id: string; name: string }) => (
                <Link
                  key={l.id}
                  href={`/pos?location=${l.id}`}
                  className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
                >
                  {l.name}
                </Link>
              ),
            )}
          </div>
        )}
      {/* @ts-expect-error - tsc strict fix */}
      <POSTerminal
        businessId={biz.id}
        currency={biz.currency}
        services={services ?? []}
        employees={employees ?? []}
        clients={clients ?? []}
        bookingContext={bookingContext}
        initialHasOpenRegister={!!openRegister}
        requireCashRegister={biz.require_cash_register_for_cash ?? true}
        isBarbero={isBarbero}
        currentEmployeeId={barberEmployeeId}
        locationId={selectedLocation}
      />
    </>
  )
}
