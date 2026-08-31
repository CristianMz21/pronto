'use client'

import { CalendarPlus, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { DatePicker } from '@/components/ui/date-picker'
import {
  computeEffectiveHours,
  type DayHours,
  DEFAULT_LEAD_MINUTES,
  isTooSoonMinutes,
  nowMinutesInBusinessTz as nowMinutesInBusinessTzLib,
  todayInBusinessTz as todayInBusinessTzLib,
} from '@/lib/booking-availability'
import { buildGCalUrl } from '@/lib/gcal'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, uses12HourClock } from '@/lib/utils'
import { isRecord } from '@/lib/validation/guard'

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

interface HolidayRow {
  date: string
  is_open: boolean
  location_id: string | null
}

function getStringField(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'string' ? v : undefined
}

function extractErrorMessage(json: unknown): string | undefined {
  if (!isRecord(json)) return undefined
  const msg = json['message']
  if (typeof msg === 'string' && msg.length > 0) return msg
  const err = json['error']
  if (typeof err === 'string' && err.length > 0) return err
  return undefined
}

function generateSlots(openTime: string, closeTime: string, durationMin: number): string[] {
  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  const start = oh! * 60 + om!
  const end = ch! * 60 + cm!
  const slots: string[] = []
  let cur = start
  while (cur + durationMin <= end) {
    slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`)
    cur += durationMin
  }
  return slots
}

const slotCache = new Map<string, string[]>()
function generateSlotsMemo(openTime: string, closeTime: string, durationMin: number): string[] {
  const key = `${openTime}-${closeTime}-${durationMin}`
  const hit = slotCache.get(key)
  if (hit) return hit
  const slots = generateSlots(openTime, closeTime, durationMin)
  slotCache.set(key, slots)
  return slots
}

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

function BackLink({ label, onClick, theme }: { label: string; onClick: () => void; theme?: string }) {
  return (
    <button
      type="button"
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

function CtaButton({ label, onClick, disabled, theme }: { label: string; onClick: () => void; disabled?: boolean; theme?: string }) {
  const isEsc = theme === 'escuderia'
  return (
    <button
      type="button"
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

// ── Pure slot helpers (<20 each) ───────────────────────────────────────────

function getTzDow(dateStr: string, timezone: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date(Date.UTC(y!, m! - 1, d!, 12, 0)))
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    return map[wd] ?? dow
  } catch {
    return dow
  }
}

function filterSlotsByBreak(slots: string[], dayHours: DayHours, durationMin: number): string[] {
  if (!dayHours.break_start || !dayHours.break_end) return slots
  const [brh, brm] = dayHours.break_start.split(':').map(Number)
  const [beh, bem] = dayHours.break_end.split(':').map(Number)
  const breakStartMin = brh! * 60 + brm!
  const breakEndMin = beh! * 60 + bem!
  return slots.filter((slot) => {
    const [sh, sm] = slot.split(':').map(Number)
    const slotStartMin = sh! * 60 + sm!
    const slotEndMin = slotStartMin + durationMin
    return !(slotStartMin < breakEndMin && slotEndMin > breakStartMin)
  })
}

function filterSlotsByToday(slots: string[], today: string, selectedDate: string, nowMin: number, minAdvance: number, leadEnabled: boolean): string[] {
  if (selectedDate !== today) return slots
  return slots.filter((slot) => {
    const [sh, sm] = slot.split(':').map(Number)
    const slotMin = sh! * 60 + sm!
    if (slotMin <= nowMin) return false
    if (isTooSoonMinutes(slotMin, nowMin, minAdvance, leadEnabled)) return false
    return true
  })
}

function toBusinessMinutes(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return (h % 24) * 60 + m
}

function computeAvailableSlotsWithCapacity(
  slots: string[],
  booked: { starts_at: string; ends_at: string }[] | null,
  capacity: number,
  svc: Service,
  businessTimezone: string,
): { filtered: string[]; spotsMap: Record<string, number> } {
  const spotsMap: Record<string, number> = {}
  const filtered = slots.filter((slot) => {
    const [sh, sm] = slot.split(':').map(Number)
    const slotStartMin = sh! * 60 + sm!
    const slotEndMin = slotStartMin + svc.duration_min
    const bookedCount = (booked ?? []).filter(({ starts_at, ends_at }) => {
      const bStartMin = toBusinessMinutes(starts_at, businessTimezone)
      const bEndMin = toBusinessMinutes(ends_at, businessTimezone)
      return slotStartMin < bEndMin && slotEndMin > bStartMin
    }).length
    const spotsLeft = capacity - bookedCount
    if (spotsLeft > 0) {
      spotsMap[slot] = spotsLeft
      return true
    }
    return false
  })
  return { filtered, spotsMap }
}

// ── Validation helpers for submit (<20) ─────────────────────────────────

function validateContactFields(contact: { name: string; phone: string; email: string }): string | null {
  if (!contact.name) return null
  if (!contact.phone && !contact.email) return 'Please enter at least a phone number or email so we can confirm your booking.'
  if (contact.phone && !/^[\d\s+\-().]{7,}$/.test(contact.phone)) return 'Please enter a valid phone number (digits only, e.g. +1 234 567 8900).'
  if (contact.email && !contact.email.includes('@')) return 'Please enter a valid email address (e.g. name@example.com).'
  return null
}

function validateBookingTime(date: string, time: string, today: string, nowMin: number, minAdvance: number, leadEnabled: boolean): string | null {
  if (date < today) return 'No se puede reservar en el pasado. Elegí una fecha futura.'
  if (date !== today) return null
  const [sh, sm] = time.split(':').map(Number)
  const slotMin = sh! * 60 + sm!
  if (slotMin <= nowMin) return 'No se puede reservar en el pasado. Elegí un horario futuro.'
  if (isTooSoonMinutes(slotMin, nowMin, minAdvance, leadEnabled)) return `Reservá con al menos ${minAdvance} minutos de anticipación.`
  return null
}

async function handleBookingResponse(res: Response, actions: {
  setBookingError: (s: string) => void
  setSlotTakenError: (b: boolean) => void
  setTime: (s: string) => void
  setStep: (s: Step) => void
  loadSlots: () => void
  t: (k: string) => string
  minAdvance: number
}): Promise<{ handled: boolean; data?: unknown }> {
  if (res.status === 409) {
    const body: unknown = await res.json().catch(() => null as unknown)
    const err = getStringField(body, 'error')
    if (err === 'no_staff_available') {
      actions.setBookingError(actions.t('noStaffAvailable'))
      return { handled: true }
    }
    if (['promo_stack_guard', 'membership_expired', 'no_uses_left', 'promo_not_eligible', 'insufficient_points', 'promo_not_found', 'membership_not_found'].includes(err ?? '')) {
      const msg = getStringField(body, 'message')
      actions.setBookingError(msg ?? err ?? 'Beneficio no válido')
      return { handled: true }
    }
    actions.setSlotTakenError(true)
    actions.setTime('')
    actions.setStep('datetime')
    actions.loadSlots()
    return { handled: true }
  }
  if (res.status === 401) {
    const body: unknown = await res.json().catch(() => null as unknown)
    const err = getStringField(body, 'error')
    if (err === 'guest_not_allowed') {
      const msg = getStringField(body, 'message')
      actions.setBookingError(msg ?? 'Debes registrarte para reservar en este negocio')
      return { handled: true }
    }
    actions.setBookingError('Debes iniciar sesión para reservar.')
    return { handled: true }
  }
  if (res.status === 429) {
    actions.setBookingError('Too many booking attempts. Please wait a few minutes and try again.')
    return { handled: true }
  }
  if (res.status === 400) {
    const body: unknown = await res.json().catch(() => null as unknown)
    const err = getStringField(body, 'error')
    if (err === 'in_past') {
      actions.setBookingError('No se puede reservar en el pasado. Elegí una fecha y hora futuras.')
      return { handled: true }
    }
    if (err === 'too_soon') {
      const msg = getStringField(body, 'message')
      actions.setBookingError(msg ?? `Reservá con al menos ${actions.minAdvance} minutos de anticipación.`)
      return { handled: true }
    }
  }
  if (!res.ok) throw new Error(await res.text())
  const data: unknown = await res.json()
  return { handled: false, data }
}

// ── Subcomponents (<20 each) ─────────────────────────────────────────────

function LocationSelector({ hasMultipleLocations, locations, selectedLocation, setSelectedLocation, selectedService, setSelectedService, theme }: {
  hasMultipleLocations: boolean; locations: Location[]; selectedLocation: string | null; setSelectedLocation: (v: string | null) => void; selectedService: Service | null; setSelectedService: (s: Service | null) => void; theme?: string
}) {
  const isEsc = theme === 'escuderia'
  const cardMuted = isEsc ? '#d0c5b9' : '#9A8E85'
  const cardText = isEsc ? '#e5e2e1' : '#2D2926'
  const inputBg = isEsc ? '#1c1b1b' : 'white'
  const inputBorder = isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8'
  const inputRadius = isEsc ? 0 : 10
  function handleChange(val: string | null) {
    setSelectedLocation(val)
    if (selectedService?.location_id && val && selectedService.location_id !== val) setSelectedService(null)
  }
  if (!hasMultipleLocations) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: cardMuted, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>SUCURSAL</label>
      <select value={selectedLocation ?? ''} onChange={(e) => handleChange(e.target.value || null)} style={{ border: inputBorder, borderRadius: inputRadius, padding: '10px 12px', fontSize: 13, width: '100%', background: inputBg, color: cardText }}>
        <option value="">Todas las sedes</option>
        {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
      </select>
    </div>
  )
}

function ServiceList({ services, business, onSelect, theme }: { services: Service[]; business: Business; onSelect: (s: Service) => void; theme?: string }) {
  const t = useTranslations('publicBooking')
  const isEsc = theme === 'escuderia'
  const baseCard = getBaseCard(theme ?? 'default')
  const cardText = isEsc ? '#e5e2e1' : '#2D2926'
  const cardMuted = isEsc ? '#d0c5b9' : '#9A8E85'
  if (services.length === 0) return <p style={{ fontSize: 14, color: cardMuted }}>{t('selectService.empty')}</p>
  return <>{services.map((s) => (
    <button type="button" key={s.id} onClick={() => onSelect(s)} style={baseCard}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: cardText }}>{s.name}</div>
        {s.description && <div style={{ fontSize: 12, color: cardMuted, marginTop: 2 }}>{s.description}</div>}
        <div style={{ fontSize: 12, color: cardMuted, marginTop: 2 }}>{t('selectService.minutes', { duration: s.duration_min })}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: isEsc ? '#C5A059' : 'var(--brand)', flexShrink: 0, marginLeft: 12 }}>{formatCurrency(s.price, business.currency)}</div>
    </button>
  ))}</>
}

function ServiceSelectionStep({ services, business, onSelect, theme, hasMultipleLocations, locations, selectedLocation, setSelectedLocation, selectedService, setSelectedService }: {
  services: Service[]; business: Business; onSelect: (s: Service) => void; theme?: string; hasMultipleLocations: boolean; locations: Location[]; selectedLocation: string | null; setSelectedLocation: (v: string | null) => void; selectedService: Service | null; setSelectedService: (s: Service | null) => void
}) {
  const t = useTranslations('publicBooking')
  const visibleServices = selectedLocation ? services.filter((s) => !s.location_id || s.location_id === selectedLocation) : services
  return (
    <div>
      <LocationSelector hasMultipleLocations={hasMultipleLocations} locations={locations} selectedLocation={selectedLocation} setSelectedLocation={setSelectedLocation} selectedService={selectedService} setSelectedService={setSelectedService} theme={theme} />
      <StepBadge label="Seleccionar servicio" theme={theme} />
      <SectionTitle text={t('selectService.heading')} theme={theme} />
      <ServiceList services={visibleServices} business={business} onSelect={onSelect} theme={theme} />
    </div>
  )
}

function EmployeeSelectionStep({ service, employees, selectedLocation, onSelect, onBack, theme }: {
  service: Service; employees: Employee[]; selectedLocation: string | null; onSelect: (id: string) => void; onBack: () => void; theme?: string
}) {
  const t = useTranslations('publicBooking')
  const isEsc = theme === 'escuderia'
  const baseCard = getBaseCard(theme ?? 'default')
  const cardText = isEsc ? '#e5e2e1' : '#2D2926'
  const cardMuted = isEsc ? '#d0c5b9' : '#9A8E85'
  const visibleEmployees = selectedLocation ? employees.filter((e) => !e.location_id || e.location_id === selectedLocation) : employees
  return (
    <div>
      <BackLink label={t('selectEmployee.back')} onClick={onBack} theme={theme} />
      <StepBadge label="Elegir especialista" theme={theme} />
      <SectionTitle text={t('selectEmployee.heading')} theme={theme} />
      <p style={{ fontSize: 13, color: cardMuted, marginTop: -8, marginBottom: 14 }}>{service.name}</p>
      <button type="button" onClick={() => onSelect('')} style={{ ...baseCard, borderStyle: 'dashed', background: isEsc ? '#1c1b1b' : baseCard.background }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: isEsc ? '#2a2a2a' : '#F0EBE6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18, color: isEsc ? '#8E795E' : '#9A8E85' }}>?</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: cardMuted }}>{t('selectEmployee.anyone')}</span>
        </div>
      </button>
      {visibleEmployees.map((e) => (
        <button type="button" key={e.id} onClick={() => onSelect(e.id)} style={baseCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: isEsc ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)', color: isEsc ? '#C5A059' : 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>{e.name[0]?.toUpperCase()}</div>
            <span style={{ fontSize: 14, fontWeight: 500, color: cardText }}>{e.name}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function SlotGrid({ slots, selectedTime, onSelect, slotSpotsLeft, capacity, formatSlot, theme, cardText }: {
  slots: string[]; selectedTime: string; onSelect: (t: string) => void; slotSpotsLeft: Record<string, number>; capacity: number; formatSlot: (s: string) => string; theme?: string; cardText: string
}) {
  const isEsc = theme === 'escuderia'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {slots.map((ts) => {
        const isGroup = capacity > 1
        const spotsLeft = slotSpotsLeft[ts] ?? capacity
        const isPartial = isGroup && spotsLeft < capacity
        const isSelected = selectedTime === ts
        return (
          <button
            type="button"
            key={ts}
            onClick={() => onSelect(ts)}
            style={{
              background: isSelected ? (isEsc ? '#C5A059' : 'var(--brand)') : isEsc ? '#121212' : 'white',
              border: isSelected ? `1px solid ${isEsc ? '#C5A059' : 'var(--brand)'}` : isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8',
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
            {isPartial && <div style={{ fontSize: 10, color: isSelected ? (isEsc ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)') : isEsc ? '#C5A059' : 'var(--brand)', marginTop: 2 }}>{spotsLeft} lugares</div>}
          </button>
        )
      })}
    </div>
  )
}

function SlotTakenBanner({ isEsc }: { isEsc: boolean }) {
  return <div style={{ marginBottom: 16, padding: 12, background: isEsc ? '#1c1b1b' : '#FFF8ED', border: isEsc ? '1px solid rgba(197,160,89,0.3)' : '0.5px solid #F5C842', borderRadius: isEsc ? 0 : 10, fontSize: 13, color: isEsc ? '#C5A059' : '#7A5C00' }}>⚠ Este horario acaba de ser reservado. Elige otro.</div>
}

function TimeSlotsSection({ loadingSlots, dayClosed, availableSlots, service, time, onTimeSelect, slotSpotsLeft, formatSlot, theme, cardText, cardMuted, isEsc }: {
  loadingSlots: boolean; dayClosed: boolean; availableSlots: string[]; service: Service; time: string; onTimeSelect: (v: string) => void; slotSpotsLeft: Record<string, number>; formatSlot: (s: string) => string; theme?: string; cardText: string; cardMuted: string; isEsc: boolean
}) {
  if (loadingSlots) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: cardMuted }}><Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />Cargando horarios...</div>
  if (dayClosed) return <div style={{ padding: 12, background: isEsc ? '#1c1b1b' : '#F5F0EB', border: isEsc ? '1px solid #353534' : 'none', borderRadius: isEsc ? 0 : 10, fontSize: 14, color: cardMuted }}>Fuera de horario. Elige otro día.</div>
  if (availableSlots.length === 0) return <div style={{ padding: 12, background: isEsc ? '#1c1b1b' : '#F5F0EB', border: isEsc ? '1px solid #353534' : 'none', borderRadius: isEsc ? 0 : 10, fontSize: 14, color: cardMuted }}>Sin horarios para este día. Elige otro.</div>
  return <SlotGrid slots={availableSlots} selectedTime={time} onSelect={onTimeSelect} slotSpotsLeft={slotSpotsLeft} capacity={service.capacity ?? 1} formatSlot={formatSlot} theme={theme} cardText={cardText} />
}

function WaitlistPrompt({ isEsc, cardText, cardMuted, onJoin }: { isEsc: boolean; cardText: string; cardMuted: string; onJoin: () => void }) {
  return (
    <div style={{ marginTop: 16, padding: 12, background: isEsc ? '#1c1b1b' : '#FFF8ED', border: isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8', borderRadius: isEsc ? 0 : 10 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 4 }}>¿Sin horarios?</div>
      <div style={{ fontSize: 12, color: cardMuted, marginBottom: 8 }}>Unite a la lista de espera. Te avisamos por WhatsApp cuando se libere un slot (30m para confirmar).</div>
      <button type="button" onClick={onJoin} style={{ background: isEsc ? '#C5A059' : 'var(--brand)', color: isEsc ? '#000' : 'white', border: isEsc ? '1px solid #C5A059' : 'none', borderRadius: isEsc ? 0 : 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Unirme a lista de espera</button>
    </div>
  )
}

function DateTimeSelectionStep({ service, employeeName, date, time, onDateChange, onTimeSelect, availableSlots, slotSpotsLeft, loadingSlots, dayClosed, holidayDates, slotTakenError, bookingError, onContinue, onBack, closedWeekdays, today, formatSlot, theme, t, cardText, cardMuted, isEsc, onJoinWaitlistFromDatetime }: {
  service: Service; employeeName: string | null; date: string; time: string; onDateChange: (v: string) => void; onTimeSelect: (v: string) => void; availableSlots: string[]; slotSpotsLeft: Record<string, number>; loadingSlots: boolean; dayClosed: boolean; holidayDates: string[]; slotTakenError: boolean; bookingError: string | null; onContinue: () => void; onBack: () => void; closedWeekdays: number[]; today: string; formatSlot: (s: string) => string; theme?: string; t: (k: string, o?: unknown) => string; cardText: string; cardMuted: string; isEsc: boolean; onJoinWaitlistFromDatetime: () => void
}) {
  const showWaitlist = !loadingSlots && (dayClosed || availableSlots.length === 0 || slotTakenError) && !!date
  return (
    <div>
      <BackLink label={t('datetime.back')} onClick={onBack} theme={theme} />
      <StepBadge label={isEsc ? 'Fecha y hora' : 'Date & time'} theme={theme} />
      <SectionTitle text={t('datetime.heading')} theme={theme} />
      {slotTakenError && <SlotTakenBanner isEsc={isEsc} />}
      <p style={{ fontSize: 13, color: cardMuted, marginTop: -8, marginBottom: 16 }}>{service.name} · {service.duration_min} min{employeeName && ` · ${employeeName}`}</p>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 6, display: 'block' }}>{t('datetime.dateLabel')}</label>
        <DatePicker value={date} onChange={onDateChange} className="mt-1" minDate={today} disabledWeekdays={closedWeekdays} disabledDates={holidayDates} />
        {holidayDates.includes(date) && <div style={{ marginTop: 8, padding: 10, background: '#FFF8ED', border: '0.5px solid #F5C842', borderRadius: 10, fontSize: 12, color: '#7A5C00' }}>⚠ Este día es festivo y la barbería está cerrada. Elegí otra fecha.</div>}
      </div>
      {date && (
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 6, display: 'block' }}>{t('datetime.timeLabel')}</label>
          <TimeSlotsSection loadingSlots={loadingSlots} dayClosed={dayClosed} availableSlots={availableSlots} service={service} time={time} onTimeSelect={onTimeSelect} slotSpotsLeft={slotSpotsLeft} formatSlot={formatSlot} theme={theme} cardText={cardText} cardMuted={cardMuted} isEsc={isEsc} />
        </div>
      )}
      {showWaitlist && <WaitlistPrompt isEsc={isEsc} cardText={cardText} cardMuted={cardMuted} onJoin={onJoinWaitlistFromDatetime} />}
      <CtaButton label={isEsc ? 'Continuar →' : t('datetime.continue')} onClick={onContinue} disabled={!date || !time} theme={theme} />
      {bookingError && <div style={{ marginTop: 16, padding: 12, background: isEsc ? '#1c1b1b' : '#FFF0F0', border: isEsc ? '1px solid #93000a' : '0.5px solid #F5AAAA', borderRadius: isEsc ? 0 : 10, fontSize: 13, color: isEsc ? '#ffb4ab' : '#B00020' }}>{bookingError}</div>}
    </div>
  )
}

function ContactInputs({ contact, setContact, cardText, isEsc, inputBg, inputBorder, inputRadius, t }: {
  contact: { name: string; phone: string; email: string }; setContact: (c: (prev: { name: string; phone: string; email: string }) => { name: string; phone: string; email: string }) => void; cardText: string; isEsc: boolean; inputBg: string; inputBorder: string; inputRadius: number | string; t: (k: string, o?: unknown) => string
}) {
  const fields = [
    { key: 'name' as const, label: t('contact.nameLabel'), placeholder: t('contact.namePlaceholder'), type: 'text' },
    { key: 'phone' as const, label: t('contact.phoneLabel'), placeholder: t('contact.phonePlaceholder'), type: 'tel' },
    { key: 'email' as const, label: t('contact.emailLabel'), placeholder: t('contact.emailPlaceholder'), type: 'email' },
  ]
  return <>{fields.map(({ key, label, placeholder, type }) => (
    <div key={key}>
      <label style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 6, display: 'block' }}>{label}</label>
      <input type={type} value={contact[key]} onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))} placeholder={placeholder} style={{ border: inputBorder, borderRadius: inputRadius as number, padding: '11px 14px', fontSize: 14, color: cardText, width: '100%', background: inputBg, outline: 'none', boxSizing: 'border-box', minHeight: '44px' }} onFocus={(e) => { e.currentTarget.style.borderColor = isEsc ? '#C5A059' : 'var(--brand)' }} onBlur={(e) => { e.currentTarget.style.borderColor = isEsc ? 'rgba(197,160,89,0.2)' : '#E8E0D8' }} />
    </div>
  ))}</>
}

function BenefitFields({ promoCode, setPromoCode, loyaltyPoints, setLoyaltyPoints, setMembershipId, loyaltyBalance, cardText, cardMuted, inputBg, inputBorder, inputRadius }: {
  promoCode: string; setPromoCode: (s: string) => void; loyaltyPoints: string; setLoyaltyPoints: (s: string) => void; setMembershipId: (s: string) => void; loyaltyBalance: number | null; cardText: string; cardMuted: string; inputBg: string; inputBorder: string; inputRadius: number | string
}) {
  return (
    <div style={{ borderTop: '0.5px solid #E8E0D8', paddingTop: 14, marginTop: 4 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: cardText, marginBottom: 8, letterSpacing: '0.05em' }}>BENEFICIOS (opcional · solo uno)</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, color: cardMuted }}>Cupón promo</label>
          <input value={promoCode} onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); if (e.target.value) { setLoyaltyPoints(''); setMembershipId('') } }} placeholder="CUMPLE20" style={{ border: inputBorder, borderRadius: inputRadius as number, padding: '10px 12px', fontSize: 13, width: '100%', background: inputBg, marginTop: 4 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: cardMuted }}>Puntos fidelización (100 pts = $10.000)</label>
          <input type="number" min={0} value={loyaltyPoints} onChange={(e) => { setLoyaltyPoints(e.target.value); if (e.target.value) { setPromoCode(''); setMembershipId('') } }} placeholder="0" style={{ border: inputBorder, borderRadius: inputRadius as number, padding: '10px 12px', fontSize: 13, width: '100%', background: inputBg, marginTop: 4 }} />
          {loyaltyBalance !== null && <span style={{ fontSize: 11, color: cardMuted }}>Tienes {loyaltyBalance} pts</span>}
        </div>
      </div>
    </div>
  )
}

function SubmitBookingButton({ contactName, saving, isEsc, businessCurrency, price, t, onSubmit }: { contactName: string; saving: boolean; isEsc: boolean; businessCurrency: string; price: number; t: (k: string, o?: unknown) => string; onSubmit: () => void }) {
  const disabled = !contactName || saving
  return <button type="button" onClick={onSubmit} disabled={disabled} style={{ background: disabled ? (isEsc ? '#353534' : '#C4BAB3') : isEsc ? '#C5A059' : 'var(--brand)', color: disabled ? (isEsc ? '#8E795E' : 'white') : isEsc ? '#000' : 'white', border: isEsc ? '1px solid #C5A059' : 'none', borderRadius: isEsc ? 0 : 10, padding: '13px 20px', fontSize: 14, fontWeight: 500, letterSpacing: isEsc ? '0.1em' : undefined, width: '100%', marginTop: 16, cursor: disabled ? 'not-allowed' : 'pointer' }}>{saving ? t('contact.booking') : t('contact.confirm', { price: formatCurrency(price, businessCurrency) })}</button>
}

function WaitlistActionButton({ contactName, waitlistJoinLoading, waitlistJoined, isEsc, cardText, date, time, formatSlot, onJoin }: { contactName: string; waitlistJoinLoading: boolean; waitlistJoined: boolean; isEsc: boolean; cardText: string; date: string; time: string; formatSlot: (s: string) => string; onJoin: () => void }) {
  const disabled = !contactName || waitlistJoinLoading || waitlistJoined
  const label = waitlistJoined ? '✓ En lista de espera' : waitlistJoinLoading ? 'Uniendo…' : `Unirme a lista de espera ${date ? `· ${date}` : ''} ${time ? formatSlot(time) : ''}`
  return <button type="button" onClick={onJoin} disabled={disabled} style={{ background: 'white', border: isEsc ? '1px solid rgba(197,160,89,0.4)' : '0.5px solid #E8E0D8', borderRadius: isEsc ? 0 : 10, padding: '11px 20px', fontSize: 13, fontWeight: 500, color: waitlistJoined ? '#16a34a' : cardText, width: '100%', marginTop: 8, cursor: disabled ? 'not-allowed' : 'pointer' }}>{label}</button>
}

function ContactFormStep({ contact, setContact, promoCode, setPromoCode, loyaltyPoints, setLoyaltyPoints, setMembershipId, loyaltyBalance, onSubmit, onJoinWaitlist, saving, waitlistJoinLoading, waitlistJoined, bookingError, date, time, business, selectedService, formatSlot, t, cardText, cardMuted, isEsc, inputBg, inputBorder, inputRadius, _membershipId }: {
  contact: { name: string; phone: string; email: string }; setContact: (c: (prev: { name: string; phone: string; email: string }) => { name: string; phone: string; email: string }) => void
  promoCode: string; setPromoCode: (s: string) => void; loyaltyPoints: string; setLoyaltyPoints: (s: string) => void; setMembershipId: (s: string) => void; loyaltyBalance: number | null
  onSubmit: () => void; onJoinWaitlist: () => void; saving: boolean; waitlistJoinLoading: boolean; waitlistJoined: boolean; bookingError: string | null; date: string; time: string; business: Business; selectedService: Service | null; formatSlot: (s: string) => string; t: (k: string, o?: unknown) => string; cardText: string; cardMuted: string; isEsc: boolean; inputBg: string; inputBorder: string; inputRadius: number | string; _membershipId?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ContactInputs contact={contact} setContact={setContact} cardText={cardText} isEsc={isEsc} inputBg={inputBg} inputBorder={inputBorder} inputRadius={inputRadius} t={t} />
        <BenefitFields promoCode={promoCode} setPromoCode={setPromoCode} loyaltyPoints={loyaltyPoints} setLoyaltyPoints={setLoyaltyPoints} setMembershipId={setMembershipId} loyaltyBalance={loyaltyBalance} cardText={cardText} cardMuted={cardMuted} inputBg={inputBg} inputBorder={inputBorder} inputRadius={inputRadius} />
      </div>
      {bookingError && <div style={{ marginTop: 16, padding: 12, background: isEsc ? '#1c1b1b' : '#FFF0F0', border: isEsc ? '1px solid #93000a' : '0.5px solid #F5AAAA', borderRadius: isEsc ? 0 : 10, fontSize: 13, color: isEsc ? '#ffb4ab' : '#B00020' }}>{bookingError}</div>}
      <SubmitBookingButton contactName={contact.name} saving={saving} isEsc={isEsc} businessCurrency={business.currency} price={selectedService?.price ?? 0} t={t} onSubmit={onSubmit} />
      <div style={{ textAlign: 'center', marginTop: 10 }}><span style={{ fontSize: 11, color: cardMuted }}>o</span></div>
      <WaitlistActionButton contactName={contact.name} waitlistJoinLoading={waitlistJoinLoading} waitlistJoined={waitlistJoined} isEsc={isEsc} cardText={cardText} date={date} time={time} formatSlot={formatSlot} onJoin={onJoinWaitlist} />
      <p style={{ fontSize: 11, color: cardMuted, textAlign: 'center', marginTop: 12 }}>{t('contact.noRegistration')} · Lista de espera expira en 30m si no confirmás.</p>
    </div>
  )
}

function DoneScreen({ business, service, date, time, employeeName, clientId, telegramBotUsername, viberBotUri, clientHasTelegram, onReset, theme, formatSlot, t }: {
  business: Business; service: Service | null; date: string; time: string; employeeName: string | null; clientId: string | null; telegramBotUsername: string | null; viberBotUri: string | null; clientHasTelegram: boolean; onReset: () => void; theme?: string; formatSlot: (s: string) => string; t: (k: string, o?: unknown) => string
}) {
  const isEsc = theme === 'escuderia'
  const telegramLink = telegramBotUsername && clientId ? `https://t.me/${telegramBotUsername}?start=client_${clientId}` : null
  const viberLink = viberBotUri && clientId ? `viber://pa?chatURI=${viberBotUri}&context=client_${clientId}` : null
  const doneBg = isEsc ? '#121212' : 'white'
  const doneBorder = isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8'
  const doneRadius = isEsc ? 0 : 16
  const textPrimary = isEsc ? '#e5e2e1' : '#2D2926'
  const textMuted = isEsc ? '#d0c5b9' : '#9A8E85'
  return (
    <div style={{ background: doneBg, border: doneBorder, borderRadius: doneRadius, padding: '32px 24px', textAlign: 'center' }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ margin: '0 auto 16px', display: 'block' }}><title>Success checkmark</title><circle cx="28" cy="28" r="27" stroke={isEsc ? '#C5A059' : 'var(--brand)'} strokeWidth="2" fill={isEsc ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)'} /><path d="M17 28L24 35L39 20" stroke={isEsc ? '#C5A059' : 'var(--brand)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <h2 style={{ fontSize: 20, fontWeight: 500, color: textPrimary, margin: '0 0 8px', fontFamily: isEsc ? 'var(--font-playfair)' : undefined }}>{t('success.heading')}</h2>
      <p style={{ fontSize: 14, color: textMuted, margin: '0 0 4px' }}>{service?.name} · {date} at {time ? formatSlot(time) : ''}{employeeName && ` · ${employeeName}`}</p>
      <p style={{ fontSize: 14, color: textMuted, margin: '0 0 24px' }}>{t('success.body')}</p>
      {!clientHasTelegram && (telegramLink || viberLink) && (
        <div style={{ border: '0.5px solid #E8E0D8', borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'left' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#2D2926', margin: '0 0 4px' }}>{t('success.optInHeading')}</p>
          <p style={{ fontSize: 12, color: '#9A8E85', margin: '0 0 12px' }}>{t('success.optInSub')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {telegramLink && <a href={telegramLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--brand)', color: 'white', fontSize: 14, fontWeight: 500, padding: '11px 16px', borderRadius: 10, textDecoration: 'none' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><title>Telegram</title><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" /></svg>{t('success.telegramButton')}</a>}
            {viberLink && <a href={viberLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--brand)', color: 'white', fontSize: 14, fontWeight: 500, padding: '11px 16px', borderRadius: 10, textDecoration: 'none' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><title>Viber</title><path d="M11.983.02C8.764.02 3.14 1.016.824 7.236c-.9 2.38-.9 4.944-.9 6.764v.02c0 2.62.44 5.04 1.72 6.72C2.9 22.22 4.74 23 7.4 23h.12c.6 0 1.2-.08 1.68-.28.08-.04.12-.12.12-.2v-2.16c0-.12-.08-.2-.2-.2-.04 0-.12 0-.16.04-.64.28-1.28.36-1.96.36-1.88 0-3.04-.6-3.72-1.84-.6-1.12-.76-2.6-.76-4.36v-.02c0-1.6.04-3.88.72-5.84 1.84-5.08 6.56-5.76 8.76-5.76h.04c2.2 0 6.92.68 8.76 5.76.68 1.96.72 4.24.72 5.84v.02c0 1.76-.16 3.24-.76 4.36-.68 1.24-1.84 1.84-3.72 1.84-.68 0-1.32-.08-1.96-.36-.04-.04-.12-.04-.16-.04-.12 0-.2.08-.2.2v2.16c0 .08.04.16.12.2.48.2 1.08.28 1.68.28h.12c2.66 0 4.5-.78 5.76-2.26 1.28-1.68 1.72-4.1 1.72-6.72v-.02c0-1.82 0-4.38-.9-6.76C20.86 1.016 15.224.02 12.004.02h-.02z" /></svg>{t('success.viberButton')}</a>}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href={buildGCalUrl({ businessName: business.name, serviceName: service?.name ?? '', employeeName, date, time: time ?? '', durationMin: service?.duration_min ?? 60, timezone: business.timezone ?? null, address: business.address ?? null })} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', border: '0.5px solid #E8E0D8', borderRadius: 10, padding: '11px 20px', fontSize: 14, color: '#2D2926', textDecoration: 'none', fontWeight: 500 }}><CalendarPlus style={{ width: 16, height: 16 }} />Add to Google Calendar</a>
        <button type="button" onClick={onReset} style={{ background: 'white', border: '0.5px solid #E8E0D8', borderRadius: 10, padding: '11px 20px', fontSize: 14, color: '#2D2926', cursor: 'pointer', fontWeight: 500 }}>{t('success.bookAnother')}</button>
      </div>
    </div>
  )
}

function hasEmployeeStepForLocation(employees: Employee[], selectedLocation: string | null): boolean {
  const visible = selectedLocation ? employees.filter((e) => !e.location_id || e.location_id === selectedLocation) : employees
  return visible.length > 1
}

function GuestBlockedView({ business, cardBg, cardText, cardMuted, isEsc, theme: _theme }: { business: Business; cardBg: string; cardText: string; cardMuted: string; isEsc: boolean; theme?: string }) {
  return (
    <div style={{ background: cardBg, border: isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8', borderRadius: isEsc ? 0 : 12, padding: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: cardText, marginBottom: 8 }}>Debes registrarte para reservar</h3>
      <p style={{ fontSize: 13, color: cardMuted, marginBottom: 16 }}>Este negocio solo permite reservas a clientes registrados.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href={`/client/login?redirect=/book/${business.slug}`} style={{ display: 'block', textAlign: 'center', background: isEsc ? '#C5A059' : 'var(--brand)', color: isEsc ? '#000' : 'white', padding: '12px', borderRadius: isEsc ? 0 : 10, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>Iniciar sesión</a>
        <a href={`/client/register?redirect=/book/${business.slug}`} style={{ display: 'block', textAlign: 'center', background: 'white', border: '0.5px solid #E8E0D8', color: '#2D2926', padding: '12px', borderRadius: isEsc ? 0 : 10, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>Crear cuenta</a>
      </div>
    </div>
  )
}

function BookingSteps({ step, services, business, employees, selectedService, selectedLocation, locations, hasMultipleLocations, setSelectedLocation, setSelectedService, handleSelectService, handleSelectEmployee, handleBackFromEmployee, handleBackFromDatetime, handleDatetimeContinue, date, time, availableSlots, slotSpotsLeft, loadingSlots, dayClosed, holidayDates, slotTakenError, bookingError, closedWeekdays, today, formatSlot, theme, t, cardText, cardMuted, isEsc, contact, setContact, promoCode, setPromoCode, loyaltyPoints, setLoyaltyPoints, setMembershipId, loyaltyBalance, submit, joinWaitlist, saving, waitlistJoinLoading, waitlistJoined, selectedEmployee, setDate, setTime, setSlotTakenError, setStep, membershipId: _membershipId }: {
  step: Step; services: Service[]; business: Business; employees: Employee[]; selectedService: Service | null; selectedLocation: string | null; locations: Location[]; hasMultipleLocations: boolean; setSelectedLocation: (v: string | null) => void; setSelectedService: (s: Service | null) => void; handleSelectService: (s: Service) => void; handleSelectEmployee: (id: string) => void; handleBackFromEmployee: () => void; handleBackFromDatetime: () => void; handleDatetimeContinue: () => void; date: string; time: string; availableSlots: string[]; slotSpotsLeft: Record<string, number>; loadingSlots: boolean; dayClosed: boolean; holidayDates: string[]; slotTakenError: boolean; bookingError: string | null; closedWeekdays: number[]; today: string; formatSlot: (s: string) => string; theme?: string; t: (k: string, o?: unknown) => string; cardText: string; cardMuted: string; isEsc: boolean; contact: { name: string; phone: string; email: string }; setContact: (c: (prev: { name: string; phone: string; email: string }) => { name: string; phone: string; email: string }) => void; promoCode: string; setPromoCode: (s: string) => void; loyaltyPoints: string; setLoyaltyPoints: (s: string) => void; setMembershipId: (s: string) => void; loyaltyBalance: number | null; submit: () => void; joinWaitlist: () => void; saving: boolean; waitlistJoinLoading: boolean; waitlistJoined: boolean; selectedEmployee: string; setDate: (s: string) => void; setTime: (s: string) => void; setSlotTakenError: (b: boolean) => void; setStep: (s: Step) => void; membershipId?: string
}) {
  const selectedEmployeeObj = employees.find((e) => e.id === selectedEmployee) ?? null
  if (step === 'service') return <ServiceSelectionStep services={services} business={business} onSelect={handleSelectService} theme={theme} hasMultipleLocations={hasMultipleLocations} locations={locations} selectedLocation={selectedLocation} setSelectedLocation={setSelectedLocation} selectedService={selectedService} setSelectedService={setSelectedService} />
  if (step === 'employee' && selectedService) return <EmployeeSelectionStep service={selectedService} employees={employees} selectedLocation={selectedLocation} onSelect={handleSelectEmployee} onBack={handleBackFromEmployee} theme={theme} />
  if (step === 'datetime' && selectedService) return <DateTimeSelectionStep service={selectedService} employeeName={selectedEmployeeObj?.name ?? null} date={date} time={time} onDateChange={(v) => { setDate(v); setSlotTakenError(false) }} onTimeSelect={(ts) => { setTime(ts); setSlotTakenError(false) }} availableSlots={availableSlots} slotSpotsLeft={slotSpotsLeft} loadingSlots={loadingSlots} dayClosed={dayClosed} holidayDates={holidayDates} slotTakenError={slotTakenError} bookingError={bookingError} onContinue={handleDatetimeContinue} onBack={handleBackFromDatetime} closedWeekdays={closedWeekdays} today={today} formatSlot={formatSlot} theme={theme} t={t} cardText={cardText} cardMuted={cardMuted} isEsc={isEsc} onJoinWaitlistFromDatetime={() => setStep('contact')} />
  if (step === 'contact') return <div><BackLink label={t('contact.back')} onClick={() => setStep('datetime')} theme={theme} /><StepBadge label={isEsc ? 'Tus datos' : 'Your details'} theme={theme} /><SectionTitle text={t('contact.heading')} theme={theme} /><ContactFormStep contact={contact} setContact={setContact as never} promoCode={promoCode} setPromoCode={setPromoCode} loyaltyPoints={loyaltyPoints} setLoyaltyPoints={setLoyaltyPoints} setMembershipId={setMembershipId} loyaltyBalance={loyaltyBalance} onSubmit={submit} onJoinWaitlist={joinWaitlist} saving={saving} waitlistJoinLoading={waitlistJoinLoading} waitlistJoined={waitlistJoined} bookingError={bookingError} date={date} time={time} business={business} selectedService={selectedService} formatSlot={formatSlot} t={t} cardText={cardText} cardMuted={cardMuted} isEsc={isEsc} inputBg={isEsc ? '#1c1b1b' : 'white'} inputBorder={isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8'} inputRadius={isEsc ? 0 : 10} /></div>
  return null
}

// ── Main component (thin, <20) ───────────────────────────────────────────

export function PublicBookingForm({ business, services, employees, workingHours, locations = [], telegramBotUsername, viberBotUri, initialServiceId, initialEmployeeId, theme = 'default' }: Props) {
  const supabase = createClient()
  const t = useTranslations('publicBooking')
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const isEsc = theme === 'escuderia'
  const initialSvc = initialServiceId ? (services.find((s) => s.id === initialServiceId) ?? null) : null
  const [step, setStep] = useState<Step>(initialSvc ? (employees.length > 1 ? 'employee' : 'datetime') : 'service')
  const [selectedService, setSelectedService] = useState<Service | null>(initialSvc)
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployeeId ?? '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [loyaltyPoints, setLoyaltyPoints] = useState('')
  const [membershipId, setMembershipId] = useState('')
  const [loyaltyBalance] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [slotTakenError, setSlotTakenError] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientHasTelegram, setClientHasTelegram] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotSpotsLeft, setSlotSpotsLeft] = useState<Record<string, number>>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [dayClosed, setDayClosed] = useState(false)
  const [holidayDates, setHolidayDates] = useState<string[]>([])
  const [, setHolidaysForLocation] = useState<{ date: string; location_id: string | null; is_open: boolean }[]>([])
  const [waitlistJoinLoading, setWaitlistJoinLoading] = useState(false)
  const [waitlistJoined, setWaitlistJoined] = useState(false)
  const effectiveHours: DayHours[] = useMemo(() => computeEffectiveHours(workingHours), [workingHours])
  const hasMultipleLocations = locations.length > 1
  const closedWeekdays = effectiveHours.filter((h) => !h.is_open).map((h) => h.day_of_week)
  const minAdvance = business.min_advance_minutes ?? DEFAULT_LEAD_MINUTES
  const leadEnabled = business.booking_lead_time_enabled ?? true
  const allowGuestBookings = business.allow_guest_bookings ?? true
  const todayStr = useMemo(() => todayInBusinessTzLib(business.timezone ?? 'UTC', new Date()), [business.timezone])
  const [today, setToday] = useState(todayStr)
  useEffect(() => setToday(todayInBusinessTzLib(business.timezone ?? 'UTC', new Date())), [business.timezone])
  const nowMin = useMemo(() => nowMinutesInBusinessTzLib(business.timezone ?? 'UTC', new Date()), [business.timezone])

  // Holidays
  useEffect(() => {
    let cancelled = false
    async function fetchHolidays(): Promise<void> {
      try {
        const url = selectedLocation ? `/api/holidays?business_id=${business.id}&location_id=${selectedLocation}` : `/api/holidays?business_id=${business.id}`
        const res = await fetch(url)
        if (!res.ok) return
        const json: unknown = await res.json()
        const rows: HolidayRow[] = Array.isArray(json) ? (json as HolidayRow[]).filter((h): h is HolidayRow => isRecord(h) && typeof h['date'] === 'string' && typeof h['is_open'] === 'boolean' && (typeof h['location_id'] === 'string' || h['location_id'] === null)) : []
        if (cancelled) return
        const closed = rows.filter((h) => h.is_open === false)
        setHolidaysForLocation(closed)
        setHolidayDates(closed.map((h) => h.date.slice(0, 10)))
      } catch {}
    }
    void fetchHolidays()
    return () => { cancelled = true }
  }, [business.id, selectedLocation])

  // Auth
  useEffect(() => {
    let cancelled = false
    async function checkAuth(): Promise<void> {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        if (user) {
          setAuthUser({ id: user.id, email: user.email ?? null })
          const { data: linkedClient } = await supabase.from('clients').select('name, phone, email').eq('business_id', business.id).eq('user_id', user.id).maybeSingle()
          if (cancelled) return
          if (linkedClient) setContact((prev) => ({ name: (linkedClient as { name: string }).name ?? prev.name ?? ((user.user_metadata as Record<string, unknown>)?.name as string) ?? user.email?.split('@')[0] ?? '', phone: (linkedClient as { phone: string | null }).phone ?? prev.phone ?? user.phone ?? '', email: (linkedClient as { email: string | null }).email ?? prev.email ?? user.email ?? '' }))
          else setContact((prev) => ({ name: prev.name || ((user.user_metadata as Record<string, unknown>)?.name as string) || user.email?.split('@')[0] || '', phone: prev.phone || (user.phone ?? ''), email: prev.email || user.email || '' }))
        } else setAuthUser(null)
      } catch { setAuthUser(null) } finally { if (!cancelled) setAuthChecked(true) }
    }
    void checkAuth()
    return () => { cancelled = true }
  }, [business.id, supabase])

  const loadSlots = useCallback(async (selectedDate: string, svc: Service, employeeId: string): Promise<void> => {
    setLoadingSlots(true)
    setDayClosed(false)
    setAvailableSlots([])
    setTime('')
    if (holidayDates.includes(selectedDate)) { setDayClosed(true); setLoadingSlots(false); return }
    const tzDow = getTzDow(selectedDate, business.timezone ?? 'UTC')
    const dayHours = effectiveHours.find((h) => h.day_of_week === tzDow)
    if (!dayHours?.is_open) { setDayClosed(true); setLoadingSlots(false); return }
    let slots = generateSlotsMemo(dayHours.open_time, dayHours.close_time, svc.duration_min)
    slots = filterSlotsByBreak(slots, dayHours, svc.duration_min)
    slots = filterSlotsByToday(slots, today, selectedDate, nowMin, minAdvance, leadEnabled)
    const capacity = svc.capacity ?? 1
    try {
      const { data: booked } = await supabase.rpc('get_booked_slots', { p_business_id: business.id, p_date: selectedDate, p_employee_id: capacity > 1 ? null : employeeId || null })
      const { filtered, spotsMap } = computeAvailableSlotsWithCapacity(slots, booked as { starts_at: string; ends_at: string }[] | null, capacity, svc, business.timezone ?? 'UTC')
      setAvailableSlots(filtered)
      setSlotSpotsLeft(spotsMap)
    } catch {
      const spotsMap: Record<string, number> = {}
      slots.forEach((slot) => { spotsMap[slot] = capacity })
      setAvailableSlots(slots)
      setSlotSpotsLeft(spotsMap)
    }
    setLoadingSlots(false)
  }, [business.id, business.timezone, effectiveHours, holidayDates, supabase, today, nowMin, minAdvance, leadEnabled])

  useEffect(() => {
    if (!date || !selectedService) { setAvailableSlots([]); setDayClosed(false); return }
    void loadSlots(date, selectedService, selectedEmployee)
  }, [date, selectedService, selectedEmployee, loadSlots])

  const joinWaitlist = useCallback(async (): Promise<void> => {
    if (!selectedService || !date || !contact.name) { setBookingError('Completá nombre y elegí fecha/horario para unirte a la lista'); return }
    if (!contact.phone && !contact.email) { setBookingError('Dejá teléfono o email para que te avisemos'); return }
    setWaitlistJoinLoading(true)
    setBookingError(null)
    try {
      let cid: string | null = clientId
      if (!cid) {
        const { data: existing } = await supabase.from('clients').select('id').eq('business_id', business.id).or(`phone.eq.${contact.phone},email.eq.${contact.email}`).maybeSingle()
        const existingTyped: { id: string } | null = existing as { id: string } | null
        if (existingTyped) cid = existingTyped.id
        else {
          const { data: newClient } = await supabase.from('clients').insert({ business_id: business.id, name: contact.name, phone: contact.phone || null, email: contact.email || null }).select('id').single()
          const newTyped: { id: string } | null = newClient as { id: string } | null
          if (newTyped) cid = newTyped.id
        }
      }
      if (!cid) throw new Error('No se pudo crear cliente')
      const desiredTime = time || '10:00'
      const tz = business.timezone ?? 'America/Bogota'
      const { parseDateTimeInTz } = await import('@/lib/booking-availability')
      const desiredAt = parseDateTimeInTz(date, desiredTime, tz).toISOString()
      const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id, location_id: selectedLocation || null, service_id: selectedService.id, employee_id: selectedEmployee || null, client_id: cid, desired_at: desiredAt }) })
      const body: unknown = await res.json().catch(() => ({}) as unknown)
      if (!res.ok) throw new Error(extractErrorMessage(body) ?? `HTTP ${res.status}`)
      setWaitlistJoined(true)
      setBookingError(null)
    } catch (e) { setBookingError(String((e as Error).message)) } finally { setWaitlistJoinLoading(false) }
  }, [selectedService, date, contact, clientId, supabase, business.id, business.timezone, time, selectedLocation, selectedEmployee])

  const submit = useCallback(async (): Promise<void> => {
    if (!selectedService || !date || !time || !contact.name) return
    const contactErr = validateContactFields(contact)
    if (contactErr) { setBookingError(contactErr); return }
    const timeErr = validateBookingTime(date, time, today, nowMin, minAdvance, leadEnabled)
    if (timeErr) { setBookingError(timeErr); return }
    setSaving(true)
    setSlotTakenError(false)
    setBookingError(null)
    try {
      const res = await fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: business.id, serviceId: selectedService.id, employeeId: selectedEmployee || null, location_id: selectedLocation || null, date, time, name: contact.name, phone: contact.phone || null, email: contact.email || null, promo_code: promoCode.trim() || null, loyalty_redeem_points: loyaltyPoints ? Number(loyaltyPoints) : null, membership_id: membershipId || null }) })
      const reload = () => { if (selectedService) void loadSlots(date, selectedService, selectedEmployee) }
      const handled = await handleBookingResponse(res, { setBookingError, setSlotTakenError, setTime, setStep, loadSlots: reload, t: (k: string) => String(t(k as never)), minAdvance })
      if (handled.handled) { setSaving(false); return }
      const data: unknown = handled.data
      const clientIdVal: string | null = isRecord(data) && typeof data['clientId'] === 'string' ? (data['clientId'] as string) : null
      const hasTelegramVal: boolean = isRecord(data) && typeof data['hasTelegram'] === 'boolean' ? (data['hasTelegram'] as boolean) : false
      setClientId(clientIdVal)
      setClientHasTelegram(hasTelegramVal)
      setStep('done')
      setSaving(false)
    } catch { setSaving(false); setBookingError('Something went wrong. Please try again or contact the business directly.') }
  }, [selectedService, date, time, contact, today, nowMin, minAdvance, leadEnabled, business.id, selectedEmployee, selectedLocation, promoCode, loyaltyPoints, membershipId, loadSlots, t])

  const handleSelectService = useCallback((s: Service) => { setSelectedService(s); setStep(hasEmployeeStepForLocation(employees, selectedLocation) ? 'employee' : 'datetime') }, [employees, selectedLocation])
  const handleSelectEmployee = useCallback((id: string) => { setSelectedEmployee(id); setStep('datetime') }, [])
  const handleBackFromEmployee = useCallback(() => setStep('service'), [])
  const handleBackFromDatetime = useCallback(() => setStep(hasEmployeeStepForLocation(employees, selectedLocation) ? 'employee' : 'service'), [employees, selectedLocation])
  const handleDatetimeContinue = useCallback(() => {
    if (authUser && contact.name && (contact.phone || contact.email)) void submit()
    else setStep('contact')
  }, [authUser, contact, submit])
  const resetAll = useCallback(() => {
    setStep('service'); setSelectedService(null); setSelectedEmployee(''); setDate(''); setTime(''); setContact({ name: '', phone: '', email: '' }); setPromoCode(''); setLoyaltyPoints(''); setMembershipId(''); setAvailableSlots([]); setClientId(null); setClientHasTelegram(false); setBookingError(null)
  }, [])
  const [locale, setLocale] = useState('en-US')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setLocale(navigator.language); setMounted(true) }, [])
  const is12h = uses12HourClock(mounted ? locale : 'en-US')
  const formatSlot = useCallback((slot: string): string => {
    const [h, m] = slot.split(':').map(Number)
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: is12h }).format(new Date(2000, 0, 1, h, m))
  }, [locale, is12h])
  const selectedEmployeeObj = employees.find((e) => e.id === selectedEmployee) ?? null
  const cardText = isEsc ? '#e5e2e1' : '#2D2926'
  const cardMuted = isEsc ? '#d0c5b9' : '#9A8E85'
  const cardBg = isEsc ? '#121212' : 'white'
  if (step === 'done') return <DoneScreen business={business} service={selectedService} date={date} time={time} employeeName={selectedEmployeeObj?.name ?? null} clientId={clientId} telegramBotUsername={telegramBotUsername} viberBotUri={viberBotUri} clientHasTelegram={clientHasTelegram} onReset={resetAll} theme={theme} formatSlot={formatSlot} t={t as (k: string) => string} />
  if (!allowGuestBookings && authChecked && !authUser) return <GuestBlockedView business={business} theme={theme} cardBg={cardBg} cardText={cardText} cardMuted={cardMuted} isEsc={isEsc} />
  return <BookingSteps step={step} services={services} business={business} employees={employees} selectedService={selectedService} selectedLocation={selectedLocation} locations={locations} hasMultipleLocations={hasMultipleLocations} setSelectedLocation={setSelectedLocation} setSelectedService={setSelectedService} handleSelectService={handleSelectService} handleSelectEmployee={handleSelectEmployee} handleBackFromEmployee={handleBackFromEmployee} handleBackFromDatetime={handleBackFromDatetime} handleDatetimeContinue={handleDatetimeContinue} date={date} time={time} availableSlots={availableSlots} slotSpotsLeft={slotSpotsLeft} loadingSlots={loadingSlots} dayClosed={dayClosed} holidayDates={holidayDates} slotTakenError={slotTakenError} bookingError={bookingError} closedWeekdays={closedWeekdays} today={today} formatSlot={formatSlot} theme={theme} t={t as (k: string, o?: unknown) => string} cardText={cardText} cardMuted={cardMuted} isEsc={isEsc} contact={contact} setContact={setContact as never} promoCode={promoCode} setPromoCode={setPromoCode} loyaltyPoints={loyaltyPoints} setLoyaltyPoints={setLoyaltyPoints} membershipId={membershipId} setMembershipId={setMembershipId} loyaltyBalance={loyaltyBalance} submit={submit} joinWaitlist={joinWaitlist} saving={saving} waitlistJoinLoading={waitlistJoinLoading} waitlistJoined={waitlistJoined} selectedEmployee={selectedEmployee} setDate={setDate} setTime={setTime} setSlotTakenError={setSlotTakenError} setStep={setStep} />
}
