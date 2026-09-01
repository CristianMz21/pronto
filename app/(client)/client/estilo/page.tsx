'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'

import { FavoritesList } from '@/components/client/favorites-list'
import { PhotoGrid } from '@/components/client/photo-grid'
import { StyleEditor } from '@/components/client/style-editor'
import type { Client360 } from '@/lib/client-360'

function EstiloInner() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? undefined
  const businessSlug = searchParams.get('business_slug') ?? 'escuderia'

  const [data, setData] = useState<Client360 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([])

  const fetchMe = useCallback(async () => {
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    params.set('business_slug', businessSlug)
    const url = `/api/client/me?${params.toString()}`
    const res = await fetch(url)
    const json = (await res.json()) as unknown
    if (!res.ok) {
      const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`
      throw new Error(msg)
    }
    return json as Client360
  }, [phone, businessSlug])

  const reload = useCallback(async () => {
    try {
      const r = await fetchMe()
      setData(r)
      setError(null)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [fetchMe])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  useEffect(() => {
    // Try to load barbers for selector
    void fetch('/api/employees')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j)) setBarbers(j as { id: string; name: string }[])
      })
      .catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="h-48 bg-white rounded-xl border animate-pulse" />
          <div className="h-64 bg-white rounded-xl border animate-pulse" />
          <div className="h-48 bg-white rounded-xl border animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-xl border border-red-200 p-6 text-center">
            <div className="text-sm text-red-700">{error}</div>
            <div className="text-xs text-gray-500 mt-2">Verificá teléfono o iniciá sesión.</div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null
  const prefs = data.client.preferences as {
    cut?: string
    length?: string
    clipper?: string
    beard?: string
    notes?: string
    barber_id?: string
  }
  const initial = {
    ...prefs,
    preferred_barber_id: data.client.preferred_barber_id,
    status: data.client.status,
  }

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-gray-900">Mi estilo</h1>
          <p className="text-xs text-gray-500 mt-1">
            {data.client.name} · {data.client.phone ?? '—'}
          </p>
        </div>

        <StyleEditor initial={initial} barbers={barbers} />

        <PhotoGrid
          initialStyles={data.styles.map((s) => ({ ...s, created_at: s.created_at }))}
          onUploaded={reload}
        />

        {}
        <FavoritesList
          initialFavorites={
            data.favorites.map((f) => ({
              client_id: f.client_id,
              employee_id: f.employee_id,
              created_at: f.created_at,
              employee_name: f.employee_name ?? null,
              nextAvailability: f.nextAvailability ?? null,
            })) as never
          }
          businessSlug={businessSlug}
        />

        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-gray-900">Cómo lo usa tu barbero</h3>
          <p className="text-xs text-gray-500 mt-1">
            Cuando reservás con <span className="font-medium">Carlos</span> pre-seleccionado y tu
            estilo <span className="font-medium">Low Fade</span>, el barbero ve tu ficha en{' '}
            <span className="font-mono text-[11px] bg-gray-50 px-1 py-0.5 rounded">crm/[id]</span>{' '}
            antes de atender. También podés re-usar{' '}
            <span className="font-medium">Mi corte favorito</span> con 1 click: service + barbero +
            notas prefill.
          </p>
        </div>

        <div className="text-center">
          <a href="/client/me" className="text-xs text-gray-500 underline">
            ← Volver a Inicio 360
          </a>
          <span className="mx-2 text-gray-300">·</span>
          <a href={`/book/${businessSlug}`} className="text-xs text-gray-500 underline">
            Reservar con mi estilo
          </a>
        </div>
      </div>
    </div>
  )
}

export default function EstiloPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBF8F5] p-4">
          <div className="max-w-lg mx-auto h-48 bg-white rounded-xl border animate-pulse" />
        </div>
      }
    >
      <EstiloInner />
    </Suspense>
  )
}
