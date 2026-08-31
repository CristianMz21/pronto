'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isRecord } from '@/lib/supabase/typed'

interface Service {
  id: string
  name: string
  description?: string | null
  price: number
  duration_min: number
  category?: string | null
  is_active: boolean
  is_featured?: boolean
  color?: string | null
  cost?: number | null
  location_id?: string | null
}
export function ServiceForm({
  service,
  locations,
  onClose,
}: {
  service?: Service | null
  locations?: { id: string; name: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    price: service?.price?.toString() ?? '30000',
    duration_min: service?.duration_min?.toString() ?? '45',
    category: service?.category ?? '',
    is_active: service?.is_active ?? true,
    is_featured: service?.is_featured ?? false,
    color: service?.color ?? '#16a34a',
    cost: service?.cost?.toString() ?? '',
    location_id: service?.location_id ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      duration_min: Number(form.duration_min),
      category: form.category || null,
      is_active: form.is_active,
      is_featured: form.is_featured,
      color: form.color || null,
      cost: form.cost ? Number(form.cost) : null,
      location_id: form.location_id || null,
    }
    const url = service?.id ? `/api/services/${service.id}` : '/api/services'
    const method = service?.id ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j: unknown = await res.json().catch(() => ({}) as unknown)
    if (!res.ok) {
      const message =
        isRecord(j) && typeof j['error'] === 'string'
          ? (j['error'] as string)
          : isRecord(j) && typeof j['message'] === 'string'
            ? (j['message'] as string)
            : 'Error al guardar'
      setError(message)
      setSaving(false)
      return
    }
    setSaving(false)
    router.refresh()
    onClose()
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-auto">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-auto">
        <CardHeader>
          <CardTitle className="text-base">
            {service ? 'Editar servicio' : 'Nuevo servicio'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Nombre *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="Corte clásico"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Descripción</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="Incluye lavado"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Precio COP *</label>
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Duración min *</label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={form.duration_min}
                  onChange={(e) => setForm({ ...form, duration_min: e.target.value })}
                  required
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Categoría</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="corte"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Costo interno</label>
                <input
                  type="number"
                  min={0}
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="8000"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Color</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-full mt-1 border rounded-lg h-9 p-1"
              />
            </div>
            {locations && locations.length > 0 && (
              <div>
                <label className="text-xs text-gray-500">Sede</label>
                <select
                  value={form.location_id}
                  onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Sin sede —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />{' '}
                Activo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                />{' '}
                Destacado
              </label>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !form.name} className="flex-1">
                {saving ? 'Guardando...' : service ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
