'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { ServiceForm } from './service-form'
import { formatCurrency } from '@/lib/utils'

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

export function ServiciosClient({ services, locations }: { services: Service[]; locations: { id: string; name: string }[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Service | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar servicio?')) return
    const res = await fetch(`/api/services/${id}`, { method: 'DELETE' })
    if (!res.ok) alert('Error al desactivar')
    else router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1" /> Nuevo servicio</Button>
      </div>

      {services.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-500">Sin servicios aún. Crea el primero.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <Card key={s.id} className={`${!s.is_active ? 'opacity-50' : ''} hover:shadow-md transition-shadow`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-6 rounded" style={{ backgroundColor: s.color ?? '#16a34a' }} />
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {s.name}
                        {s.is_featured && <Badge variant="secondary" className="text-xs">Destacado</Badge>}
                      </div>
                      <div className="text-xs text-gray-500">{s.category ?? '—'} · {s.duration_min} min</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                  </div>
                </div>
                {s.description && <p className="mt-2 text-xs text-gray-600 line-clamp-2">{s.description}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-sm">{formatCurrency(Number(s.price), 'COP')}</span>
                  {s.cost && <span className="text-xs text-gray-400">Costo {formatCurrency(Number(s.cost), 'COP')}</span>}
                </div>
                {s.location_id && locations.find((l) => l.id === s.location_id) && (
                  <div className="mt-1 text-xs text-gray-500">📍 {locations.find((l) => l.id === s.location_id)?.name}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ServiceForm service={editing} locations={locations} onClose={() => { setCreating(false); setEditing(null) }} />
      )}
    </div>
  )
}
