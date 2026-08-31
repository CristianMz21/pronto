'use client'

import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { isRecord } from '@/lib/supabase/typed'

interface Holiday {
  id: string
  business_id: string
  location_id: string | null
  date: string // YYYY-MM-DD
  reason: string | null
  is_open: boolean
  created_at?: string
}

interface Location {
  id: string
  name: string
}

interface Props {
  businessId: string
  locations?: Location[]
}

export function HolidaysSection({ businessId, locations: initialLocations = [] }: Props) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ date: '', reason: '', location_id: '', is_open: false })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialLocations.length > 0) setLocations(initialLocations)
    else {
      fetch('/api/locations')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data))
            setLocations(
              data.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })),
            )
        })
        .catch(() => {})
    }
  }, [initialLocations])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/holidays?business_id=${businessId}`)
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as Holiday[]
      setHolidays(data)
    } catch (e) {
      setError(String((e as Error).message ?? 'load_failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  async function add(): Promise<void> {
    if (!form.date) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          location_id: form.location_id || null,
          date: form.date,
          reason: form.reason || null,
          is_open: form.is_open,
        }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}) as unknown)
        const message =
          isRecord(body) && typeof body['message'] === 'string'
            ? (body['message'] as string)
            : isRecord(body) && typeof body['error'] === 'string'
              ? (body['error'] as string)
              : `HTTP ${res.status}`
        throw new Error(message)
      }
      setForm({ date: '', reason: '', location_id: '', is_open: false })
      await load()
    } catch (e) {
      setError(String((e as Error).message ?? 'save_failed'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setHolidays((prev) => prev.filter((h) => h.id !== id))
    } catch (e) {
      setError(String((e as Error).message ?? 'delete_failed'))
    }
  }

  const hasMultipleLocations = locations.length > 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarOff className="w-5 h-5 text-gray-700" />
        <h2 className="font-semibold text-gray-900">Festivos y bloqueos</h2>
        <span className="text-xs text-gray-400 ml-2">bloquea reservas (is_open=false)</span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 mb-4 p-4 border border-gray-100 rounded-xl bg-gray-50">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Fecha</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Motivo</label>
            <input
              type="text"
              placeholder="Navidad, mantenimiento…"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {hasMultipleLocations && (
            <div>
              <label className="text-xs font-medium text-gray-500">Sede</label>
              <select
                value={form.location_id}
                onChange={(e) => setForm((f) => ({ ...f, location_id: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toda la empresa</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!hasMultipleLocations && (
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_open}
                  onChange={(e) => setForm((f) => ({ ...f, is_open: e.target.checked }))}
                  className="accent-blue-600"
                />
                <span className="text-xs text-gray-600">Abierto en festivo</span>
              </label>
            </div>
          )}
        </div>
        {hasMultipleLocations && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_open}
              onChange={(e) => setForm((f) => ({ ...f, is_open: e.target.checked }))}
              className="accent-blue-600"
            />
            <span className="text-xs text-gray-600">
              Marcar como abierto aunque sea festivo (excepción)
            </span>
          </label>
        )}
        <div>
          <Button size="sm" onClick={add} disabled={!form.date || saving} className="gap-2">
            <Plus className="w-4 h-4" /> {saving ? 'Guardando…' : 'Agregar bloqueo'}
          </Button>
          <span className="text-xs text-gray-400 ml-3">
            is_open=false bloquea el picker y /api/book
          </span>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500">Cargando festivos…</div>
      ) : holidays.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl">
          Sin bloqueos. Agregá festivos o cierres por mantenimiento.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Motivo</th>
                {hasMultipleLocations && <th className="px-4 py-3 text-left font-medium">Sede</th>}
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{h.date}</td>
                  <td className="px-4 py-3 text-gray-600">{h.reason ?? '—'}</td>
                  {hasMultipleLocations && (
                    <td className="px-4 py-3 text-gray-600">
                      {h.location_id
                        ? (locations.find((l) => l.id === h.location_id)?.name ??
                          h.location_id.slice(0, 8))
                        : 'Todas'}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${h.is_open ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
                    >
                      {h.is_open ? 'Abierto' : 'Cerrado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(h.id)}
                      className="p-1.5 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">
        Los días marcados como cerrado no aparecen como slots en <code>/book/[slug]</code> y son
        rechazados por <code>/api/book</code> con <code>outside_availability:holiday</code>.
      </p>
    </div>
  )
}
