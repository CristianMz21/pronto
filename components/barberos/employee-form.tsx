'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
}

interface Service {
  id: string
  name: string
}
interface Location {
  id: string
  name: string
}

export function EmployeeForm({
  employee,
  services,
  locations,
  onClose,
}: {
  employee?: Employee | null
  services: Service[]
  locations?: Location[]
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: employee?.name ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    role: (employee?.role ?? 'barbero') as string,
    color: employee?.color ?? '#16a34a',
    specialties: (employee?.specialties ?? []).join(', '),
    commission_rate: employee?.commission_rate?.toString() ?? '',
    commission_fixed: employee?.commission_fixed?.toString() ?? '',
    is_active: employee?.is_active ?? true,
    location_id: employee?.location_id ?? '',
  })
  const [assigned, setAssigned] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (employee?.id) {
      fetch(`/api/employee-services?employee_id=${employee.id}`)
        .then((r) => r.json())
        .then((j) => {
          if (Array.isArray(j)) setAssigned(j.map((x: { service_id: string }) => x.service_id))
        })
        .catch(() => {})
    }
  }, [employee?.id])

  async function toggleService(serviceId: string) {
    if (!employee?.id) {
      setAssigned((prev) =>
        prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
      )
      return
    }
    const isAssigned = assigned.includes(serviceId)
    const res = await fetch('/api/employee-services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: employee.id,
        service_id: serviceId,
        action: isAssigned ? 'unassign' : 'assign',
      }),
    })
    if (!res.ok) {
      setError('Error al asignar servicio')
      return
    }
    setAssigned((prev) =>
      isAssigned ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload: Record<string, unknown> = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      role: form.role,
      color: form.color || null,
      specialties: form.specialties
        ? form.specialties
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      commission_rate: form.commission_rate ? Number(form.commission_rate) : null,
      commission_fixed: form.commission_fixed ? Number(form.commission_fixed) : null,
      is_active: form.is_active,
      location_id: form.location_id || null,
    }
    const url = employee?.id ? `/api/employees/${employee.id}` : '/api/employees'
    const method = employee?.id ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j.error ?? j.message ?? 'Error al guardar')
      setSaving(false)
      return
    }
    if (!employee?.id && j.id && assigned.length > 0) {
      for (const sid of assigned) {
        await fetch('/api/employee-services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: j.id, service_id: sid, action: 'assign' }),
        })
      }
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
            {employee ? 'Editar barbero' : 'Nuevo barbero'}
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
                placeholder="Andrés"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Teléfono</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="3001234567"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="a@escuderia.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Rol</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="barbero">Barbero</option>
                  <option value="staff">Staff / Recepción</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Color calendario</label>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-full mt-1 border rounded-lg h-9 p-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Especialidades (coma separadas)</label>
              <input
                value={form.specialties}
                onChange={(e) => setForm({ ...form, specialties: e.target.value })}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="corte, barba, color"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Comisión %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.commission_rate}
                  onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Comisión fija (COP)</label>
                <input
                  type="number"
                  min={0}
                  value={form.commission_fixed}
                  onChange={(e) => setForm({ ...form, commission_fixed: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="15000"
                />
              </div>
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                id="active"
              />
              <label htmlFor="active" className="text-sm">
                Activo
              </label>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Servicios asignados</label>
              <div className="mt-1 border rounded-lg p-3 max-h-32 overflow-auto space-y-1 bg-gray-50">
                {services.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No hay servicios — crea primero en /servicios
                  </p>
                ) : (
                  services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={assigned.includes(s.id)}
                        onChange={() => toggleService(s.id)}
                      />
                      {s.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !form.name} className="flex-1">
                {saving ? 'Guardando...' : employee ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
