import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { BookingCalendar } from './booking-calendar'
import { getAuthUser } from '@/lib/auth-user'
import { DEFAULT_LEAD_MINUTES } from '@/lib/booking-availability'
import { getUserRole } from '@/lib/auth/roles'
import { db } from '@/lib/db'
import { businesses, employees, services, clients, businessHours, locations, holidays, appointments, employeeServices } from '@/drizzle/schema'
import { eq, and, gte, lt, asc, or, isNull, inArray } from 'drizzle-orm'
import Link from 'next/link'

export default async function BookingPage(props: { searchParams: Promise<{ location?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()

  // Drizzle: resolve business (owner first, then employee fallback) — portable
  let business: { id: string; slug: string; timezone: string; min_advance_minutes?: number | null; booking_lead_time_enabled?: boolean | null } | null = null

  const owned = await db.query.businesses.findFirst({
    where: eq(businesses.ownerId, user!.id),
    columns: { id: true, slug: true, timezone: true, minAdvanceMinutes: true, bookingLeadTimeEnabled: true },
  })
  if (owned) {
    business = {
      id: owned.id,
      slug: owned.slug,
      timezone: owned.timezone,
      min_advance_minutes: (owned as unknown as { minAdvanceMinutes: number | null }).minAdvanceMinutes,
      booking_lead_time_enabled: (owned as unknown as { bookingLeadTimeEnabled: boolean | null }).bookingLeadTimeEnabled,
    }
  } else {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.userId, user!.id), eq(employees.isActive, true)),
      with: { business: { columns: { id: true, slug: true, timezone: true, minAdvanceMinutes: true, bookingLeadTimeEnabled: true } } },
    }) as unknown as { business: { id: string; slug: string; timezone: string; minAdvanceMinutes: number | null; bookingLeadTimeEnabled: boolean | null } } | undefined
    if (emp?.business) {
      business = {
        id: emp.business.id,
        slug: emp.business.slug,
        timezone: emp.business.timezone,
        min_advance_minutes: emp.business.minAdvanceMinutes,
        booking_lead_time_enabled: emp.business.bookingLeadTimeEnabled,
      }
    }
  }

  if (!business) return null

  let role: string | null = null
  try {
    role = await getUserRole(supabase as unknown as { from: (t: string) => unknown }, user!.id, business.id)
  } catch {
    role = null
  }
  const isBarbero = role === 'barbero'

  let barberEmployeeId: string | null = null
  if (isBarbero) {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.userId, user!.id), eq(employees.businessId, business.id), eq(employees.isActive, true)),
      columns: { id: true },
    })
    barberEmployeeId = emp?.id ?? null
  }

  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay() + 1)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const selectedLocation = searchParams.location ?? null

  // Drizzle fetches — all RLS via business_id tenant filter, portable to Postgres/MySQL/SQLite
  const todayStr = today.toISOString().slice(0, 10)
  const nextMonthStr = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().slice(0, 10)

  // Pre-fetch employeeServices for barbero scope
  let employeeServiceIds: string[] | null = null
  if (isBarbero && barberEmployeeId) {
    const empServices = await db.query.employeeServices.findMany({
      where: eq(employeeServices.employeeId, barberEmployeeId),
      columns: { serviceId: true },
    })
    employeeServiceIds = empServices.map((r) => r.serviceId)
  }

  const [appointmentsData, employeesData, servicesData, clientsData, businessHoursData, locationsData, holidaysData] = await Promise.all([
    // Appointments in week window with relations
    db.query.appointments.findMany({
      where: and(
        eq(appointments.businessId, business.id),
        gte(appointments.startsAt, weekStart.toISOString() as unknown as string),
        lt(appointments.startsAt, weekEnd.toISOString() as unknown as string),
        ...(isBarbero && barberEmployeeId ? [eq(appointments.employeeId, barberEmployeeId)] : []),
        ...(selectedLocation ? [eq(appointments.locationId, selectedLocation)] : []),
      ),
      orderBy: (a, { asc }) => [asc(a.startsAt)],
      with: {
        client: { columns: { id: true, name: true } },
        employee: { columns: { id: true, name: true } },
        service: { columns: { id: true, name: true, price: true } },
      },
    }),
    // Employees
    db.query.employees.findMany({
      where: and(
        eq(employees.businessId, business.id),
        eq(employees.isActive, true),
        ...(selectedLocation ? [eq(employees.locationId, selectedLocation)] : []),
        ...(isBarbero && barberEmployeeId ? [eq(employees.id, barberEmployeeId)] : []),
      ),
      columns: { id: true, name: true, locationId: true },
    }),
    // Services (with location and barbero scope)
    (async () => {
      if (isBarbero && barberEmployeeId && employeeServiceIds !== null) {
        if (employeeServiceIds.length === 0) return []
        const base = await db.query.services.findMany({
          where: and(
            eq(services.businessId, business.id),
            eq(services.isActive, true),
            inArray(services.id, employeeServiceIds),
            ...(selectedLocation ? [or(eq(services.locationId, selectedLocation), isNull(services.locationId)) as unknown as ReturnType<typeof eq>] : []),
          ),
          columns: { id: true, name: true, durationMin: true, price: true, locationId: true },
        })
        return base
      }
      return db.query.services.findMany({
        where: and(
          eq(services.businessId, business.id),
          eq(services.isActive, true),
          ...(selectedLocation ? [or(eq(services.locationId, selectedLocation), isNull(services.locationId)) as unknown as ReturnType<typeof eq>] : []),
        ),
        columns: { id: true, name: true, durationMin: true, price: true, locationId: true },
      })
    })(),
    db.query.clients.findMany({
      where: eq(clients.businessId, business.id),
      orderBy: (c, { asc }) => [asc(c.name)],
      limit: 200,
      columns: { id: true, name: true, phone: true },
    }),
    db.query.businessHours.findMany({
      where: eq(businessHours.businessId, business.id),
      columns: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, breakStart: true, breakEnd: true },
    }),
    db.query.locations.findMany({
      where: eq(locations.businessId, business.id),
      orderBy: (l, { asc }) => [asc(l.name)],
      columns: { id: true, name: true },
    }),
    db.query.holidays.findMany({
      where: and(eq(holidays.businessId, business.id), gte(holidays.date, todayStr as unknown as string), lt(holidays.date, nextMonthStr as unknown as string)),
      orderBy: (h, { asc }) => [asc(h.date)],
    }),
  ])

  // Map Drizzle camelCase to snake_case expected by BookingCalendar (keep compat)
  const appointmentsForCalendar = appointmentsData.map((a) => ({
    id: a.id,
    starts_at: a.startsAt as unknown as string,
    ends_at: a.endsAt as unknown as string,
    status: a.status,
    source: a.source,
    notes: a.notes,
    location_id: a.locationId,
    clients: a.client ? { id: a.client.id, name: a.client.name } : null,
    employees: a.employee ? { id: a.employee.id, name: a.employee.name } : null,
    services: a.service ? { id: a.service.id, name: a.service.name, price: a.service.price } : null,
  }))
  const employeesForCalendar = employeesData.map((e) => ({ id: e.id, name: e.name, location_id: e.locationId }))
  const servicesForCalendar = servicesData.map((s) => ({
    id: s.id,
    name: s.name,
    duration_min: s.durationMin,
    price: Number(s.price),
    location_id: s.locationId,
  }))
  const clientsForCalendar = clientsData.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))
  const businessHoursForCalendar = businessHoursData.map((h) => ({
    day_of_week: h.dayOfWeek,
    is_open: h.isOpen,
    open_time: h.openTime,
    close_time: h.closeTime,
    break_start: h.breakStart,
    break_end: h.breakEnd,
  }))
  const holidaysForCalendar = holidaysData.map((h) => ({
    id: h.id,
    business_id: h.businessId,
    location_id: h.locationId,
    date: h.date as unknown as string,
    reason: h.reason,
    is_open: h.isOpen,
  }))

  return (
    <>
      <Header title="Booking" />
      {(locationsData?.length ?? 0) > 1 && !isBarbero && (
        <div className="px-6 pt-3 flex gap-2 text-xs">
          <Link href="/booking" className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}>
            Todas
          </Link>
          {locationsData!.map((l) => (
            <Link key={l.id} href={`/booking?location=${l.id}`} className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}>
              {l.name}
            </Link>
          ))}
        </div>
      )}
      <BookingCalendar
        businessId={business.id}
        slug={business.slug}
        timezone={business.timezone}
        appointments={appointmentsForCalendar as unknown as []}
        employees={employeesForCalendar as unknown as []}
        services={servicesForCalendar as unknown as []}
        clients={clientsForCalendar as unknown as []}
        businessHours={businessHoursForCalendar as unknown as []}
        holidays={holidaysForCalendar as unknown as []}
        locations={locationsData as unknown as []}
        selectedLocation={selectedLocation}
        minAdvanceMinutes={(business as { min_advance_minutes?: number | null })?.min_advance_minutes ?? DEFAULT_LEAD_MINUTES}
        bookingLeadTimeEnabled={(business as { booking_lead_time_enabled?: boolean | null })?.booking_lead_time_enabled ?? true}
        isBarbero={isBarbero}
        currentEmployeeId={barberEmployeeId}
      />
    </>
  )
}
