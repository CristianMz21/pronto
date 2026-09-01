'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'

import { LoyaltyCard } from '@/components/client/loyalty-card'
import { PromoList } from '@/components/client/promo-card'
import type { Client360 } from '@/lib/client-360'

function FidelidadInner() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? undefined
  const businessSlug = searchParams.get('business_slug') ?? 'escuderia'

  const [data, setData] = useState<Client360 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMe = useCallback(async () => {
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    params.set('business_slug', businessSlug)
    const res = await fetch(`/api/client/me?${params.toString()}`)
    const json = (await res.json()) as unknown
    if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="h-40 bg-white rounded-xl border animate-pulse" />
          <div className="h-64 bg-white rounded-xl border animate-pulse" />
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto bg-white rounded-xl border border-red-200 p-6 text-center text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-gray-900">Fidelidad</h1>
          <p className="text-xs text-gray-500 mt-1">
            Puntos, visitas y beneficios — {data.client.name}
          </p>
        </div>

        <LoyaltyCard points={data.loyalty?.points ?? 0} totalVisits={data.client.total_visits} />

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <PromoList
            promos={
              data.promotions as unknown as Array<{
                id: string
                name: string
                type: string
                value: number
                promo_code: string | null
                valid_to: string | null
              }>
            }
            businessSlug={businessSlug}
          />
        </div>

        <div className="text-center">
          <a href="/client/me" className="text-xs text-gray-500 underline">
            ← Inicio 360
          </a>
          <span className="mx-2 text-gray-300">·</span>
          <a href="/client/pagos" className="text-xs text-gray-500 underline">
            Ver pagos
          </a>
          <span className="mx-2 text-gray-300">·</span>
          <a href={`/book/${businessSlug}`} className="text-xs text-gray-500 underline">
            Reservar y usar promo
          </a>
        </div>
      </div>
    </div>
  )
}

export default function FidelidadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBF8F5] p-4">
          <div className="max-w-lg mx-auto h-40 bg-white rounded-xl border animate-pulse" />
        </div>
      }
    >
      <FidelidadInner />
    </Suspense>
  )
}
