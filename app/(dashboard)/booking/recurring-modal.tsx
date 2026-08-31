'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { isRecord } from '@/lib/supabase/typed'

interface Props {
  open: boolean
  onClose: () => void
  businessId: string
  timezone: string
  clients: { id: string; name: string }[]
  services: { id: string; name: string; duration_min: number; price: number }[]
  employees: { id: string; name: string }[]
  locations?: { id: string; name: string }[]
  initialDate?: string | undefined
  initialTime?: string | undefined
  initialServiceId?: string | undefined
  initialEmployeeId?: string | undefined
  onCreated?: (result: { id: string; created: number; skipped: unknown[] }) => void
}

function buildRRule(opts: {
  freq: string
  interval: number
  count?: number
  until?: string
  byday?: string[]
  byhour?: number
  byminute?: number
}): string {
  const parts = [`FREQ=${opts.freq}`, `INTERVAL=${opts.interval}`]
  if (opts.count) parts.push(`COUNT=${opts.count}`)
  if (opts.until) {
    // UNTIL must be UTC Zulu: YYYYMMDDTHHmmssZ
    const d = new Date(opts.until)
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mi = String(d.getUTCMinutes()).padStart(2, '0')
    const ss = String(d.getUTCSeconds()).padStart(2, '0')
    parts.push(`UNTIL=${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`)
  }
  if (opts.byday && opts.byday.length > 0) parts.push(`BYDAY=${opts.byday.join(',')}`)
  // rrule lib handles BYHOUR/BYMINUTE via dtstart, but we keep simple
  return parts.join(';')
}

