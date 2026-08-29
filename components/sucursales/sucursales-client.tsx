'use client'

import { MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

import { LocationForm } from './location-form'

interface Location {
  id: string
  name: string
  slug: string
  address?: string | null
  phone?: string | null
  is_active: boolean
  created_at?: string
}

export function SucursalesClient({ locations }: { locations: Location[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Location | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar sucursal? No se borrará, solo se marca inactiva.')) return
    const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? 'Error al desactivar')
      return
    }
    router.refresh()
  }

  async function handleToggleActive(loc: Location) {
    const res = await fetch(`/api/locations/${loc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !loc.is_active }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? 'Error')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Gestiona sedes físicas. El slug es único por negocio.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nueva sucursal
        </Button>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          variant="locations"
          actionLabel="Crear primera sede"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((loc) => (
            <Card
              key={loc.id}
              className={`${!loc.is_active ? 'opacity-60' : ''} hover:shadow-md transition-shadow`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {loc.name}{' '}
                        {!loc.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            Inactiva
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">/{loc.slug}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(loc)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(loc.id)}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  {loc.address && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                      <span>{loc.address}</span>
                    </div>
                  )}
                  {loc.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-gray-400" /> {loc.phone}
                    </div>
                  )}
                  {!loc.address && !loc.phone && (
                    <span className="text-gray-400">Sin dirección/teléfono</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(loc)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {loc.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <span className="text-[11px] text-gray-400 font-mono">{loc.id.slice(0, 8)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <LocationForm
          location={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
