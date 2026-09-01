'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'

import { WaitlistCard } from '@/components/client/waitlist-card'

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
  services?: { id: string; name: string } | null
  employees?: { id: string; name: string } | null
}

function EsperaInner() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('waiting')

  const fetchWaitlist = useCallback(async (status?: string) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    const url = `/api/client/waitlist${params.toString() ? `?${params.toString()}` : ''}`
    const res = await fetch(url)
    const json = (await res.json()) as unknown
    if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`)
    return json as WaitlistEntry[]
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWaitlist(filter === 'all' ? undefined : filter)
      setEntries(data)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [fetchWaitlist, filter])

  useEffect(() => {
    void reload()
    const id = setInterval(() => void reload(), 30000)
    return () => clearInterval(id)
  }, [reload])

  async function handleCancel(id: string) {
    try {
      const res = await fetch(`/api/client/waitlist?id=${id}`, { method: 'DELETE' })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      await reload()
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  async function handleConvert(id: string) {
    // Convert via main waitlist API PATCH
    try {
      const res = await fetch('/api/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'convert', waitlist_id: id }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; appointmentId?: string }
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      // After convert, refresh
      await reload()
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-gray-900">Lista de espera</h1>
          <p className="text-xs text-gray-500 mt-1">
            Si alguien cancela, te avisamos · TTL 30m para confirmar
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white rounded-xl border p-2">
          {[
            { k: 'waiting', label: 'En espera' },
            { k: 'notified', label: 'Notificadas' },
            { k: 'all', label: 'Todas' },
          ].map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setFilter(o.k)}
              className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg ${filter === o.k ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="h-32 bg-white rounded-xl border animate-pulse" />
            <div className="h-32 bg-white rounded-xl border animate-pulse" />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <div className="text-sm font-medium text-gray-900">Sin entradas</div>
            <div className="text-xs text-gray-500 mt-1">
              Cuando un slot esté lleno, unite desde{' '}
              <span className="font-medium">Reservar → Lista de espera</span>.
            </div>
            <Link
              href="/book/escuderia"
              className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white"
            >
              Ver disponibilidad
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <WaitlistCard
                key={e.id}
                entry={e}
                onCancel={handleCancel}
                onConvert={handleConvert}
              />
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-xs font-semibold text-gray-900">Cómo funciona (SQUIRE pattern)</h3>
          <ul className="text-xs text-gray-600 mt-2 space-y-1 list-disc list-inside">
            <li>
              Elegí <span className="font-medium">Carlos Hoy ❌ No disponible [Unirme]</span> → tu
              ventana 17–20h.
            </li>
            <li>
              Si alguien cancela 18:30, el primero en fila recibe{' '}
              <span className="font-medium">Se liberó 18:30</span> (push/WhatsApp) con TTL 30m.
            </li>
            <li>Si no confirmás en 30m, expira y pasa al siguiente.</li>
            <li>
              Cancel libera slot y dispara{' '}
              <span className="font-mono text-[11px]">waitlist.notifyNext</span>.
            </li>
          </ul>
        </div>

        <div className="text-center">
          <Link href="/client/me" className="text-xs text-gray-500 underline">
            ← Inicio 360
          </Link>
          <span className="mx-2 text-gray-300">·</span>
          <Link href="/book/escuderia" className="text-xs text-gray-500 underline">
            Reservar
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function EsperaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBF8F5] p-4">
          <div className="max-w-lg mx-auto h-32 bg-white rounded-xl border animate-pulse" />
        </div>
      }
    >
      <EsperaInner />
    </Suspense>
  )
}
