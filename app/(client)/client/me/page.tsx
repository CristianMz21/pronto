'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { ChatThread } from '@/components/client/chat-thread'
import { CheckinQR } from '@/components/client/checkin-qr'
import { HistoryList } from '@/components/client/history-list'
import { LocationCard } from '@/components/client/location-card'
import { ReviewForm } from '@/components/client/review-form'
import { UpcomingCard } from '@/components/client/upcoming-card'
import type { Client360 } from '@/lib/client-360'

function useClient360() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? undefined
  const businessSlug = searchParams.get('business_slug') ?? undefined

  const [data, setData] = useState<Client360 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMe = useCallback(async () => {
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    if (businessSlug) params.set('business_slug', businessSlug)
    if (!phone && !businessSlug) params.set('business_slug', 'escuderia')
    const url = `/api/client/me${params.toString() ? `?${params.toString()}` : ''}`
    const res = await fetch(url)
    const json = (await res.json()) as unknown
    if (!res.ok) {
      const msg =
        (json as { error?: string; message?: string })?.error ??
        (json as { message?: string })?.message ??
        `HTTP ${res.status}`
      throw new Error(msg)
    }
    return json as Client360
  }, [phone, businessSlug])

  const reload = useCallback(async () => {
    try {
      const result = await fetchMe()
      setData(result)
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
    const id = setInterval(() => {
      void reload()
    }, 30000)
    return () => clearInterval(id)
  }, [reload])

  return { data, loading, error, reload }
}

