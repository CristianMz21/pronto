'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, uses12HourClock } from '@/lib/utils'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { buildGCalUrl } from '@/lib/gcal'
import { DatePicker } from '@/components/ui/date-picker'
import { useTranslations } from 'next-intl'
import { computeEffectiveHours, type DayHours } from '@/lib/booking-availability'

interface Service { id: string; name: string; description: string | null; price: number; duration_min: number; category: string | null; capacity: number }
interface Employee { id: string; name: string }
interface Business { id: string; name: string; currency: string; slug: string; timezone: string | null; address?: string | null }

interface Props {
  business: Business
  services: Service[]
  employees: Employee[]
  workingHours: DayHours[]
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
    slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`)
    cur += durationMin
  }
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
    <span style={{
      display: 'inline-block',
      background: theme === 'escuderia' ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)',
      color: theme === 'escuderia' ? '#C5A059' : 'var(--brand)',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
      padding: '3px 10px', borderRadius: theme === 'escuderia' ? 0 : 20, marginBottom: 10
    }}>
      {label.toUpperCase()}
    </span>
  )
}

function SectionTitle({ text, theme }: { text: string; theme?: string }) {
  return <h2 style={{ fontSize: 17, fontWeight: 500, color: theme === 'escuderia' ? '#e5e2e1' : '#2D2926', marginBottom: 14, marginTop: 0, fontFamily: theme === 'escuderia' ? 'var(--font-playfair)' : undefined }}>{text}</h2>
}

function BackLink({ label, onClick, theme }: { label: string; onClick: () => void; theme?: string }) {
  return (
    <button onClick={onClick} style={{ fontSize: 13, color: theme === 'escuderia' ? '#8E795E' : '#9A8E85', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      {label}
    </button>
  )
}

function CtaButton({ label, onClick, disabled, theme }: { label: string; onClick: () => void; disabled?: boolean; theme?: string }) {
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
        padding: '13px 20px', fontSize: 14, fontWeight: 500, letterSpacing: isEsc ? '0.1em' : undefined,
        width: '100%', marginTop: 16, cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function PublicBookingForm({ business, services, employees, workingHours, telegramBotUsername, viberBotUri, initialServiceId, initialEmployeeId, theme = 'default' }: Props) {
  const supabase = createClient()
  const t = useTranslations('publicBooking')

  const hasEmployeeStep = employees.length > 1
  const isEsc = theme === 'escuderia'
  const baseCard = getBaseCard(theme)

  const initialSvc = initialServiceId ? services.find(s => s.id === initialServiceId) ?? null : null
  const [step, setStep] = useState<Step>(initialSvc ? (hasEmployeeStep ? 'employee' : 'datetime') : 'service')
  const [selectedService, setSelectedService] = useState<Service | null>(initialSvc)
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployeeId ?? '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [slotTakenError, setSlotTakenError] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientHasTelegram, setClientHasTelegram] = useState(false)

  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotSpotsLeft, setSlotSpotsLeft] = useState<Record<string, number>>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [dayClosed, setDayClosed] = useState(false)

  const effectiveHours: DayHours[] = computeEffectiveHours(workingHours)

  const closedWeekdays = effectiveHours.filter((h) => !h.is_open).map((h) => h.day_of_week)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!date || !selectedService) {
      setAvailableSlots([])
      setDayClosed(false)
      return
    }
    loadSlots(date, selectedService, selectedEmployee)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, selectedService, selectedEmployee])

  async function loadSlots(selectedDate: string, svc: Service, employeeId: string) {
    setLoadingSlots(true)
    setDayClosed(false)
    setAvailableSlots([])
    setTime('')

    const dow = new Date(selectedDate + 'T00:00:00').getDay()
    const dayHours = effectiveHours.find((h) => h.day_of_week === dow)

    if (!dayHours || !dayHours.is_open) {
      setDayClosed(true)
      setLoadingSlots(false)
      return
    }

    let slots = generateSlots(dayHours.open_time, dayHours.close_time, svc.duration_min)

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
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes() + 30
      slots = slots.filter((slot) => {
        const [sh, sm] = slot.split(':').map(Number)
        return sh * 60 + sm > nowMin
      })
    }

    const capacity = svc.capacity ?? 1
    const spotsMap: Record<string, number> = {}

    try {
      const { data: booked } = await supabase.rpc('get_booked_slots', {
        p_business_id: business.id,
        p_date: selectedDate,
        p_employee_id: capacity > 1 ? null : (employeeId || null),
      })

      slots = slots.filter((slot) => {
        const [sh, sm] = slot.split(':').map(Number)
        const slotStartMin = sh * 60 + sm
        const slotEndMin = slotStartMin + svc.duration_min

        const bookedCount = (booked ?? []).filter(({ starts_at, ends_at }: { starts_at: string; ends_at: string }) => {
          const toBusinessMin = (iso: string) => {
            const tz = business.timezone ?? 'UTC'
            const parts = new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              hour: '2-digit', minute: '2-digit', hour12: false,
            }).formatToParts(new Date(iso))
            const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0')
            const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0')
            return (h % 24) * 60 + m
          }
          const bStartMin = toBusinessMin(starts_at)
          const bEndMin   = toBusinessMin(ends_at)
          return slotStartMin < bEndMin && slotEndMin > bStartMin
        }).length

        const spotsLeft = capacity - bookedCount
        if (spotsLeft > 0) {
          spotsMap[slot] = spotsLeft
          return true
        }
        return false
      })
    } catch {
      slots.forEach((slot) => { spotsMap[slot] = capacity })
    }

    setAvailableSlots(slots)
    setSlotSpotsLeft(spotsMap)
    setLoadingSlots(false)
  }

  async function submit() {
    if (!selectedService || !date || !time || !contact.name) return
    if (!contact.phone && !contact.email) {
      setBookingError('Please enter at least a phone number or email so we can confirm your booking.')
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
    setSaving(true)
    setSlotTakenError(false)
    setBookingError(null)

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId:  business.id,
          serviceId:   selectedService.id,
          employeeId:  selectedEmployee || null,
          date,
          time,
          name:  contact.name,
          phone: contact.phone || null,
          email: contact.email || null,
        }),
      })

      if (res.status === 409) {
        setSaving(false)
        const body = await res.json().catch(() => null)
        if (body?.error === 'no_staff_available') {
          // Not a real time conflict — retrying with a different slot won't help.
          setBookingError(t('noStaffAvailable'))
          return
        }
        setSlotTakenError(true)
        setTime('')
        setStep('datetime')
        if (selectedService) loadSlots(date, selectedService, selectedEmployee)
        return
      }

      if (res.status === 429) {
        setSaving(false)
        setBookingError('Too many booking attempts. Please wait a few minutes and try again.')
        return
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

  function handleBackFromEmployee() { setStep('service') }
  function handleBackFromDatetime() { setStep(hasEmployeeStep ? 'employee' : 'service') }

  function resetAll() {
    setStep('service')
    setSelectedService(null)
    setSelectedEmployee('')
    setDate('')
    setTime('')
    setContact({ name: '', phone: '', email: '' })
    setAvailableSlots([])
    setClientId(null)
    setClientHasTelegram(false)
    setBookingError(null)
  }

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  const is12h = uses12HourClock(locale)

  function formatSlot(slot: string): string {
    const [h, m] = slot.split(':').map(Number)
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: is12h,
    }).format(new Date(2000, 0, 1, h, m))
  }

  const selectedEmployeeObj = employees.find((e) => e.id === selectedEmployee) ?? null

  // ─── Done screen ──────────────────────────────────────────────────────────
  if (step === 'done') {
    const telegramLink = telegramBotUsername && clientId
      ? `https://t.me/${telegramBotUsername}?start=client_${clientId}`
      : null
    const viberLink = viberBotUri && clientId
      ? `viber://pa?chatURI=${viberBotUri}&context=client_${clientId}`
      : null

