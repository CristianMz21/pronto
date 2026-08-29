'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, Check, X, Clock, RefreshCw } from 'lucide-react'

interface WaitlistEntry {
  id: string
  business_id: string
  location_id: string | null
  service_id: string
  employee_id: string | null
  client_id: string
  desired_at: string
  status: 'waiting' | 'notified' | 'converted' | 'expired' | 'cancelled'
  notified_at: string | null
  created_at: string
  clients?: { id: string; name: string; phone: string | null; email: string | null } | null
  services?: { id: string; name: string } | null
  employees?: { id: string; name: string } | null
}

interface Props {
  businessId: string
  locationId?: string | null
}

export function WaitlistPanel({ businessId, locationId }: Props) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [status, setStatus] = useState<'waiting' | 'notified' | 'converted' | 'expired' | 'all'>('waiting')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ business_id: businessId, status: status === 'all' ? 'waiting' : status, limit: '50' })
      if (locationId) params.set('location_id', locationId)
      // When status=all we actually fetch waiting and notified separately then merge? For simplicity fetch waiting and allow toggle
      const url = status === 'all' ? `/api/waitlist?business_id=${businessId}&limit=50` : `/api/waitlist?${params.toString()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as WaitlistEntry[]
      setEntries(data)
    } catch (e) {
      setError(String((e as Error).message).slice(0, 300))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [businessId, locationId, status])

  async function notifyNext() {
    setActionId('notify')
    setError(null)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify', business_id: businessId, location_id: locationId ?? null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`)
      }
      await load()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setActionId(null)
    }
  }

  async function convert(id: string) {
    setActionId(id)
    setError(null)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'convert', waitlist_id: id, business_id: businessId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setActionId(null)
    }
  }

  async function cancel(id: string) {
    setActionId(id)
    try {
      const res = await fetch(`/api/waitlist?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setActionId(null)
    }
  }

  async function expireStale() {
    setActionId('expire')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'expire', business_id: businessId }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setActionId(null)
    }
  }

  function formatDate(iso: string, tz = 'America/Bogota') {
    try {
      return new Intl.DateTimeFormat('es-CO', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    } catch {
      return new Date(iso).toLocaleString()
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-900">Lista de espera</h3>
          <span className="text-xs text-gray-400 hidden sm:inline">waiting → notified (30m) → converted/expired</span>
        </div>
        <div className="flex items-center gap-1">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="waiting">En espera</option>
            <option value="notified">Notificados</option>
            <option value="converted">Convertidos</option>
            <option value="expired">Expirados</option>
            <option value="all">Todos</option>
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-7 px-2">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
        <Button size="sm" variant="outline" onClick={notifyNext} disabled={!!actionId} className="h-7 text-xs gap-1">
          <Bell className="w-3 h-3" /> Notificar siguiente
        </Button>
        <Button size="sm" variant="ghost" onClick={expireStale} disabled={!!actionId} className="h-7 text-xs">
          Expirar &gt;30m
        </Button>
        <span className="text-xs text-gray-400 self-center ml-2">Al cancelar una cita, el primero en espera es notificado automáticamente.</span>
      </div>

      {error && <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {loading ? (
        <div className="p-6 text-center text-sm text-gray-500">Cargando…</div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">
          <div className="mx-auto mb-2 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><Clock className="w-4 h-4 text-gray-400" /></div>
          Sin entradas en <strong>{status}</strong>. Cuando un slot esté lleno, el cliente puede unirse a la espera.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Deseado</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Servicio</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{e.clients?.name ?? e.client_id.slice(0, 8)}</div>
                    <div className="text-xs text-gray-500">{e.clients?.phone ?? e.clients?.email ?? ''}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDate(e.desired_at)}</td>
                  <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{e.services?.name ?? '—'}{e.employees?.name ? ` · ${e.employees.name}` : ''}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${e.status === 'waiting' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : e.status === 'notified' ? 'bg-blue-50 text-blue-700 border-blue-200' : e.status === 'converted' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {e.status}
                    </span>
                    {e.notified_at && <div className="text-[10px] text-gray-400 mt-0.5">notif: {formatDate(e.notified_at)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {(e.status === 'waiting' || e.status === 'notified') && (
                        <button
                          onClick={() => convert(e.id)}
                          disabled={!!actionId}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white px-2 py-1 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" /> Convertir
                        </button>
                      )}
                      {e.status !== 'converted' && e.status !== 'cancelled' && e.status !== 'expired' && (
                        <button onClick={() => cancel(e.id)} disabled={!!actionId} className="p-1.5 hover:bg-red-50 rounded text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-2 bg-gray-50 border-t text-[11px] text-gray-500">
        <strong>Flujo:</strong> slot lleno → enqueue → al cancelar <code>PATCH /api/appointments/[id] {"{ status: 'cancelled' }"}</code> notifica al primero → cliente confirma en 30m → convert.
      </div>
    </div>
  )
}
