'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, uses12HourClock } from '@/lib/utils'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { buildGCalUrl } from '@/lib/gcal'
import { DatePicker } from '@/components/ui/date-picker'
import { useTranslations } from 'next-intl'
import {
  computeEffectiveHours,
  type DayHours,
  todayInBusinessTz as todayInBusinessTzLib,
  nowMinutesInBusinessTz as nowMinutesInBusinessTzLib,
  isTooSoonMinutes,
  DEFAULT_LEAD_MINUTES,
} from '@/lib/booking-availability'

interface Service {
  id: string
  name: string
  description: string | null
  price: number
  duration_min: number
  category: string | null
  capacity: number
  location_id?: string | null
}
interface Employee {
  id: string
  name: string
  location_id?: string | null
}
interface Location {
  id: string
  name: string
  slug: string
}
interface Business {
  id: string
  name: string
  currency: string
  slug: string
  timezone: string | null
  address?: string | null
  min_advance_minutes?: number | null
  booking_lead_time_enabled?: boolean | null
  allow_guest_bookings?: boolean | null
}

interface Props {
  business: Business
  services: Service[]
  employees: Employee[]
  workingHours: DayHours[]
  locations?: Location[]
  telegramBotUsername: string | null
  viberBotUri: string | null
  initialServiceId?: string | null
  initialEmployeeId?: string | null
  theme?: 'default' | 'escuderia'
}

type Step = 'service' | 'employee' | 'datetime' | 'contact' | 'done'

function generateSlots(openTime: string, closeTime: string, durationMin: number): string[] {
  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  const start = oh * 60 + om
  const end = ch * 60 + cm
  const slots: string[] = []
  let cur = start
  while (cur + durationMin <= end) {
    slots.push(
      `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`,
    )
    cur += durationMin
  }
  return slots
}

// Memoized slot generation — pure computation keyed on open/close/duration, avoids
// re-allocating the same slot array on every render (Lighthouse ≥90, T079).
const slotCache = new Map<string, string[]>()
function generateSlotsMemo(openTime: string, closeTime: string, durationMin: number): string[] {
  const key = `${openTime}-${closeTime}-${durationMin}`
  const hit = slotCache.get(key)
  if (hit) return hit
  const slots = generateSlots(openTime, closeTime, durationMin)
  slotCache.set(key, slots)
  return slots
}

// ─── Shared style atoms ───────────────────────────────────────────────────────
function getBaseCard(theme: string): React.CSSProperties {
  return {
    background: theme === 'escuderia' ? '#121212' : 'white',
    border: theme === 'escuderia' ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8',
    borderRadius: theme === 'escuderia' ? 0 : 12,
    padding: '14px 16px',
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  }
}

function StepBadge({ label, theme }: { label: string; theme?: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: theme === 'escuderia' ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)',
        color: theme === 'escuderia' ? '#C5A059' : 'var(--brand)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        padding: '3px 10px',
        borderRadius: theme === 'escuderia' ? 0 : 20,
        marginBottom: 10,
      }}
    >
      {label.toUpperCase()}
    </span>
  )
}

function SectionTitle({ text, theme }: { text: string; theme?: string }) {
  return (
    <h2
      style={{
        fontSize: 17,
        fontWeight: 500,
        color: theme === 'escuderia' ? '#e5e2e1' : '#2D2926',
        marginBottom: 14,
        marginTop: 0,
        fontFamily: theme === 'escuderia' ? 'var(--font-playfair)' : undefined,
      }}
    >
      {text}
    </h2>
  )
}

function BackLink({
  label,
  onClick,
  theme,
}: {
  label: string
  onClick: () => void
  theme?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 13,
        color: theme === 'escuderia' ? '#8E795E' : '#9A8E85',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginBottom: 16,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {label}
    </button>
  )
}