function ClientMeInner() {
  const { data, loading, error, reload } = useClient360()
  const [actionError, setActionError] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)

  const upcoming = useMemo(() => data?.upcoming?.[0] ?? null, [data])
  const history = useMemo(() => data?.history ?? [], [data])
  const reviews = useMemo(() => data?.reviews ?? [], [data])
  const businessSlug = 'escuderia'

  const showCheckin = useMemo(() => {
    if (!upcoming) return false
    const starts = new Date(upcoming.starts_at).getTime()
    const now = Date.now()
    const diffHours = (starts - now) / 3600000
    return (
      diffHours <= 2 &&
      diffHours >= -2 &&
      ['confirmed', 'checked_in', 'in_service'].includes(upcoming.status)
    )
  }, [upcoming])

  const reviewCandidate = useMemo(() => {
    if (!history.length) return null
    const lastCompleted = history.find((h) => h.status === 'completed')
    if (!lastCompleted) return null
    const hasReview = reviews.some((r) => r.appointment_id === lastCompleted.id)
    if (hasReview) return null
    const completedAt = new Date(lastCompleted.starts_at).getTime()
    const daysAgo = (Date.now() - completedAt) / 86400000
    if (daysAgo > 7) return null
    return lastCompleted
  }, [history, reviews])

  async function handleCancel(id: string) {
    setActionError(null)
    try {
      const res = await fetch(`/api/client/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
      await reload()
    } catch (e) {
      setActionError(String((e as Error).message))
    }
  }

  async function handleReprogram(id: string, date: string, time: string) {
    const res = await fetch(`/api/client/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time }),
    })
    const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
    await reload()
  }

  async function handleCheckin(id: string) {
    setCheckingId(id)
    setActionError(null)
    try {
      const res = await fetch('/api/client/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: id }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
      await reload()
    } catch (e) {
      setActionError(String((e as Error).message))
    } finally {
      setCheckingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="h-32 bg-white rounded-xl border animate-pulse" />
          <div className="h-48 bg-white rounded-xl border animate-pulse" />
          <div className="h-64 bg-white rounded-xl border animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-xl border border-red-200 p-6 text-center">
            <div className="text-sm font-medium text-red-800">
              {error === 'client_not_found' ? 'Cliente no encontrado' : error}
            </div>
            {error === 'client_not_found' && (
              <div className="text-xs text-gray-500 mt-2">
                Verificá el teléfono o iniciá sesión.
              </div>
            )}
            <div className="mt-4">
              <a href="/client?phone=" className="text-xs text-blue-600 underline">
                Ir a Mi cuenta (legacy)
              </a>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-6 mt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget as HTMLFormElement)
                const val = fd.get('phone')
                const ph = typeof val === 'string' ? val.trim() : ''
                if (ph) window.location.href = `/client/me?phone=${encodeURIComponent(ph)}`
              }}
              className="space-y-3"
            >
              <input
                name="phone"
                placeholder="300 123 4567"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm"
              >
                Consultar
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto text-center text-sm text-gray-500">Sin datos</div>
      </div>
    )
  }

  const client = data.client
  const loyalty = data.loyalty
  const upcomingCount = data.stats.upcomingCount
  const showEmptyCTA = !upcoming && history.length === 0

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-gray-900">Inicio 360</h1>
          <p className="text-xs text-gray-500 mt-1">
            Hola, {client.name} · {client.phone ?? '—'} · {client.status}
          </p>
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            {actionError}
          </div>
        )}

        {(loyalty || client.total_visits > 0) && (
          <div className="bg-white rounded-xl border p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Visitas</div>
              <div className="text-lg font-bold text-gray-900">{client.total_visits}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Puntos</div>
              <div className="text-lg font-bold text-amber-700">{loyalty?.points ?? 0} pts</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Gasto total</div>
              <div className="text-sm font-medium text-gray-900">
                ${Number(client.total_spent).toLocaleString('es-CO')} COP
              </div>
            </div>
          </div>
        )}

        {upcoming ? (
          <UpcomingCard
            appointment={upcoming}
            onCancel={handleCancel}
            onReprogram={handleReprogram}
            onCheckin={showCheckin ? handleCheckin : undefined}
            checkingIn={checkingId === upcoming.id}
          />
        ) : (
          <div className="bg-white rounded-xl border p-6 text-center">
            <div className="text-sm font-medium text-gray-900">Sin próxima cita</div>
            {showEmptyCTA ? (
              <div className="mt-2">
                <div className="text-xs text-gray-500">¿Quieres volver a tu estilo habitual?</div>
                <a
                  href={`/book/${businessSlug}`}
                  className="inline-block mt-3 text-sm font-medium px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
                >
                  Reservar nuevamente — Corte + Barba
                </a>
              </div>
            ) : (
              <a
                href={`/book/${businessSlug}`}
                className="inline-block mt-3 text-sm font-medium px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
              >
                Reservar cita
              </a>
            )}
            <div className="text-xs text-gray-400 mt-2">
              {upcomingCount} próximas · {history.length} en historial
            </div>
          </div>
        )}

        {upcoming && showCheckin && (
          <CheckinQR
            appointmentId={upcoming.id}
            checkinCode={upcoming.checkin_code}
            status={upcoming.status}
          />
        )}

        {upcoming &&
          (upcoming.guest_name ||
            upcoming.status === 'confirmed' ||
            upcoming.status === 'checked_in') && <ChatThread appointmentId={upcoming.id} />}

        {reviewCandidate && <ReviewForm appointmentId={reviewCandidate.id} onSuccess={reload} />}

        <HistoryList history={history} businessSlug={businessSlug} />

        {data.transactions.length > 0 && (
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Pagos</h3>
            <div className="space-y-1">
              {data.transactions.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  className="flex justify-between text-xs text-gray-600 border-b border-gray-50 py-1"
                >
                  <span>
                    {new Date(t.created_at).toLocaleDateString('es-CO', {
                      timeZone: 'America/Bogota',
                    })}{' '}
                    · {t.payment_method}
                  </span>
                  <span className="font-medium">${Number(t.amount).toLocaleString('es-CO')}</span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              Historial desde transactions completed
            </div>
          </div>
        )}

        {(data.styles.length > 0 || data.favorites.length > 0) && (
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-gray-900">Mi estilo & Favoritos</h3>
            {data.styles.length > 0 && (
              <div className="text-xs text-gray-600 mt-2">
                {data.styles.length} foto(s) guardada(s)
              </div>
            )}
            {data.favorites.length > 0 && (
              <div className="text-xs text-gray-600 mt-1">
                {data.favorites.length} barbero(s) favorito(s)
              </div>
            )}
          </div>
        )}

        <LocationCard businessSlug={businessSlug} />

        <div className="text-center">
          <a href={`/book/${businessSlug}`} className="text-xs text-gray-500 underline">
            Ver servicios y reservar
          </a>
          <span className="mx-2 text-gray-300">·</span>
          <a href="/client/dashboard" className="text-xs text-gray-500 underline">
            Dashboard (legacy)
          </a>
        </div>
      </div>
    </div>
  )
}

export default function ClientMePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBF8F5] p-4">
          <div className="max-w-lg mx-auto h-32 bg-white rounded-xl border animate-pulse" />
        </div>
      }
    >
      <ClientMeInner />
    </Suspense>
  )
}
