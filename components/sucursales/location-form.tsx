'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatLocationSlug } from '@/lib/locations'

interface Location {
  id: string
  name: string
  slug: string
  address?: string | null
  phone?: string | null
  is_active: boolean
}

export function LocationForm({
  location,
  onClose,
}: {
  location?: Location | null
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: location?.name ?? '',
    slug: location?.slug ?? '',
    address: location?.address ?? '',
    phone: location?.phone ?? '',
    is_active: location?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleNameChange(value: string) {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: prev.slug && location ? prev.slug : formatLocationSlug(value),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const slug = formatLocationSlug(form.slug || form.name)
    if (!slug) {
      setError('Slug requerido')
      setSaving(false)
      return
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      slug,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      is_active: form.is_active,
    }

    const url = location?.id ? `/api/locations/${location.id}` : '/api/locations'
    const method = location?.id ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = j.error ?? j.message ?? 'Error al guardar'
      if (j.details) {
        setError(`${msg}: ${JSON.stringify(j.details)}`)
      } else {
        setError(msg)
      }
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
            {location ? 'Editar sucursal' : 'Nueva sucursal'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Nombre *</label>
              <input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="Escudería Centro"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Slug * (único por negocio)</label>
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                required
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="centro"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Usado en URLs. Solo letras, números y guiones.
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Dirección</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="Cra 10 # 20-30, Bogotá"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Teléfono</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="+57 300 123 4567"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Activa
            </label>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !form.name} className="flex-1">
                {saving ? 'Guardando...' : location ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
