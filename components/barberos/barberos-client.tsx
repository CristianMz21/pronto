'use client'

import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

import { EmployeeForm } from './employee-form'

interface Employee {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  role: string
  color?: string | null
  specialties?: string[] | null
  commission_rate?: number | null
  commission_fixed?: number | null
  is_active: boolean
  location_id?: string | null
  created_at?: string
}

export function BarberosClient({
  employees,
  services,
  locations,
}: {
  employees: Employee[]
  services: { id: string; name: string }[]
  locations: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Employee | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar barbero? Se ocultará pero mantiene historial.')) return
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' })
    if (!res.ok) alert('Error al desactivar')
    else router.refresh()
  }

  const roleLabel: Record<string, string> = { barbero: 'Barbero', staff: 'Staff', admin: 'Admin' }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo barbero
        </Button>
      </div>

      {employees.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-500">
            Sin barberos aún. Crea el primero.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((emp) => (
            <Card
              key={emp.id}
              className={`${!emp.is_active ? 'opacity-50' : ''} hover:shadow-md transition-shadow`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: emp.color ?? '#16a34a' }}
                    >
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{emp.name}</div>
                      <div className="text-xs text-gray-500">
                        {roleLabel[emp.role] ?? emp.role} {emp.is_active ? '' : '· Inactivo'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(emp)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(emp.id)}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
                {emp.specialties && emp.specialties.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {emp.specialties.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-gray-500 space-y-1">
                  {emp.phone && <div>📞 {emp.phone}</div>}
                  {emp.email && <div>✉️ {emp.email}</div>}
                  {(emp.commission_rate || emp.commission_fixed) && (
                    <div>
                      Comisión:{' '}
                      {emp.commission_fixed
                        ? formatCurrency(Number(emp.commission_fixed), 'COP') + ' fijo'
                        : `${emp.commission_rate}%`}
                    </div>
                  )}
                  {emp.location_id && locations.find((l) => l.id === emp.location_id) && (
                    <div>📍 {locations.find((l) => l.id === emp.location_id)?.name}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <EmployeeForm
          employee={editing}
          services={services}
          locations={locations}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
