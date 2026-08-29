'use client'

import { Plus, Pencil, Trash2, Tag, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/utils'

interface Promotion {
  id: string
  name: string
  type: string
  value: number
  promo_code: string | null
  valid_from: string
  valid_to: string | null
  rules: Record<string, unknown>
  is_active: boolean
  location_id: string | null
  created_at: string
}

const SEGMENTS = [
  { value: '', label: 'Todos' },
  { value: 'birthday', label: 'Cumpleaños 7d' },
  { value: 'vip', label: 'VIP' },
  { value: 'inactive_30', label: 'Inactivos 30d' },
  { value: 'inactive_42', label: 'Inactivos 42d' },
  { value: 'inactive_60', label: 'Inactivos 60d' },
  { value: 'new', label: 'Nuevos' },
  { value: 'frequent', label: 'Frecuentes' },
  { value: 'all', label: 'Todos (all)' },
]

const DAYS = [
  { v: 0, l: 'Dom' },
  { v: 1, l: 'Lun' },
  { v: 2, l: 'Mar' },
  { v: 3, l: 'Mié' },
  { v: 4, l: 'Jue' },
  { v: 5, l: 'Vie' },
  { v: 6, l: 'Sáb' },
]

export function PromocionesClient({
  promotions,
  locations,
  services,
}: {
  promotions: Promotion[]
  locations: { id: string; name: string }[]
  services: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [form, setForm] = useState({
    name: '',
    type: 'percent' as 'percent' | 'fixed' | 'combo',
    value: '20',
    promo_code: '',
    valid_from: new Date().toISOString().slice(0, 10),
    valid_to: '',
    day_of_week: [] as number[],
    service_ids: [] as string[],
    client_segment: '',
    location_id: '',
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  function openCreate() {
    setForm({
      name: '',
      type: 'percent',
      value: '20',
      promo_code: '',
      valid_from: new Date().toISOString().slice(0, 10),
      valid_to: '',
      day_of_week: [],
      service_ids: [],
      client_segment: '',
      location_id: '',
      is_active: true,
    })
    setEditing(null)
    setCreating(true)
    setError(null)
    setTestResult(null)
  }
  function openEdit(p: Promotion) {
    const r = p.rules as { day_of_week?: number[]; service_ids?: string[]; client_segment?: string }
    setForm({
      name: p.name,
      type: p.type as 'percent' | 'fixed' | 'combo',
      value: String(p.value),
      promo_code: p.promo_code ?? '',
      valid_from: p.valid_from ? p.valid_from.slice(0, 10) : '',
      valid_to: p.valid_to ? p.valid_to.slice(0, 10) : '',
      day_of_week: r?.day_of_week ?? [],
      service_ids: r?.service_ids ?? [],
      client_segment: r?.client_segment ?? '',
      location_id: p.location_id ?? '',
      is_active: p.is_active,
    })
    setEditing(p)
    setCreating(true)
    setError(null)
    setTestResult(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name,
      type: form.type,
      value: Number(form.value),
      promo_code: form.promo_code || null,
      valid_from: form.valid_from
        ? new Date(form.valid_from).toISOString()
        : new Date().toISOString(),
      valid_to: form.valid_to ? new Date(form.valid_to).toISOString() : null,
      rules: {
        day_of_week: form.day_of_week.length ? form.day_of_week : undefined,
        service_ids: form.service_ids.length ? form.service_ids : undefined,
        client_segment: form.client_segment || undefined,
      },
      location_id: form.location_id || null,
      is_active: form.is_active,
    }
    const url = editing ? `/api/promotions/${editing.id}` : '/api/promotions'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j.error ?? 'Error')
      setSaving(false)
      return
    }
    setSaving(false)
    setCreating(false)
    setEditing(null)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar promoción?')) return
    await fetch(`/api/promotions/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function handleEvaluate(p: Promotion) {
    setTestResult(null)
    const res = await fetch('/api/promotions/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promotion_id: p.id,
        amount: 50000,
        date: new Date().toISOString().slice(0, 10),
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok && j.eligible)
      setTestResult(
        `Eligible: descuento ${formatCurrency(j.discount, 'COP')} (final ${formatCurrency(j.finalAmount, 'COP')})`,
      )
    else setTestResult(`No elegible: ${j.reason ?? j.error}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Descuentos por día, servicio o segmento</p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nueva promoción
        </Button>
      </div>

      {promotions.length === 0 ? (
        <EmptyState variant="promotions" actionLabel="Nueva promoción" onAction={openCreate} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promotions.map((p) => {
            const r = p.rules as {
              day_of_week?: number[]
              service_ids?: string[]
              client_segment?: string
            }
            return (
              <Card
                key={p.id}
                className={`${!p.is_active ? 'opacity-50' : ''} hover:shadow-md transition-shadow`}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Tag className="w-3 h-3 text-blue-500" /> {p.name}
                        {!p.is_active && <Badge variant="secondary">Inactiva</Badge>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {p.type === 'percent'
                          ? `${p.value}%`
                          : formatCurrency(Number(p.value), 'COP')}{' '}
                        · {p.promo_code ?? 'sin código'}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs">
                    {r?.day_of_week?.length ? (
                      <Badge variant="outline">
                        {r.day_of_week.map((d) => DAYS.find((x) => x.v === d)?.l).join(',')}
                      </Badge>
                    ) : null}
                    {r?.client_segment ? <Badge variant="outline">{r.client_segment}</Badge> : null}
                    {r?.service_ids?.length ? (
                      <Badge variant="outline">{r.service_ids.length} servicios</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />{' '}
                    {new Date(p.valid_from).toLocaleDateString('es-CO')} →{' '}
                    {p.valid_to ? new Date(p.valid_to).toLocaleDateString('es-CO') : '∞'}
                  </div>
                  {p.location_id && (
                    <div className="text-xs text-gray-500">
                      📍 {locations.find((l) => l.id === p.location_id)?.name}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-3 h-7 text-xs"
                    onClick={() => handleEvaluate(p)}
                  >
                    Probar evaluación
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {testResult && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          {testResult}{' '}
          <button onClick={() => setTestResult(null)} className="ml-2 text-blue-600 underline">
            cerrar
          </button>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-auto">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-auto">
            <CardContent className="p-6">
              <h3 className="font-medium mb-4">
                {editing ? 'Editar promoción' : 'Nueva promoción'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Nombre *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    placeholder="Cumple 20% esta semana"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Tipo *</label>
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value as 'percent' | 'fixed' | 'combo' })
                      }
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="percent">% Porcento</option>
                      <option value="fixed">Monto fijo</option>
                      <option value="combo">Combo</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Valor *</label>
                    <input
                      type="number"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      required
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Código (opcional)</label>
                    <input
                      value={form.promo_code}
                      onChange={(e) =>
                        setForm({ ...form, promo_code: e.target.value.toUpperCase() })
                      }
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                      placeholder="CUMPLE20"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Válido desde</label>
                    <input
                      type="date"
                      value={form.valid_from}
                      onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Válido hasta</label>
                    <input
                      type="date"
                      value={form.valid_to}
                      onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">
                    Días de semana (rules.day_of_week)
                  </label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {DAYS.map((d) => (
                      <label
                        key={d.v}
                        className={`px-2 py-1 text-xs rounded-full border cursor-pointer ${form.day_of_week.includes(d.v) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white'}`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={form.day_of_week.includes(d.v)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              day_of_week: e.target.checked
                                ? [...form.day_of_week, d.v]
                                : form.day_of_week.filter((x) => x !== d.v),
                            })
                          }
                        />
                        {d.l}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Servicios (rules.service_ids)</label>
                  <div className="border rounded-lg p-2 max-h-28 overflow-auto mt-1 space-y-1">
                    {services.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.service_ids.includes(s.id)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              service_ids: e.target.checked
                                ? [...form.service_ids, s.id]
                                : form.service_ids.filter((x) => x !== s.id),
                            })
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                    {services.length === 0 && (
                      <p className="text-xs text-gray-400">Sin servicios</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Segmento cliente</label>
                  <select
                    value={form.client_segment}
                    onChange={(e) => setForm({ ...form, client_segment: e.target.value })}
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  >
                    {SEGMENTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                {locations.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500">Sede</label>
                    <select
                      value={form.location_id}
                      onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">— Todas —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />{' '}
                  Activa
                </label>
                {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setCreating(false)
                      setEditing(null)
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving || !form.name} className="flex-1">
                    {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