    const doneBg = isEsc ? '#121212' : 'white'
    const doneBorder = isEsc ? '1px solid rgba(197,160,89,0.2)' : '0.5px solid #E8E0D8'
    const doneRadius = isEsc ? 0 : 16
    const textPrimary = isEsc ? '#e5e2e1' : '#2D2926'
    const textMuted = isEsc ? '#d0c5b9' : '#9A8E85'

    return (
      <div style={{ background: doneBg, border: doneBorder, borderRadius: doneRadius, padding: '32px 24px', textAlign: 'center' }}>
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ margin: '0 auto 16px', display: 'block' }}>
          <circle cx="28" cy="28" r="27" stroke={isEsc ? '#C5A059' : 'var(--brand)'} strokeWidth="2" fill={isEsc ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)'} />
          <path d="M17 28L24 35L39 20" stroke={isEsc ? '#C5A059' : 'var(--brand)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <h2 style={{ fontSize: 20, fontWeight: 500, color: textPrimary, margin: '0 0 8px', fontFamily: isEsc ? 'var(--font-playfair)' : undefined }}>{t('success.heading')}</h2>
        <p style={{ fontSize: 14, color: textMuted, margin: '0 0 4px' }}>
          {selectedService?.name} · {date} at {time ? formatSlot(time) : ''}
          {selectedEmployeeObj && ` · ${selectedEmployeeObj.name}`}
        </p>
        <p style={{ fontSize: 14, color: textMuted, margin: '0 0 24px' }}>{t('success.body')}</p>

        {/* Messenger opt-in — hidden if client already has Telegram connected */}
        {!clientHasTelegram && (telegramLink || viberLink) && (
          <div style={{ border: '0.5px solid #E8E0D8', borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'left' }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#2D2926', margin: '0 0 4px' }}>{t('success.optInHeading')}</p>
            <p style={{ fontSize: 12, color: '#9A8E85', margin: '0 0 12px' }}>{t('success.optInSub')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {telegramLink && (
                <a href={telegramLink} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--brand)', color: 'white', fontSize: 14, fontWeight: 500, padding: '11px 16px', borderRadius: 10, textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" /></svg>
                  {t('success.telegramButton')}
                </a>
              )}
              {viberLink && (
                <a href={viberLink} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--brand)', color: 'white', fontSize: 14, fontWeight: 500, padding: '11px 16px', borderRadius: 10, textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.983.02C8.764.02 3.14 1.016.824 7.236c-.9 2.38-.9 4.944-.9 6.764v.02c0 2.62.44 5.04 1.72 6.72C2.9 22.22 4.74 23 7.4 23h.12c.6 0 1.2-.08 1.68-.28.08-.04.12-.12.12-.2v-2.16c0-.12-.08-.2-.2-.2-.04 0-.12 0-.16.04-.64.28-1.28.36-1.96.36-1.88 0-3.04-.6-3.72-1.84-.6-1.12-.76-2.6-.76-4.36v-.02c0-1.6.04-3.88.72-5.84 1.84-5.08 6.56-5.76 8.76-5.76h.04c2.2 0 6.92.68 8.76 5.76.68 1.96.72 4.24.72 5.84v.02c0 1.76-.16 3.24-.76 4.36-.68 1.24-1.84 1.84-3.72 1.84-.68 0-1.32-.08-1.96-.36-.04-.04-.12-.04-.16-.04-.12 0-.2.08-.2.2v2.16c0 .08.04.16.12.2.48.2 1.08.28 1.68.28h.12c2.66 0 4.5-.78 5.76-2.26 1.28-1.68 1.72-4.1 1.72-6.72v-.02c0-1.82 0-4.38-.9-6.76C20.86 1.016 15.224.02 12.004.02h-.02z" /></svg>
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
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', border: '0.5px solid #E8E0D8', borderRadius: 10, padding: '11px 20px', fontSize: 14, color: '#2D2926', textDecoration: 'none', fontWeight: 500 }}
          >
            <CalendarPlus style={{ width: 16, height: 16 }} />
            Add to Google Calendar
          </a>
          <button onClick={resetAll}
            style={{ background: 'white', border: '0.5px solid #E8E0D8', borderRadius: 10, padding: '11px 20px', fontSize: 14, color: '#2D2926', cursor: 'pointer', fontWeight: 500 }}>
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

  return (
    <div>

      {/* ── Step 1: Service ───────────────────────────────────────────────── */}
      {step === 'service' && (
        <div>
          <StepBadge label="Seleccionar servicio" theme={theme} />
          <SectionTitle text={t('selectService.heading')} theme={theme} />
          {services.length === 0 ? (
            <p style={{ fontSize: 14, color: cardMuted }}>{t('selectService.empty')}</p>
          ) : (
            services.map((s) => (
              <button key={s.id} onClick={() => handleSelectService(s)} style={baseCard}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: cardText }}>{s.name}</div>
                  {s.description && <div style={{ fontSize: 12, color: cardMuted, marginTop: 2 }}>{s.description}</div>}
                  <div style={{ fontSize: 12, color: cardMuted, marginTop: 2 }}>{t('selectService.minutes', { duration: s.duration_min })}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: isEsc ? '#C5A059' : 'var(--brand)', flexShrink: 0, marginLeft: 12 }}>
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
          <BackLink label={t('selectEmployee.back')} onClick={handleBackFromEmployee} theme={theme} />
          <StepBadge label="Elegir especialista" theme={theme} />
          <SectionTitle text={t('selectEmployee.heading')} theme={theme} />
          <p style={{ fontSize: 13, color: cardMuted, marginTop: -8, marginBottom: 14 }}>{selectedService.name}</p>

          <button onClick={() => handleSelectEmployee('')} style={{ ...baseCard, borderStyle: 'dashed', background: isEsc ? '#1c1b1b' : baseCard.background }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: isEsc ? '#2a2a2a' : '#F0EBE6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 18, color: isEsc ? '#8E795E' : '#9A8E85' }}>?</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: cardMuted }}>{t('selectEmployee.anyone')}</span>
            </div>
          </button>

          {employees.map((e) => (
            <button key={e.id} onClick={() => handleSelectEmployee(e.id)} style={baseCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: isEsc ? 'rgba(197,160,89,0.15)' : 'var(--brand-light)', color: isEsc ? '#C5A059' : 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
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
            <div style={{ marginBottom: 16, padding: 12, background: isEsc ? '#1c1b1b' : '#FFF8ED', border: isEsc ? '1px solid rgba(197,160,89,0.3)' : '0.5px solid #F5C842', borderRadius: isEsc ? 0 : 10, fontSize: 13, color: isEsc ? '#C5A059' : '#7A5C00' }}>
              ⚠ Este horario acaba de ser reservado. Elige otro.
            </div>
          )}

          <p style={{ fontSize: 13, color: cardMuted, marginTop: -8, marginBottom: 16 }}>
            {selectedService.name} · {selectedService.duration_min} min
            {selectedEmployeeObj && ` · ${selectedEmployeeObj.name}`}
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 6, display: 'block' }}>{t('datetime.dateLabel')}</label>
            <DatePicker
              value={date}
              onChange={(v) => { setDate(v); setSlotTakenError(false) }}
              className="mt-1"
              minDate={today}
              disabledWeekdays={closedWeekdays}
            />
          </div>

          {date && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 6, display: 'block' }}>{t('datetime.timeLabel')}</label>
              {loadingSlots ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: cardMuted }}>
                  <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                  Cargando horarios...
                </div>
              ) : dayClosed ? (
                <div style={{ padding: 12, background: isEsc ? '#1c1b1b' : '#F5F0EB', border: isEsc ? '1px solid #353534' : 'none', borderRadius: isEsc ? 0 : 10, fontSize: 14, color: cardMuted }}>
                  Fuera de horario. Elige otro día.
                </div>
              ) : availableSlots.length === 0 ? (
                <div style={{ padding: 12, background: isEsc ? '#1c1b1b' : '#F5F0EB', border: isEsc ? '1px solid #353534' : 'none', borderRadius: isEsc ? 0 : 10, fontSize: 14, color: cardMuted }}>
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
                      <button key={ts} onClick={() => { setTime(ts); setSlotTakenError(false) }}
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
                        }}>
                        <div>{formatSlot(ts)}</div>
                        {isPartial && (
                          <div style={{ fontSize: 10, color: isSelected ? (isEsc ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)') : isEsc ? '#C5A059' : 'var(--brand)', marginTop: 2 }}>
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

          <CtaButton label={isEsc ? 'Continuar →' : t('datetime.continue')} onClick={() => setStep('contact')} disabled={!date || !time} theme={theme} />
        </div>
      )}

      {/* ── Step 4: Contact ───────────────────────────────────────────────── */}
      {step === 'contact' && (
        <div>
          <BackLink label={t('contact.back')} onClick={() => setStep('datetime')} theme={theme} />
          <StepBadge label={isEsc ? 'Tus datos' : 'Your details'} theme={theme} />
          <SectionTitle text={t('contact.heading')} theme={theme} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {([
              { key: 'name' as const, label: t('contact.nameLabel'), placeholder: t('contact.namePlaceholder'), type: 'text' },
              { key: 'phone' as const, label: t('contact.phoneLabel'), placeholder: t('contact.phonePlaceholder'), type: 'tel' },
              { key: 'email' as const, label: t('contact.emailLabel'), placeholder: t('contact.emailPlaceholder'), type: 'email' },
            ] as const).map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label style={{ fontSize: 13, fontWeight: 500, color: cardText, marginBottom: 6, display: 'block' }}>{label}</label>
                <input
                  type={type}
                  value={contact[key]}
                  onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ border: inputBorder, borderRadius: inputRadius, padding: '11px 14px', fontSize: 14, color: cardText, width: '100%', background: inputBg, outline: 'none', boxSizing: 'border-box', minHeight: '44px' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = isEsc ? '#C5A059' : 'var(--brand)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = isEsc ? 'rgba(197,160,89,0.2)' : '#E8E0D8' }}
                />
              </div>
            ))}
          </div>

          {bookingError && (
            <div style={{ marginTop: 16, padding: 12, background: isEsc ? '#1c1b1b' : '#FFF0F0', border: isEsc ? '1px solid #93000a' : '0.5px solid #F5AAAA', borderRadius: isEsc ? 0 : 10, fontSize: 13, color: isEsc ? '#ffb4ab' : '#B00020' }}>
              {bookingError}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!contact.name || saving}
            style={{
              background: (!contact.name || saving) ? (isEsc ? '#353534' : '#C4BAB3') : isEsc ? '#C5A059' : 'var(--brand)',
              color: (!contact.name || saving) ? (isEsc ? '#8E795E' : 'white') : isEsc ? '#000' : 'white',
              border: isEsc ? '1px solid #C5A059' : 'none',
              borderRadius: isEsc ? 0 : 10,
              padding: '13px 20px',
              fontSize: 14, fontWeight: 500, letterSpacing: isEsc ? '0.1em' : undefined,
              width: '100%', marginTop: 16, cursor: (!contact.name || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? t('contact.booking') : t('contact.confirm', { price: formatCurrency(selectedService?.price ?? 0, business.currency) })}
          </button>
          <p style={{ fontSize: 11, color: cardMuted, textAlign: 'center', marginTop: 12 }}>{t('contact.noRegistration')}</p>
        </div>
      )}

    </div>
  )
}