function CtaButton({
  label,
  onClick,
  disabled,
  theme,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  theme?: string
}) {
  const isEsc = theme === 'escuderia'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? (isEsc ? '#353534' : '#C4BAB3') : isEsc ? '#C5A059' : 'var(--brand)',
        color: disabled ? (isEsc ? '#8E795E' : 'white') : isEsc ? '#000' : 'white',
        border: isEsc ? '1px solid #C5A059' : 'none',
        borderRadius: isEsc ? 0 : 10,
        padding: '13px 20px',
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: isEsc ? '0.1em' : undefined,
        width: '100%',
        marginTop: 16,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function PublicBookingForm({
  business,
  services,
  employees,
  workingHours,
  locations = [],
  telegramBotUsername,
  viberBotUri,
  initialServiceId,
  initialEmployeeId,
  theme = 'default',
}: Props) {
  const supabase = createClient()
  const t = useTranslations('publicBooking')
  const [authUser, setAuthUser] = useState<{ id: string; email?: string | null } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const isEsc = theme === 'escuderia'
  const baseCard = getBaseCard(theme)

  const initialSvc = initialServiceId
    ? (services.find((s) => s.id === initialServiceId) ?? null)
    : null
  // hasEmployeeStep evaluated after visibleEmployees (location-aware)
  const [step, setStep] = useState<Step>(
    initialSvc ? (employees.length > 1 ? 'employee' : 'datetime') : 'service',
  )
  const [selectedService, setSelectedService] = useState<Service | null>(initialSvc)
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployeeId ?? '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  // Multi-sede: location selector (V1 nullable — when missing show all, single-sede hides)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  // US5 loyalty fields
  const [promoCode, setPromoCode] = useState('')
  const [loyaltyPoints, setLoyaltyPoints] = useState('')
  const [membershipId, setMembershipId] = useState('')
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null)
  const [membershipOptions, setMembershipOptions] = useState<
    { id: string; name: string; remaining: number; expires_at: string }[]
  >([])
  const [saving, setSaving] = useState(false)
  const [slotTakenError, setSlotTakenError] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientHasTelegram, setClientHasTelegram] = useState(false)

  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotSpotsLeft, setSlotSpotsLeft] = useState<Record<string, number>>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [dayClosed, setDayClosed] = useState(false)
  // US7 holidays (picker disable + slot filter)
  const [holidayDates, setHolidayDates] = useState<string[]>([])
  const [holidaysForLocation, setHolidaysForLocation] = useState<
    { date: string; location_id: string | null; is_open: boolean }[]
  >([])
  const [waitlistJoinLoading, setWaitlistJoinLoading] = useState(false)
  const [waitlistJoined, setWaitlistJoined] = useState(false)

  const effectiveHours: DayHours[] = useMemo(
    () => computeEffectiveHours(workingHours),
    [workingHours],
  )

  // Multi-sede filtered catalogs (nullable location_id = visible for any location) — memoized for 375px perf
  const visibleServices = useMemo(
    () =>
      selectedLocation
        ? services.filter((s) => !s.location_id || s.location_id === selectedLocation)
        : services,
    [services, selectedLocation],
  )
  const visibleEmployees = useMemo(
    () =>
      selectedLocation
        ? employees.filter((e) => !e.location_id || e.location_id === selectedLocation)
        : employees,
    [employees, selectedLocation],
  )
  const hasMultipleLocations = locations.length > 1
  const hasEmployeeStep = visibleEmployees.length > 1

  const closedWeekdays = effectiveHours.filter((h) => !h.is_open).map((h) => h.day_of_week)
  // Configurable lead time (054) — defaults keep previous behavior when DB column missing
  const minAdvance = business.min_advance_minutes ?? DEFAULT_LEAD_MINUTES
  const leadEnabled = business.booking_lead_time_enabled ?? true
  const allowGuestBookings = business.allow_guest_bookings ?? true
  // Helpers synchronized with business.timezone (not browser local) via lib/booking-availability (no hardcodes)
  function todayInBusinessTz(): string {
    return todayInBusinessTzLib(business.timezone ?? 'UTC', new Date())
  }
  function nowMinutesInBusinessTz(): number {
    return nowMinutesInBusinessTzLib(business.timezone ?? 'UTC', new Date())
  }
  // Hydration-safe: server UTC date may differ from client business TZ date. Use '' fallback then hydrate.
  const [today, setToday] = useState('')
  useEffect(() => {
    setToday(todayInBusinessTz())
  }, [])

  // US7: fetch holidays for business and respect location_id if multi-sede
  useEffect(() => {
    let cancelled = false
    async function fetchHolidays() {
      try {
        const url = selectedLocation
          ? `/api/holidays?business_id=${business.id}&location_id=${selectedLocation}`
          : `/api/holidays?business_id=${business.id}`
        const res = await fetch(url)
        if (!res.ok) return
        const data = (await res.json()) as {
          date: string
          is_open: boolean
          location_id: string | null
        }[]
        if (cancelled) return
        const closed = data.filter((h) => h.is_open === false)
        setHolidaysForLocation(closed)
        setHolidayDates(closed.map((h) => h.date.slice(0, 10)))
      } catch {}
    }
    fetchHolidays()
    return () => {
      cancelled = true
    }
  }, [business.id, selectedLocation])

  // US7 waitlist helper: join waitlist for desired date+time
  async function joinWaitlist() {
    if (!selectedService || !date || !contact.name) {
      setBookingError('Completá nombre y elegí fecha/horario para unirte a la lista')
      return
    }
    if (!contact.phone && !contact.email) {
      setBookingError('Dejá teléfono o email para que te avisemos')
      return
    }
    setWaitlistJoinLoading(true)
    setBookingError(null)
    try {
      // First ensure client exists via /api/book flow? We can call /api/waitlist directly which will validate client_id.
      // For public we don't have client_id yet — we need to create/fetch client via supabase directly (public read)
      // Simplified: call /api/book first to get clientId, but that would attempt booking. Instead we use service client via anon?
      // MVP: try to fetch/create client via supabase client then enqueue
      let cid: string | null = clientId
      if (!cid) {
        // Try to find or create client via supabase (RLS allows anon insert? Use service via API)
        // We fallback to using a temp fetch to /api/clients/import? No, we simulate by calling waitlist with client creation via API guest?
        // For now, try to upsert client via supabase directly (anon may be allowed)
        const { data: existing } = await supabase
          .from('clients')
          .select('id')
          .eq('business_id', business.id)
          .or(`phone.eq.${contact.phone},email.eq.${contact.email}`)
          .maybeSingle()
        if (existing) cid = (existing as { id: string }).id
        else {
          const { data: newClient } = await supabase
            .from('clients')
            .insert({
              business_id: business.id,
              name: contact.name,
              phone: contact.phone || null,
              email: contact.email || null,
            })
            .select('id')
            .single()
          if (newClient) cid = (newClient as { id: string }).id
        }
      }
      if (!cid) throw new Error('No se pudo crear cliente')
      const desiredTime = time || '10:00'
      const tz = business.timezone ?? 'America/Bogota'
      const { parseDateTimeInTz } = await import('@/lib/booking-availability')
      const desiredAt = parseDateTimeInTz(date, desiredTime, tz).toISOString()
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          location_id: selectedLocation || null,
          service_id: selectedService.id,
          employee_id: selectedEmployee || null,
          client_id: cid,
          desired_at: desiredAt,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`)
      setWaitlistJoined(true)
      setBookingError(null)
    } catch (e) {
      setBookingError(String((e as Error).message))
    } finally {
      setWaitlistJoinLoading(false)
    }
  }

  // Detect logged-in client for guest guard (057)
  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (cancelled) return
        if (user) {
          setAuthUser({ id: user.id, email: user.email })
          // Prefill contact from auth + linked client record
          const { data: linkedClient } = await supabase
            .from('clients')
            .select('name, phone, email')
            .eq('business_id', business.id)
            .eq('user_id', user.id)
            .maybeSingle()
          if (cancelled) return
          if (linkedClient) {
            setContact((prev) => ({
              name:
                linkedClient.name ??
                prev.name ??
                ((user.user_metadata as Record<string, unknown>)?.name as string) ??
                user.email?.split('@')[0] ??
                '',
              phone: linkedClient.phone ?? prev.phone ?? user.phone ?? '',
              email: linkedClient.email ?? prev.email ?? user.email ?? '',
            }))
          } else {
            setContact((prev) => ({
              name:
                prev.name ||
                ((user.user_metadata as Record<string, unknown>)?.name as string) ||
                user.email?.split('@')[0] ||
                '',
              phone: prev.phone || (user.phone ?? ''),
              email: prev.email || user.email || '',
            }))
          }
        } else {
          setAuthUser(null)
        }
      } catch {
        setAuthUser(null)
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    }
    checkAuth()
    return () => {
      cancelled = true
    }
  }, [business.id])

  useEffect(() => {
    if (!date || !selectedService) {
      setAvailableSlots([])
      setDayClosed(false)
      return
    }
    loadSlots(date, selectedService, selectedEmployee)
  }, [date, selectedService, selectedEmployee])

  async function loadSlots(selectedDate: string, svc: Service, employeeId: string) {
    setLoadingSlots(true)
    setDayClosed(false)
    setAvailableSlots([])
    setTime('')

    // US7 holiday check: if date is holiday (is_open=false) then dayClosed with holiday reason
    if (holidayDates.includes(selectedDate)) {
      setDayClosed(true)
      setLoadingSlots(false)
      return
    }

    const dow = new Date(selectedDate + 'T00:00:00').getDay()
    const dayHours = effectiveHours.find((h) => h.day_of_week === dow)

    if (!dayHours || !dayHours.is_open) {
      setDayClosed(true)
      setLoadingSlots(false)
      return
    }

    let slots = generateSlotsMemo(dayHours.open_time, dayHours.close_time, svc.duration_min)

    if (dayHours.break_start && dayHours.break_end) {
      const [brh, brm] = dayHours.break_start.split(':').map(Number)
      const [beh, bem] = dayHours.break_end.split(':').map(Number)
      const breakStartMin = brh * 60 + brm
      const breakEndMin = beh * 60 + bem
      slots = slots.filter((slot) => {
        const [sh, sm] = slot.split(':').map(Number)
        const slotStartMin = sh * 60 + sm
        const slotEndMin = slotStartMin + svc.duration_min
        return !(slotStartMin < breakEndMin && slotEndMin > breakStartMin)
      })
    }

    if (selectedDate === today) {
      const nowMin = nowMinutesInBusinessTz()
      slots = slots.filter((slot) => {
        const [sh, sm] = slot.split(':').map(Number)
        const slotMin = sh * 60 + sm
        if (slotMin <= nowMin) return false
        if (isTooSoonMinutes(slotMin, nowMin, minAdvance, leadEnabled)) return false
        return true
      })
    }

    const capacity = svc.capacity ?? 1
    const spotsMap: Record<string, number> = {}

    try {
      const { data: booked } = await supabase.rpc('get_booked_slots', {
        p_business_id: business.id,
        p_date: selectedDate,
        p_employee_id: capacity > 1 ? null : employeeId || null,
      })

      slots = slots.filter((slot) => {
        const [sh, sm] = slot.split(':').map(Number)
        const slotStartMin = sh * 60 + sm
        const slotEndMin = slotStartMin + svc.duration_min

        const bookedCount = (booked ?? []).filter(
          ({ starts_at, ends_at }: { starts_at: string; ends_at: string }) => {
            const toBusinessMin = (iso: string) => {
              const tz = business.timezone ?? 'UTC'
              const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).formatToParts(new Date(iso))
              const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0')
              const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0')
              return (h % 24) * 60 + m
            }
            const bStartMin = toBusinessMin(starts_at)
            const bEndMin = toBusinessMin(ends_at)
            return slotStartMin < bEndMin && slotEndMin > bStartMin
          },
        ).length

        const spotsLeft = capacity - bookedCount
        if (spotsLeft > 0) {
          spotsMap[slot] = spotsLeft
          return true
        }
        return false
      })
    } catch {
      slots.forEach((slot) => {
        spotsMap[slot] = capacity
      })
    }

    setAvailableSlots(slots)
    setSlotSpotsLeft(spotsMap)
    setLoadingSlots(false)
  }

  async function submit() {
    if (!selectedService || !date || !time || !contact.name) return
    if (!contact.phone && !contact.email) {
      setBookingError(
        'Please enter at least a phone number or email so we can confirm your booking.',
      )
      return
    }
    if (contact.phone && !/^[\d\s\+\-\(\)\.]{7,}$/.test(contact.phone)) {
      setBookingError('Please enter a valid phone number (digits only, e.g. +1 234 567 8900).')
      return
    }
    if (contact.email && !contact.email.includes('@')) {
      setBookingError('Please enter a valid email address (e.g. name@example.com).')
      return
    }
    // Past / lead-time validation synchronized with /api/book (business timezone)
    if (date < today) {
      setBookingError('No se puede reservar en el pasado. Elegí una fecha futura.')
      return
    }
    if (date === today) {
      const nowMin = nowMinutesInBusinessTz()
      const [sh, sm] = time.split(':').map(Number)
      const slotMin = sh * 60 + sm
      if (slotMin <= nowMin) {
        setBookingError('No se puede reservar en el pasado. Elegí un horario futuro.')
        return
      }
      if (isTooSoonMinutes(slotMin, nowMin, minAdvance, leadEnabled)) {
        setBookingError(`Reservá con al menos ${minAdvance} minutos de anticipación.`)
        return
      }
    }
    setSaving(true)
    setSlotTakenError(false)
    setBookingError(null)

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          serviceId: selectedService.id,
          employeeId: selectedEmployee || null,
          location_id: selectedLocation || null,
          date,
          time,
          name: contact.name,
          phone: contact.phone || null,
          email: contact.email || null,
          promo_code: promoCode.trim() || null,
          loyalty_redeem_points: loyaltyPoints ? Number(loyaltyPoints) : null,
          membership_id: membershipId || null,
        }),
      })

      if (res.status === 409) {
        setSaving(false)
        const body = await res.json().catch(() => null)
        if (body?.error === 'no_staff_available') {
          setBookingError(t('noStaffAvailable'))
          return
        }
        if (
          body?.error === 'promo_stack_guard' ||
          body?.error === 'membership_expired' ||
          body?.error === 'no_uses_left' ||
          body?.error === 'promo_not_eligible' ||
          body?.error === 'insufficient_points' ||
          body?.error === 'promo_not_found' ||
          body?.error === 'membership_not_found'
        ) {
          setBookingError(body.message ?? body.error ?? 'Beneficio no válido')
          return
        }
        setSlotTakenError(true)
        setTime('')
        setStep('datetime')
        if (selectedService) loadSlots(date, selectedService, selectedEmployee)
        return
      }

      if (res.status === 401) {
        setSaving(false)
        const body = await res.json().catch(() => null)
        if (body?.error === 'guest_not_allowed') {
          setBookingError(body.message ?? 'Debes registrarte para reservar en este negocio')
          return
        }
        setBookingError('Debes iniciar sesión para reservar.')
        return
      }

      if (res.status === 429) {
        setSaving(false)
        setBookingError('Too many booking attempts. Please wait a few minutes and try again.')
        return
      }

      if (res.status === 400) {
        setSaving(false)
        const body = await res.json().catch(() => null)
        if (body?.error === 'in_past') {
          setBookingError('No se puede reservar en el pasado. Elegí una fecha y hora futuras.')
          return
        }
        if (body?.error === 'too_soon') {
          setBookingError(
            body.message ?? `Reservá con al menos ${minAdvance} minutos de anticipación.`,
          )
          return
        }
      }

      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()
      setClientId(data.clientId ?? null)
      setClientHasTelegram(data.hasTelegram ?? false)
      setStep('done')
      setSaving(false)
    } catch {
      setSaving(false)
      setBookingError('Something went wrong. Please try again or contact the business directly.')
    }
  }

  function handleSelectService(s: Service) {
    setSelectedService(s)
    setStep(hasEmployeeStep ? 'employee' : 'datetime')
  }

  function handleSelectEmployee(employeeId: string) {
    setSelectedEmployee(employeeId)
    setStep('datetime')
  }

  function handleBackFromEmployee() {
    setStep('service')
  }
  function handleBackFromDatetime() {
    setStep(hasEmployeeStep ? 'employee' : 'service')
  }

  function resetAll() {
    setStep('service')
    setSelectedService(null)
    setSelectedEmployee('')
    setDate('')
    setTime('')
    setContact({ name: '', phone: '', email: '' })
    setPromoCode('')
    setLoyaltyPoints('')
    setMembershipId('')
    setAvailableSlots([])
    setClientId(null)
    setClientHasTelegram(false)
    setBookingError(null)
  }

  // Hydration-safe locale: server always 'en-US', client detects navigator.language after mount
  const [locale, setLocale] = useState('en-US')
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setLocale(navigator.language)
    setMounted(true)
  }, [])
  const is12h = uses12HourClock(mounted ? locale : 'en-US')

  function formatSlot(slot: string): string {
    const [h, m] = slot.split(':').map(Number)
    // While not mounted locale is 'en-US' on both server and client, so no mismatch
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: is12h,
    }).format(new Date(2000, 0, 1, h, m))
  }

  const selectedEmployeeObj = employees.find((e) => e.id === selectedEmployee) ?? null

  // ─── Done screen ──────────────────────────────────────────────────────────
  if (step === 'done') {
    const telegramLink =
      telegramBotUsername && clientId
        ? `https://t.me/${telegramBotUsername}?start=client_${clientId}`
        : null
    const viberLink =
      viberBotUri && clientId
        ? `viber://pa?chatURI=${viberBotUri}&context=client_${clientId}`
        : null

    const doneBg = isEsc ? '#121212' : 'white'
    const doneBorder = isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8'
    const doneRadius = isEsc ? 0 : 16
    const textPrimary = isEsc ? '#e5e2e1' : '#2D2926'
    const textMuted = isEsc ? '#d0c5b9' : '#9A8E85'

    return (
      <div
        style={{
          background: doneBg,
          border: doneBorder,
          borderRadius: doneRadius,
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          style={{ margin: '0 auto 16px', display: 'block' }}
        >
          <circle
            cx="28"
            cy="28"
            r="27"
            stroke={isEsc ? '#C5A059' : 'var(--brand)'}
            strokeWidth="2"
            fill={isEsc ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)'}
          />
          <path
            d="M17 28L24 35L39 20"
            stroke={isEsc ? '#C5A059' : 'var(--brand)'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 500,
            color: textPrimary,
            margin: '0 0 8px',
            fontFamily: isEsc ? 'var(--font-playfair)' : undefined,
          }}
        >
          {t('success.heading')}
        </h2>
        <p style={{ fontSize: 14, color: textMuted, margin: '0 0 4px' }}>
          {selectedService?.name} · {date} at {time ? formatSlot(time) : ''}
          {selectedEmployeeObj && ` · ${selectedEmployeeObj.name}`}
        </p>
        <p style={{ fontSize: 14, color: textMuted, margin: '0 0 24px' }}>{t('success.body')}</p>

        {/* Messenger opt-in — hidden if client already has Telegram connected */}
        {!clientHasTelegram && (telegramLink || viberLink) && (
          <div
            style={{
              border: '0.5px solid #E8E0D8',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              textAlign: 'left',
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 500, color: '#2D2926', margin: '0 0 4px' }}>
              {t('success.optInHeading')}
            </p>
            <p style={{ fontSize: 12, color: '#9A8E85', margin: '0 0 12px' }}>
              {t('success.optInSub')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {telegramLink && (
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'var(--brand)',
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 500,
                    padding: '11px 16px',
                    borderRadius: 10,
                    textDecoration: 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" />
                  </svg>
                  {t('success.telegramButton')}
                </a>
              )}
              {viberLink && (
                <a
                  href={viberLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'var(--brand)',
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 500,
                    padding: '11px 16px',
                    borderRadius: 10,
                    textDecoration: 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.983.02C8.764.02 3.14 1.016.824 7.236c-.9 2.38-.9 4.944-.9 6.764v.02c0 2.62.44 5.04 1.72 6.72C2.9 22.22 4.74 23 7.4 23h.12c.6 0 1.2-.08 1.68-.28.08-.04.12-.12.12-.2v-2.16c0-.12-.08-.2-.2-.2-.04 0-.12 0-.16.04-.64.28-1.28.36-1.96.36-1.88 0-3.04-.6-3.72-1.84-.6-1.12-.76-2.6-.76-4.36v-.02c0-1.6.04-3.88.72-5.84 1.84-5.08 6.56-5.76 8.76-5.76h.04c2.2 0 6.92.68 8.76 5.76.68 1.96.72 4.24.72 5.84v.02c0 1.76-.16 3.24-.76 4.36-.68 1.24-1.84 1.84-3.72 1.84-.68 0-1.32-.08-1.96-.36-.04-.04-.12-.04-.16-.04-.12 0-.2.08-.2.2v2.16c0 .08.04.16.12.2.48.2 1.08.28 1.68.28h.12c2.66 0 4.5-.78 5.76-2.26 1.28-1.68 1.72-4.1 1.72-6.72v-.02c0-1.82 0-4.38-.9-6.76C20.86 1.016 15.224.02 12.004.02h-.02z" />
                  </svg>
                  {t('success.viberButton')}
                </a>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            href={buildGCalUrl({
              businessName: business.name,
              serviceName: selectedService?.name ?? '',
              employeeName: selectedEmployeeObj?.name,
              date,
              time: time ?? '',
              durationMin: selectedService?.duration_min ?? 60,
              timezone: business.timezone,
              address: business.address,
            })}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'white',
              border: '0.5px solid #E8E0D8',
              borderRadius: 10,
              padding: '11px 20px',
              fontSize: 14,
              color: '#2D2926',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <CalendarPlus style={{ width: 16, height: 16 }} />
            Add to Google Calendar
          </a>
          <button
            onClick={resetAll}
            style={{
              background: 'white',
              border: '0.5px solid #E8E0D8',
              borderRadius: 10,
              padding: '11px 20px',
              fontSize: 14,
              color: '#2D2926',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {t('success.bookAnother')}
          </button>
        </div>
      </div>
    )
  }

  const cardText = isEsc ? '#e5e2e1' : '#2D2926'
  const cardMuted = isEsc ? '#d0c5b9' : '#9A8E85'
  const cardBg = isEsc ? '#121212' : 'white'
  const inputBg = isEsc ? '#1c1b1b' : 'white'
  const inputBorder = isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8'
  const inputRadius = isEsc ? 0 : 10

  // Guest guard: if business blocks guests and user is not logged, show login required
  if (!allowGuestBookings && authChecked && !authUser) {
    return (
      <div
        style={{
          background: cardBg,
          border: isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8',
          borderRadius: isEsc ? 0 : 12,
          padding: 20,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: cardText, marginBottom: 8 }}>
          Debes registrarte para reservar
        </h3>
        <p style={{ fontSize: 13, color: cardMuted, marginBottom: 16 }}>
          Este negocio solo permite reservas a clientes registrados.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            href={`/client/login?redirect=/book/${business.slug}`}
            style={{
              display: 'block',
              textAlign: 'center',
              background: isEsc ? '#C5A059' : 'var(--brand)',
              color: isEsc ? '#000' : 'white',
              padding: '12px',
              borderRadius: isEsc ? 0 : 10,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Iniciar sesión
          </a>
          <a
            href={`/client/register?redirect=/book/${business.slug}`}
            style={{
              display: 'block',
              textAlign: 'center',
              background: 'white',
              border: '0.5px solid #E8E0D8',
              color: '#2D2926',
              padding: '12px',
              borderRadius: isEsc ? 0 : 10,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Crear cuenta
          </a>
        </div>
      </div>
    )
  }

  // Helper to handle datetime continue with skip for logged users
  function handleDatetimeContinue() {
    if (authUser && contact.name && (contact.phone || contact.email)) {
      // Prefilled and authenticated — skip contact step and submit directly
      submit()
    } else if (authUser) {
      // Authenticated but contact not fully prefilled — go to contact (prefilled) for confirmation
      setStep('contact')
    } else {
      setStep('contact')
    }
  }

  return (
    <div>
      {/* ── Step 1: Service ───────────────────────────────────────────────── */}
      {step === 'service' && (
        <div>
          {hasMultipleLocations && (
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: cardMuted,
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                SUCURSAL
              </label>
              <select
                value={selectedLocation ?? ''}
                onChange={(e) => {
                  const val = e.target.value || null
                  setSelectedLocation(val)
                  // Clear service/employee if not compatible with new location
                  if (
                    selectedService &&
                    val &&
                    selectedService.location_id &&
                    selectedService.location_id !== val
                  ) {
                    setSelectedService(null)
                  }
                  if (selectedEmployee && val) {
                    const emp = employees.find((emp) => emp.id === selectedEmployee)
                    if (emp?.location_id && emp.location_id !== val) setSelectedEmployee('')
                  }
                }}
                style={{
                  border: inputBorder,
                  borderRadius: inputRadius,
                  padding: '10px 12px',
                  fontSize: 13,
                  width: '100%',
                  background: inputBg,
                  color: cardText,
                }}
              >
                <option value="">Todas las sedes</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <StepBadge label="Seleccionar servicio" theme={theme} />
          <SectionTitle text={t('selectService.heading')} theme={theme} />
          {visibleServices.length === 0 ? (
            <p style={{ fontSize: 14, color: cardMuted }}>{t('selectService.empty')}</p>
          ) : (
            visibleServices.map((s) => (
              <button key={s.id} onClick={() => handleSelectService(s)} style={baseCard}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: cardText }}>{s.name}</div>
                  {s.description && (
                    <div style={{ fontSize: 12, color: cardMuted, marginTop: 2 }}>
                      {s.description}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: cardMuted, marginTop: 2 }}>
                    {t('selectService.minutes', { duration: s.duration_min })}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: isEsc ? '#C5A059' : 'var(--brand)',
                    flexShrink: 0,
                    marginLeft: 12,
                  }}
                >
                  {formatCurrency(s.price, business.currency)}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Step 2: Employee ──────────────────────────────────────────────── */}
      {step === 'employee' && selectedService && (
        <div>
          <BackLink
            label={t('selectEmployee.back')}
            onClick={handleBackFromEmployee}
            theme={theme}
          />
          <StepBadge label="Elegir especialista" theme={theme} />
          <SectionTitle text={t('selectEmployee.heading')} theme={theme} />
          <p style={{ fontSize: 13, color: cardMuted, marginTop: -8, marginBottom: 14 }}>
            {selectedService.name}
          </p>

          <button
            onClick={() => handleSelectEmployee('')}
            style={{
              ...baseCard,
              borderStyle: 'dashed',
              background: isEsc ? '#1c1b1b' : baseCard.background,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isEsc ? '#2a2a2a' : '#F0EBE6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 18, color: isEsc ? '#8E795E' : '#9A8E85' }}>?</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: cardMuted }}>
                {t('selectEmployee.anyone')}
              </span>
            </div>
          </button>

          {visibleEmployees.map((e) => (
            <button key={e.id} onClick={() => handleSelectEmployee(e.id)} style={baseCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: isEsc ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)',
                    color: isEsc ? '#C5A059' : 'var(--brand)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {e.name[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: cardText }}>{e.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Step 3: Date & Time ───────────────────────────────────────────── */}
      {step === 'datetime' && selectedService && (
        <div>
          <BackLink label={t('datetime.back')} onClick={handleBackFromDatetime} theme={theme} />
          <StepBadge label={isEsc ? 'Fecha y hora' : 'Date & time'} theme={theme} />
          <SectionTitle text={t('datetime.heading')} theme={theme} />

          {slotTakenError && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                background: isEsc ? '#1c1b1b' : '#FFF8ED',
                border: isEsc ? '1px solid rgba(197,160,89,0.3)' : '0.5px solid #F5C842',
                borderRadius: isEsc ? 0 : 10,
                fontSize: 13,
                color: isEsc ? '#C5A059' : '#7A5C00',
              }}
            >
              ⚠ Este horario acaba de ser reservado. Elige otro.
            </div>
          )}

          <p style={{ fontSize: 13, color: cardMuted, marginTop: -8, marginBottom: 16 }}>
            {selectedService.name} · {selectedService.duration_min} min
            {selectedEmployeeObj && ` · ${selectedEmployeeObj.name}`}
          </p>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: cardText,
                marginBottom: 6,
                display: 'block',
              }}
            >
              {t('datetime.dateLabel')}
            </label>
            <DatePicker
              value={date}
              onChange={(v) => {
                setDate(v)
                setSlotTakenError(false)
              }}
              className="mt-1"
              minDate={today}
              disabledWeekdays={closedWeekdays}
              disabledDates={holidayDates}
            />
            {holidayDates.includes(date) && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: '#FFF8ED',
                  border: '0.5px solid #F5C842',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#7A5C00',
                }}
              >
                ⚠ Este día es festivo y la barbería está cerrada. Elegí otra fecha.
              </div>
            )}
          </div>

          {date && (
            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: cardText,
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                {t('datetime.timeLabel')}
              </label>
              {loadingSlots ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    color: cardMuted,
                  }}
                >
                  <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                  Cargando horarios...
                </div>
              ) : dayClosed ? (
                <div
                  style={{
                    padding: 12,
                    background: isEsc ? '#1c1b1b' : '#F5F0EB',
                    border: isEsc ? '1px solid #353534' : 'none',
                    borderRadius: isEsc ? 0 : 10,
                    fontSize: 14,
                    color: cardMuted,
                  }}
                >
                  Fuera de horario. Elige otro día.
                </div>
              ) : availableSlots.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    background: isEsc ? '#1c1b1b' : '#F5F0EB',
                    border: isEsc ? '1px solid #353534' : 'none',
                    borderRadius: isEsc ? 0 : 10,
                    fontSize: 14,
                    color: cardMuted,
                  }}
                >
                  Sin horarios para este día. Elige otro.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {availableSlots.map((ts) => {
                    const isGroup = (selectedService?.capacity ?? 1) > 1
                    const spotsLeft = slotSpotsLeft[ts] ?? selectedService?.capacity ?? 1
                    const isPartial = isGroup && spotsLeft < (selectedService?.capacity ?? 1)
                    const isSelected = time === ts
                    return (
                      <button
                        key={ts}
                        onClick={() => {
                          setTime(ts)
                          setSlotTakenError(false)
                        }}
                        style={{
                          background: isSelected
                            ? isEsc
                              ? '#C5A059'
                              : 'var(--brand)'
                            : isEsc
                              ? '#121212'
                              : 'white',
                          border: isSelected
                            ? `1px solid ${isEsc ? '#C5A059' : 'var(--brand)'}`
                            : isEsc
                              ? '1px solid rgba(197,160,89,0.2)'
                              : '0.5px solid #E8E0D8',
                          borderRadius: isEsc ? 0 : 10,
                          padding: '10px 4px',
                          textAlign: 'center',
                          fontSize: 13,
                          fontWeight: 500,
                          color: isSelected ? (isEsc ? '#000' : 'white') : cardText,
                          cursor: 'pointer',
                        }}
                      >
                        <div>{formatSlot(ts)}</div>
                        {isPartial && (
                          <div
                            style={{
                              fontSize: 10,
                              color: isSelected
                                ? isEsc
                                  ? 'rgba(0,0,0,0.7)'
                                  : 'rgba(255,255,255,0.8)'
                                : isEsc
                                  ? '#C5A059'
                                  : 'var(--brand)',
                              marginTop: 2,
                            }}
                          >
                            {spotsLeft} lugares
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* US7 waitlist CTA: when no slots or slot taken or day closed holiday, offer waitlist */}
          {(dayClosed || availableSlots.length === 0 || slotTakenError) && date && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: isEsc ? '#1c1b1b' : '#FFF8ED',
                border: isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8',
                borderRadius: isEsc ? 0 : 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 4 }}>
                ¿Sin horarios?
              </div>
              <div style={{ fontSize: 12, color: cardMuted, marginBottom: 8 }}>
                Unite a la lista de espera. Te avisamos por WhatsApp cuando se libere un slot (30m
                para confirmar).
              </div>
              <button
                onClick={() => setStep('contact')}
                style={{
                  background: isEsc ? '#C5A059' : 'var(--brand)',
                  color: isEsc ? '#000' : 'white',
                  border: isEsc ? '1px solid #C5A059' : 'none',
                  borderRadius: isEsc ? 0 : 8,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Unirme a lista de espera
              </button>
            </div>
          )}

          <CtaButton
            label={isEsc ? 'Continuar →' : t('datetime.continue')}
            onClick={handleDatetimeContinue}
            disabled={!date || !time}
            theme={theme}
          />
          {bookingError && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: isEsc ? '#1c1b1b' : '#FFF0F0',
                border: isEsc ? '1px solid #93000a' : '0.5px solid #F5AAAA',
                borderRadius: isEsc ? 0 : 10,
                fontSize: 13,
                color: isEsc ? '#ffb4ab' : '#B00020',
              }}
            >
              {bookingError}
              {(bookingError.toLowerCase().includes('no staff') ||
                bookingError.toLowerCase().includes('slot')) && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => setStep('contact')}
                    style={{
                      background: 'white',
                      border: '0.5px solid #E8E0D8',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      color: '#2D2926',
                      cursor: 'pointer',
                    }}
                  >
                    Unirme a lista de espera
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Contact ───────────────────────────────────────────────── */}
      {step === 'contact' && (
        <div>
          <BackLink label={t('contact.back')} onClick={() => setStep('datetime')} theme={theme} />
          <StepBadge label={isEsc ? 'Tus datos' : 'Your details'} theme={theme} />
          <SectionTitle text={t('contact.heading')} theme={theme} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(
              [
                {
                  key: 'name' as const,
                  label: t('contact.nameLabel'),
                  placeholder: t('contact.namePlaceholder'),
                  type: 'text',
                },
                {
                  key: 'phone' as const,
                  label: t('contact.phoneLabel'),
                  placeholder: t('contact.phonePlaceholder'),
                  type: 'tel',
                },
                {
                  key: 'email' as const,
                  label: t('contact.emailLabel'),
                  placeholder: t('contact.emailPlaceholder'),
                  type: 'email',
                },
              ] as const
            ).map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: cardText,
                    marginBottom: 6,
                    display: 'block',
                  }}
                >
                  {label}
                </label>
                <input
                  type={type}
                  value={contact[key]}
                  onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{
                    border: inputBorder,
                    borderRadius: inputRadius,
                    padding: '11px 14px',
                    fontSize: 14,
                    color: cardText,
                    width: '100%',
                    background: inputBg,
                    outline: 'none',
                    boxSizing: 'border-box',
                    minHeight: '44px',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = isEsc ? '#C5A059' : 'var(--brand)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isEsc ? 'rgba(197,160,89,0.2)' : '#E8E0D8'
                  }}
                />
              </div>
            ))}
            {/* US5 loyalty fields */}
            <div style={{ borderTop: '0.5px solid #E8E0D8', paddingTop: 14, marginTop: 4 }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: cardText,
                  marginBottom: 8,
                  letterSpacing: '0.05em',
                }}
              >
                BENEFICIOS (opcional · solo uno)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: cardMuted }}>Cupón promo</label>
                  <input
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase())
                      if (e.target.value) {
                        setLoyaltyPoints('')
                        setMembershipId('')
                      }
                    }}
                    placeholder="CUMPLE20"
                    style={{
                      border: inputBorder,
                      borderRadius: inputRadius,
                      padding: '10px 12px',
                      fontSize: 13,
                      width: '100%',
                      background: inputBg,
                      marginTop: 4,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: cardMuted }}>
                    Puntos fidelización (100 pts = $10.000)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={loyaltyPoints}
                    onChange={(e) => {
                      setLoyaltyPoints(e.target.value)
                      if (e.target.value) {
                        setPromoCode('')
                        setMembershipId('')
                      }
                    }}
                    placeholder="0"
                    style={{
                      border: inputBorder,
                      borderRadius: inputRadius,
                      padding: '10px 12px',
                      fontSize: 13,
                      width: '100%',
                      background: inputBg,
                      marginTop: 4,
                    }}
                  />
                  {loyaltyBalance !== null && (
                    <span style={{ fontSize: 11, color: cardMuted }}>
                      Tienes {loyaltyBalance} pts
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {bookingError && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: isEsc ? '#1c1b1b' : '#FFF0F0',
                border: isEsc ? '1px solid #93000a' : '0.5px solid #F5AAAA',
                borderRadius: isEsc ? 0 : 10,
                fontSize: 13,
                color: isEsc ? '#ffb4ab' : '#B00020',
              }}
            >
              {bookingError}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!contact.name || saving}
            style={{
              background:
                !contact.name || saving
                  ? isEsc
                    ? '#353534'
                    : '#C4BAB3'
                  : isEsc
                    ? '#C5A059'
                    : 'var(--brand)',
              color:
                !contact.name || saving ? (isEsc ? '#8E795E' : 'white') : isEsc ? '#000' : 'white',
              border: isEsc ? '1px solid #C5A059' : 'none',
              borderRadius: isEsc ? 0 : 10,
              padding: '13px 20px',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: isEsc ? '0.1em' : undefined,
              width: '100%',
              marginTop: 16,
              cursor: !contact.name || saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving
              ? t('contact.booking')
              : t('contact.confirm', {
                  price: formatCurrency(selectedService?.price ?? 0, business.currency),
                })}
          </button>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: cardMuted }}>o</span>
          </div>
          <button
            onClick={joinWaitlist}
            disabled={!contact.name || waitlistJoinLoading || waitlistJoined}
            style={{
              background: 'white',
              border: isEsc ? '1px solid rgba(197,160,89,0.4)' : '0.5px solid #E8E0D8',
              borderRadius: isEsc ? 0 : 10,
              padding: '11px 20px',
              fontSize: 13,
              fontWeight: 500,
              color: waitlistJoined ? '#16a34a' : cardText,
              width: '100%',
              marginTop: 8,
              cursor: !contact.name || waitlistJoinLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {waitlistJoined
              ? '✓ En lista de espera'
              : waitlistJoinLoading
                ? 'Uniendo…'
                : `Unirme a lista de espera ${date ? `· ${date}` : ''} ${time ? formatSlot(time) : ''}`}
          </button>
          <p style={{ fontSize: 11, color: cardMuted, textAlign: 'center', marginTop: 12 }}>
            {t('contact.noRegistration')} · Lista de espera expira en 30m si no confirmás.
          </p>
        </div>
      )}
    </div>
  )
}
