'use client'

import { useEffect, useState } from 'react'

import type { Preferences } from '@/lib/preferences'

const CUT_OPTIONS = [
  'Low Fade',
  'Mid Fade',
  'High Fade',
  'Taper',
  'Buzz',
  'Mullet',
  'Pompadour',
  'French Crop',
] as const
const LENGTH_OPTIONS = ['muy corto', 'corto', 'medio', 'largo', 'muy largo'] as const
const CLIPPER_OPTIONS = ['#0', '#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'] as const
const BEARD_OPTIONS = ['sin barba', '3mm', '5mm', '7mm', '10mm', 'barba completa'] as const

interface Props {
  initial: Preferences & { preferred_barber_id?: string | null; status?: string }
  barbers?: { id: string; name: string }[]
  onSave?: (p: Preferences & { preferred_barber_id?: string | null }) => Promise<void>
}

export function StyleEditor({ initial, barbers = [], onSave }: Props) {
  const [form, setForm] = useState<Preferences & { preferred_barber_id?: string | null }>({
    cut: initial.cut ?? '',
    length: initial.length ?? '',
    clipper: initial.clipper ?? '',
    beard: initial.beard ?? '',
    notes: initial.notes ?? '',
    barber_id: (initial as { barber_id?: string }).barber_id ?? null,
    preferred_barber_id: initial.preferred_barber_id ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm({
      cut: initial.cut ?? '',
      length: initial.length ?? '',
      clipper: initial.clipper ?? '',
      beard: initial.beard ?? '',
      notes: initial.notes ?? '',
      barber_id: (initial as { barber_id?: string }).barber_id ?? null,
      preferred_barber_id: initial.preferred_barber_id ?? null,
    })
  }, [initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    setError(null)
    try {
      // Normalize: barber_id maps to preferred_barber_id
      const payload: Record<string, unknown> = {
        preferences: {
          cut: form.cut || undefined,
          length: form.length || undefined,
          clipper: form.clipper || undefined,
          beard: form.beard || undefined,
          notes: form.notes || undefined,
          barber_id: form.barber_id || undefined,
        },
      }
      if (form.preferred_barber_id !== undefined)
        payload.preferred_barber_id = form.preferred_barber_id || null
      // Direct PUT to API if no onSave provided
      if (onSave) {
        await onSave(form)
      } else {
        const res = await fetch('/api/client/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
      }
      setMsg('Guardado ✓')
    } catch (err) {
      setError(String((err as Error).message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
    >
      <h3 className="text-sm font-semibold text-gray-900">Mi estilo</h3>
      <p className="text-xs text-gray-500 -mt-2">
        Guardá tu corte ideal para que el barbero lo consulte antes de atender.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700">Corte</label>
          <select
            value={form.cut ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, cut: e.target.value || undefined }))}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin preferencia</option>
            {CUT_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Longitud</label>
          <select
            value={form.length ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, length: e.target.value || undefined }))}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin preferencia</option>
            {LENGTH_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Máquina</label>
          <select
            value={form.clipper ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, clipper: e.target.value || undefined }))}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin preferencia</option>
            {CLIPPER_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Barba</label>
          <select
            value={form.beard ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, beard: e.target.value || undefined }))}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin preferencia</option>
            {BEARD_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {barbers.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-700">Barbero preferido</label>
          <select
            value={form.preferred_barber_id ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, preferred_barber_id: e.target.value || null }))
            }
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin preferencia</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-gray-700">Notas</label>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder='Ej: "Dejar volumen arriba, degradado suave"'
          maxLength={500}
          rows={2}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
        />
        <div className="text-[11px] text-gray-400 text-right">{(form.notes ?? '').length}/500</div>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}
      {msg && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
          {msg}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full text-sm font-medium px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50 min-h-[44px]"
      >
        {saving ? 'Guardando…' : 'Guardar mi estilo'}
      </button>
    </form>
  )
}