export function RecurringModal({
  open,
  onClose,
  businessId,
  timezone,
  clients,
  services,
  employees,
  locations = [],
  initialDate,
  initialTime,
  initialServiceId,
  initialEmployeeId,
  onCreated,
}: Props) {
  const [clientId, setClientId] = useState('')
  const [serviceId, setServiceId] = useState(initialServiceId ?? '')
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? '')
  const [locationId, setLocationId] = useState('')
  const [date, setDate] = useState(initialDate ?? '')
  const [time, setTime] = useState(initialTime ?? '10:00')
  const [freq, setFreq] = useState('WEEKLY')
  const [interval, setInterval] = useState(1)
  const [count, setCount] = useState(6)
  const [until, setUntil] = useState('')
  const [byday, setByday] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    created: number
    skipped: { reason: string; starts_at: string }[]
    id: string
  } | null>(null)

  useEffect(() => {
    if (open) {
      setServiceId(initialServiceId ?? '')
      setEmployeeId(initialEmployeeId ?? '')
      setDate(initialDate ?? '')
      setTime(initialTime ?? '10:00')
      setError(null)
      setResult(null)
    }
  }, [open, initialServiceId, initialEmployeeId, initialDate, initialTime])

  if (!open) return null

  const rrulePreview = buildRRule({
    freq,
    interval,
    ...(until ? {} : { count }),
    ...(until ? { until } : {}),
    byday,
  })

  async function submit(): Promise<void> {
    if (!clientId || !serviceId || !date || !time) {
      setError('Cliente, servicio, fecha y hora son requeridos')
      return
    }
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          location_id: locationId || null,
          client_id: clientId,
          service_id: serviceId,
          employee_id: employeeId || null,
          rrule: rrulePreview,
          date,
          time,
          until: until ? new Date(until).toISOString() : null,
        }),
      })
      const body: unknown = await res.json().catch(() => ({}) as unknown)
      if (!res.ok) {
        const message =
          isRecord(body) && typeof body['message'] === 'string'
            ? (body['message'] as string)
            : isRecord(body) && typeof body['error'] === 'string'
              ? (body['error'] as string)
              : `HTTP ${res.status}`
        throw new Error(message)
      }
      if (
        isRecord(body) &&
        typeof body['id'] === 'string' &&
        typeof body['created'] === 'number' &&
        Array.isArray(body['skipped'])
      ) {
        const typed = body as unknown as {
          id: string
          created: number
          skipped: { reason: string; starts_at: string }[]
        }
        setResult(typed)
        onCreated?.(typed as { id: string; created: number; skipped: unknown[] })
      } else if (isRecord(body)) {
        // Fallback: treat any record as result shape when API returns loosely typed success
        const fallback: {
          id: string
          created: number
          skipped: { reason: string; starts_at: string }[]
        } = {
          id: typeof body['id'] === 'string' ? (body['id'] as string) : '',
          created: typeof body['created'] === 'number' ? (body['created'] as number) : 0,
          skipped: Array.isArray(body['skipped'])
            ? (body['skipped'] as { reason: string; starts_at: string }[])
            : [],
        }
        setResult(fallback)
        onCreated?.(fallback as { id: string; created: number; skipped: unknown[] })
      }
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setSaving(false)
    }
  }

  const days = [
    { v: 'MO', l: 'Lun' },
    { v: 'TU', l: 'Mar' },
    { v: 'WE', l: 'Mié' },
    { v: 'TH', l: 'Jue' },
    { v: 'FR', l: 'Vie' },
    { v: 'SA', l: 'Sáb' },
    { v: 'SU', l: 'Dom' },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarRepeat className="w-5 h-5 text-gray-700" />
            <h2 className="text-base font-semibold">Cita recurrente</h2>
            <span className="text-xs text-gray-400 ml-auto">{timezone}</span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Cliente *</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Servicio *</label>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.duration_min}m
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Barbero</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Cualquiera</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              {locations.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-gray-500">Sede</label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Principal</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Fecha inicio *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Hora *</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Frecuencia</label>
                  <select
                    value={freq}
                    onChange={(e) => setFreq(e.target.value)}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
                  >
                    <option value="DAILY">Diaria</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Cada</label>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={interval}
                      onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
                    />
                    <span className="text-xs text-gray-500">
                      {freq === 'DAILY' ? 'días' : freq === 'WEEKLY' ? 'semanas' : 'meses'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Repeticiones</label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={count}
                    onChange={(e) =>
                      setCount(Math.min(52, Math.max(1, parseInt(e.target.value, 10) || 1)))
                    }
                    disabled={!!until}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-2 text-sm disabled:opacity-50"
                  />
                </div>
              </div>
              {freq === 'WEEKLY' && (
                <div>
                  <label className="text-xs font-medium text-gray-500">
                    Días (BYDAY) — opcional
                  </label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {days.map((d) => (
                      <button
                        key={d.v}
                        type="button"
                        onClick={() =>
                          setByday((prev) =>
                            prev.includes(d.v) ? prev.filter((x) => x !== d.v) : [...prev, d.v],
                          )
                        }
                        className={`px-2 py-1 rounded-full text-xs border ${byday.includes(d.v) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      >
                        {d.l}
                      </button>
                    ))}
                    {byday.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setByday([])}
                        className="px-2 py-1 text-xs text-gray-500"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-500">
                  Hasta (UNTIL) — opcional, anula repeticiones
                </label>
                <input
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>
              <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                <div className="text-[11px] font-medium text-gray-500 uppercase">RRULE</div>
                <code className="text-xs text-gray-700 break-all">{rrulePreview}</code>
                <div className="text-[11px] text-gray-400 mt-1">
                  dtstart: {date} {time} ({timezone}) · Máx 52 ocurrencias
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {result && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Serie <code>{result.id.slice(0, 8)}</code> creada:{' '}
                <strong>{result.created} creadas</strong>
                {result.skipped.length > 0 && (
                  <span>
                    {' '}
                    · {result.skipped.length} omitidas (
                    {result.skipped
                      .slice(0, 3)
                      .map((s) => s.reason)
                      .join(', ')}
                    {result.skipped.length > 3 ? '…' : ''})
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={submit}
              disabled={saving || !clientId || !serviceId || !date || !time}
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CalendarRepeat className="w-4 h-4" />
              )}
              {saving ? 'Creando…' : 'Crear serie'}
            </Button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Cada ocurrencia valida <code>checkSlotWithinHours</code> + festivos +{' '}
            <code>employee_unavailability</code>. Conflicto → se omite con aviso y el resto se crea
            (SC-011).
          </p>
        </div>
      </div>
    </div>
  )
}

// tiny helper to satisfy icon import missing
function CalendarRepeat(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Calendar repeat icon</title>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M12 14v4M14 16l-4 2 4 2v-4z" />
    </svg>
  )
}
