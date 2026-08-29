'use client'

import { Loader2, Save, CheckCircle2, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

interface Props {
  businessId: string
  initial: {
    tax_rate?: number | string
    payment_methods?: string[]
    cancel_lead_time?: number
    min_advance_minutes?: number
    booking_lead_time_enabled?: boolean
    loyalty_earn_rate?: number
    loyalty_redeem_rate?: number
    loyalty_redeem_value?: number
  }
  locations?: { id: string; name: string }[]
}

export function ConfigSection({ businessId, initial, locations = [] }: Props) {
  const [taxRate, setTaxRate] = useState(String(initial.tax_rate ?? 0))
  const [paymentMethods, setPaymentMethods] = useState<string[]>(
    initial.payment_methods ?? ['cash', 'card', 'transfer'],
  )
  const [cancelLead, setCancelLead] = useState(String(initial.cancel_lead_time ?? 60))
  const [minAdvance, setMinAdvance] = useState(String(initial.min_advance_minutes ?? 30))
  const [leadEnabled, setLeadEnabled] = useState(initial.booking_lead_time_enabled ?? true)
  const [earnRate, setEarnRate] = useState(String(initial.loyalty_earn_rate ?? 1000))
  const [redeemRate, setRedeemRate] = useState(String(initial.loyalty_redeem_rate ?? 100))
  const [redeemValue, setRedeemValue] = useState(String(initial.loyalty_redeem_value ?? 10000))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // Hours per location
  const [selectedLoc, setSelectedLoc] = useState<string>('')
  const [hours, setHours] = useState<
    | {
        day_of_week: number
        is_open: boolean
        open_time: string
        close_time: string
        break_start: string | null
        break_end: string | null
      }[]
    | null
  >(null)
  const [hoursLoading, setHoursLoading] = useState(false)
  const [hoursMsg, setHoursMsg] = useState<string | null>(null)

  async function loadHours(loc: string) {
    setHoursLoading(true)
    try {
      const url = loc ? `/api/business/hours?location_id=${loc}` : '/api/business/hours'
      const res = await fetch(url)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) setHours(data)
      else
        setHours(
          [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
            day_of_week: dow,
            is_open: dow >= 1 && dow <= 5,
            open_time: '09:00',
            close_time: '19:00',
            break_start: null,
            break_end: null,
          })),
        )
    } catch {
      setHours(null)
    } finally {
      setHoursLoading(false)
    }
  }

  useEffect(() => {
    loadHours(selectedLoc)
  }, [selectedLoc])

  async function saveHours() {
    if (!hours) return
    setHoursLoading(true)
    setHoursMsg(null)
    const body = {
      location_id: selectedLoc || null,
      hours: hours.map((h) => ({
        ...h,
        break_start: h.break_start || null,
        break_end: h.break_end || null,
      })),
    }
    const res = await fetch('/api/business/hours', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) setHoursMsg('Horarios guardados ✓')
    else setHoursMsg('Error guardando horarios')
    setHoursLoading(false)
    setTimeout(() => setHoursMsg(null), 2500)
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    const payload = {
      tax_rate: Number(taxRate) || 0,
      payment_methods: paymentMethods,
      cancel_lead_time: Number(cancelLead) || 60,
      min_advance_minutes: Number(minAdvance) || 30,
      business_lead_time_enabled: leadEnabled,
      loyalty_earn_rate: Number(earnRate) || 1000,
      loyalty_redeem_rate: Number(redeemRate) || 100,
      loyalty_redeem_value: Number(redeemValue) || 10000,
    }
    const res = await fetch('/api/business/tax', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok) setMsg({ type: 'ok', text: 'Configuración guardada ✓' })
    else setMsg({ type: 'error', text: j.error ?? 'Error' })
    setSaving(false)
    setTimeout(() => setMsg(null), 3000)
  }

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Configuración general</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Tax %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Payment methods</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(['cash', 'card', 'transfer', 'digital'] as const).map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-1.5 text-xs border rounded-full px-3 py-1 cursor-pointer"
                  style={{
                    background: paymentMethods.includes(m) ? '#111827' : 'white',
                    color: paymentMethods.includes(m) ? 'white' : '#374151',
                  }}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={paymentMethods.includes(m)}
                    onChange={(e) =>
                      setPaymentMethods((prev) =>
                        e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                      )
                    }
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Cancel lead time (min)</label>
            <input
              type="number"
              min={0}
              max={1440}
              value={cancelLead}
              onChange={(e) => setCancelLead(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Minutos antes para cancelar sin penalización (FR-CFG-001)
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Business lead time (min)</label>
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                min={0}
                max={1440}
                value={minAdvance}
                onChange={(e) => setMinAdvance(e.target.value)}
                className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={leadEnabled}
                  onChange={(e) => setLeadEnabled(e.target.checked)}
                />{' '}
                habilitado
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">
              Loyalty earn rate (COP por punto)
            </label>
            <input
              type="number"
              min={1}
              value={earnRate}
              onChange={(e) => setEarnRate(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400">Default 1000 → 1pt/$1k</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500">Redeem rate (puntos)</label>
              <input
                type="number"
                min={1}
                value={redeemRate}
                onChange={(e) => setRedeemRate(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Redeem value (COP)</label>
              <input
                type="number"
                min={1}
                value={redeemValue}
                onChange={(e) => setRedeemValue(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}{' '}
            Guardar config
          </Button>
          {msg && (
            <span
              className={`text-xs flex items-center gap-1 ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}
            >
              {msg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}{' '}
              {msg.text}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Horario por sede</h3>
          <select
            value={selectedLoc}
            onChange={(e) => setSelectedLoc(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Global (sin sede)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        {hoursLoading ? (
          <div className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> cargando…
          </div>
        ) : hours ? (
          <div className="space-y-2">
            {hours.map((h, idx) => (
              <div
                key={h.day_of_week}
                className="flex flex-wrap gap-2 items-center border rounded-lg p-2"
              >
                <span className="w-10 text-xs font-medium">{dayNames[h.day_of_week]}</span>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={h.is_open}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev!.map((x, i) => (i === idx ? { ...x, is_open: e.target.checked } : x)),
                      )
                    }
                  />{' '}
                  abierto
                </label>
                <input
                  type="time"
                  value={h.open_time}
                  onChange={(e) =>
                    setHours((prev) =>
                      prev!.map((x, i) => (i === idx ? { ...x, open_time: e.target.value } : x)),
                    )
                  }
                  disabled={!h.is_open}
                  className="border rounded px-2 py-1 text-xs"
                />
                <span className="text-xs">—</span>
                <input
                  type="time"
                  value={h.close_time}
                  onChange={(e) =>
                    setHours((prev) =>
                      prev!.map((x, i) => (i === idx ? { ...x, close_time: e.target.value } : x)),
                    )
                  }
                  disabled={!h.is_open}
                  className="border rounded px-2 py-1 text-xs"
                />
                <span className="text-xs text-gray-400">break</span>
                <input
                  type="time"
                  value={h.break_start ?? ''}
                  onChange={(e) =>
                    setHours((prev) =>
                      prev!.map((x, i) =>
                        i === idx ? { ...x, break_start: e.target.value || null } : x,
                      ),
                    )
                  }
                  disabled={!h.is_open}
                  className="w-24 border rounded px-2 py-1 text-xs"
                  placeholder="--:--"
                />
                <span className="text-xs">—</span>
                <input
                  type="time"
                  value={h.break_end ?? ''}
                  onChange={(e) =>
                    setHours((prev) =>
                      prev!.map((x, i) =>
                        i === idx ? { ...x, break_end: e.target.value || null } : x,
                      ),
                    )
                  }
                  disabled={!h.is_open}
                  className="w-24 border rounded px-2 py-1 text-xs"
                  placeholder="--:--"
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={saveHours} size="sm" disabled={hoursLoading}>
                <Save className="w-4 h-4 mr-2" /> Guardar horarios
              </Button>
              {hoursMsg && <span className="text-xs text-green-600">{hoursMsg}</span>}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400">Sin horarios</div>
        )}
        <p className="text-xs text-gray-400">
          Los festivos (Holidays) se gestionan en la sección dedicada arriba. Estos horarios se usan
          en <code>checkSlotWithinHours</code> por location_id.
        </p>
      </div>
    </div>
  )
}
