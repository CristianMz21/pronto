'use client'

import { Calendar, Coins, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/utils'
import { isRecord } from '@/lib/validation/guard'

function getStringField(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'string' ? v : undefined
}

interface Membership {
  id: string
  name: string
  price: number
  duration_days: number
  benefits: Record<string, unknown>
  is_active: boolean
  location_id: string | null
  created_at: string
}

interface ClientMembership {
  id: string
  client_id: string
  membership_id: string
  starts_at: string
  expires_at: string
  remaining: number
  status: string
  clients: { name: string } | null
}

export function MembresiasClient({
  memberships,
  locations,
  clientMemberships,
  clients,
}: {
  memberships: Membership[]
  locations: { id: string; name: string }[]
  clientMemberships: ClientMembership[]
  clients: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Membership | null>(null)
  const [form, setForm] = useState({
    name: '',
    price: '99000',
    duration_days: '30',
    cuts: '4',
    location_id: '',
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPurchase, setShowPurchase] = useState<string | null>(null)
  const [purchaseClient, setPurchaseClient] = useState('')
  // Hydration-safe: avoid new Date() mismatch during SSR/hydration
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  function openCreate() {
    setForm({
      name: '',
      price: '99000',
      duration_days: '30',
      cuts: '4',
      location_id: '',
      is_active: true,
    })
    setEditing(null)
    setCreating(true)
  }
  function openEdit(m: Membership) {
    setForm({
      name: m.name,
      price: String(m.price),
      duration_days: String(m.duration_days),
      cuts: String((m.benefits as { cuts?: number })?.cuts ?? 4),
      location_id: m.location_id ?? '',
      is_active: m.is_active,
    })
    setEditing(m)
    setCreating(true)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name,
      price: Number(form.price),
      duration_days: Number(form.duration_days),
      benefits: { cuts: Number(form.cuts) },
      location_id: form.location_id || null,
      is_active: form.is_active,
    }
    const url = editing ? `/api/memberships/${editing.id}` : '/api/memberships'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j: unknown = await res.json().catch(() => ({}) as unknown)
    if (!res.ok) {
      setError(getStringField(j, 'error') ?? 'Error')
      setSaving(false)
      return
    }
    setSaving(false)
    setCreating(false)
    setEditing(null)
    router.refresh()
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('¿Desactivar membresía?')) return
    await fetch(`/api/memberships/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function handlePurchase(membershipId: string): Promise<void> {
    if (!purchaseClient) {
      alert('Selecciona cliente')
      return
    }
    const res = await fetch('/api/memberships/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: purchaseClient, membership_id: membershipId }),
    })
    const j: unknown = await res.json().catch(() => ({}) as unknown)
    if (!res.ok) {
      alert(getStringField(j, 'error') ?? 'Error al vender')
      return
    }
    setShowPurchase(null)
    setPurchaseClient('')
    router.refresh()
  }

  async function handleConsume(cmId: string): Promise<void> {
    if (!confirm('¿Consumir 1 uso?')) return
    const res = await fetch('/api/memberships/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_membership_id: cmId }),
    })
    const j: unknown = await res.json().catch(() => ({}) as unknown)
    if (!res.ok) {
      alert(getStringField(j, 'error') ?? getStringField(j, 'message') ?? 'Error')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-sm text-gray-500">Planes vigentes y ventas</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nueva membresía
        </Button>
      </div>

      {memberships.length === 0 ? (
        <EmptyState variant="memberships" actionLabel="Nueva membresía" onAction={openCreate} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {memberships.map((m) => (
            <Card
              key={m.id}
              className={`${!m.is_active ? 'opacity-50' : ''} hover:shadow-md transition-shadow`}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      {m.name} {!m.is_active && <Badge variant="secondary">Inactiva</Badge>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {m.duration_days} días · {(m.benefits as { cuts?: number })?.cuts ?? 4} usos
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-sm">
                    {formatCurrency(Number(m.price), 'COP')}
                  </span>
                  {m.location_id && (
                    <span className="text-xs text-gray-500">
                      📍 {locations.find((l) => l.id === m.location_id)?.name}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  {showPurchase === m.id ? (
                    <div className="flex gap-2">
                      <select
                        value={purchaseClient}
                        onChange={(e) => setPurchaseClient(e.target.value)}
                        className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="">Cliente...</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" onClick={() => handlePurchase(m.id)}>
                        Vender
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowPurchase(null)}>
                        ×
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowPurchase(m.id)}
                    >
                      <Coins className="w-3 h-3 mr-1" /> Vender a cliente
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Client memberships list */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
            <Users className="w-4 h-4" /> Membresías de clientes{' '}
            <span className="text-xs text-gray-500">({clientMemberships.length})</span>
          </h3>
          {clientMemberships.length === 0 ? (
            <EmptyState
              variant="generic"
              title="Aún sin ventas"
              description="Vende una membresía a un cliente para verla aquí."
              className="py-8 border-dashed"
            />
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-left py-2">Cliente</th>
                    <th className="text-left py-2">Plan</th>
                    <th className="text-center py-2">Usos</th>
                    <th className="text-left py-2">Vence</th>
                    <th className="text-left py-2">Estado</th>
                    <th className="text-right py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {clientMemberships.map((cm) => {
                    const mem = memberships.find((m) => m.id === cm.membership_id)
                    // Hydration-safe: server and initial client use deterministic fallback (not expired), real check after mount
                    const expired = mounted
                      ? new Date(cm.expires_at) < new Date() || cm.remaining <= 0
                      : cm.remaining <= 0
                    return (
                      <tr key={cm.id} className="border-b last:border-0">
                        <td className="py-2">{cm.clients?.name ?? cm.client_id.slice(0, 8)}</td>
                        <td className="py-2">{mem?.name ?? cm.membership_id.slice(0, 8)}</td>
                        <td className="py-2 text-center font-mono">{cm.remaining}</td>
                        <td className="py-2 flex items-center gap-1" suppressHydrationWarning>
                          <Calendar className="w-3 h-3" />{' '}
                          {mounted
                            ? new Date(cm.expires_at).toLocaleDateString('es-CO', {
                                timeZone: 'America/Bogota',
                              })
                            : new Date(cm.expires_at).toISOString().slice(0, 10)}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant={cm.status === 'active' && !expired ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {expired ? 'expirada' : cm.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={cm.status !== 'active' || expired}
                            onClick={() => handleConsume(cm.id)}
                            className="h-7 text-xs"
                          >
                            Consumir
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-auto">
          <Card className="w-full max-w-lg">
            <CardContent className="p-6">
              <h3 className="font-medium mb-4">
                {editing ? 'Editar membresía' : 'Nueva membresía'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Nombre *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    placeholder="4 cortes/mes"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Precio COP</label>
                    <input
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Días vigencia</label>
                    <input
                      type="number"
                      value={form.duration_days}
                      onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Usos incluidos</label>
                    <input
                      type="number"
                      value={form.cuts}
                      onChange={(e) => setForm({ ...form, cuts: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {locations.length > 0 && (
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
