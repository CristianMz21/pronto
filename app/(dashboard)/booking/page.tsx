import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { BookingCalendar } from './booking-calendar'
import { getAuthUser } from '@/lib/auth-user'
import { DEFAULT_LEAD_MINUTES } from '@/lib/booking-availability'
import { getUserRole } from '@/lib/auth/roles'
import Link from 'next/link'

export default async function BookingPage(props: { searchParams: Promise<{ location?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()

  // Resolve business: owner first, then employee (barbero) fallback
  let business: { id: string; slug: string; timezone: string; min_advance_minutes?: number | null; booking_lead_time_enabled?: boolean | null } | null = null

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, slug, timezone, min_advance_minutes, booking_lead_time_enabled')
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (owned) {
    business = owned as typeof business
  } else {
    const { data: empBiz } = await supabase
      .from('employees')
      .select('business_id, businesses!inner(id, slug, timezone, min_advance_minutes, booking_lead_time_enabled)')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (empBiz?.businesses) {
      business = empBiz.businesses as unknown as typeof business
    }
  }

  if (!business) return null

  // Resolve role to apply barber scope
  let role: string | null = null
  try {
    role = await getUserRole(supabase as unknown as { from: (t: string) => unknown }, user!.id, business.id)
  } catch {
    role = null
  }
  const isBarbero = role === 'barbero'

  let barberEmployeeId: string | null = null
  if (isBarbero) {
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user!.id)
      .eq('business_id', business.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    barberEmployeeId = (emp as { id: string } | null)?.id ?? null
  }

  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay() + 1)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const selectedLocation = searchParams.location ?? null

  // Fetch base data
  let appointmentsQuery = supabase
    .from('appointments')
    .select('id, starts_at, ends_at, status, source, notes, location_id, clients(id, name), employees(id, name), services(id, name, price)')
    .eq('business_id', business.id)
    .gte('starts_at', weekStart.toISOString())
    .lt('starts_at', weekEnd.toISOString())
    .order('starts_at')

  if (isBarbero && barberEmployeeId) {
    appointmentsQuery = appointmentsQuery.eq('employee_id', barberEmployeeId)
  }
  if (selectedLocation) {
    appointmentsQuery = appointmentsQuery.eq('location_id', selectedLocation) as typeof appointmentsQuery
  }

  let employeesQuery = supabase
    .from('employees')
    .select('id, name, location_id')
    .eq('business_id', business.id)
    .eq('is_active', true)
  if (selectedLocation) employeesQuery = employeesQuery.eq('location_id', selectedLocation) as typeof employeesQuery

  if (isBarbero && barberEmployeeId) {
    employeesQuery = employeesQuery.eq('id', barberEmployeeId)
  }

  let servicesQuery = supabase
    .from('services')
    .select('id, name, duration_min, price, location_id')
    .eq('business_id', business.id)
    .eq('is_active', true)
  if (selectedLocation) servicesQuery = servicesQuery.or(`location_id.eq.${selectedLocation},location_id.is.null`) as typeof servicesQuery

  let servicesData: { id: string; name: string; duration_min: number; price: number }[] | null = null
  let employeeServicesIds: string[] | null = null

  if (isBarbero && barberEmployeeId) {
    const { data: empServices } = await supabase
      .from('employee_services')
      .select('service_id')
      .eq('employee_id', barberEmployeeId)
    employeeServicesIds = (empServices as { service_id: string }[] | null)?.map((r) => r.service_id) ?? []
    if (employeeServicesIds.length > 0) {
      servicesQuery = servicesQuery.in('id', employeeServicesIds)
    } else {
      // Barbero with no assigned services → empty catalog
      servicesQuery = servicesQuery.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const todayStr = today.toISOString().slice(0, 10)
  const nextMonthStr = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().slice(0, 10)
  const [{ data: appointments }, { data: employees }, { data: services }, { data: clients }, { data: businessHours }, { data: locations }, { data: holidays }] =
    await Promise.all([
      appointmentsQuery as unknown as Promise<{ data: typeof appointments }>,
      employeesQuery as unknown as Promise<{ data: typeof employees }>,
      servicesQuery,
      supabase
        .from('clients')
        .select('id, name, phone')
        .eq('business_id', business.id)
        .order('name')
        .limit(200),
      supabase
        .from('business_hours')
        .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
        .eq('business_id', business.id),
      supabase.from('locations').select('id, name').eq('business_id', business.id).order('name'),
      supabase.from('holidays').select('id, business_id, location_id, date, reason, is_open').eq('business_id', business.id).gte('date', todayStr).lte('date', nextMonthStr).order('date'),
    ])

  return (
    <>
      <Header title="Booking" />
      {(locations?.length ?? 0) > 1 && !isBarbero && (
        <div className="px-6 pt-3 flex gap-2 text-xs">
          <Link href="/booking" className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}>Todas</Link>
          {locations!.map((l) => (
            <Link key={l.id} href={`/booking?location=${l.id}`} className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}>{l.name}</Link>
          ))}
        </div>
      )}
      <BookingCalendar
        businessId={business.id}
        slug={business.slug}
        timezone={business.timezone}
        appointments={appointments ?? []}
        employees={employees ?? []}
        services={services ?? []}
        clients={clients ?? []}
        businessHours={businessHours ?? []}
        holidays={holidays ?? []}
        locations={locations ?? []}
        selectedLocation={selectedLocation}
        minAdvanceMinutes={(business as { min_advance_minutes?: number | null })?.min_advance_minutes ?? DEFAULT_LEAD_MINUTES}
        bookingLeadTimeEnabled={(business as { booking_lead_time_enabled?: boolean | null })?.booking_lead_time_enabled ?? true}
        isBarbero={isBarbero}
        currentEmployeeId={barberEmployeeId}
      />
    </>
  )
}
