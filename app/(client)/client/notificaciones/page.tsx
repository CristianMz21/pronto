'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'

import { NotificationList } from '@/components/client/notification-list'

type Notif = {
  id: string
  type: string
  channel: string
  sent_at: string
  icon: string
  title: string
}

function NotificacionesInner() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? undefined
  const businessSlug = searchParams.get('business_slug') ?? 'escuderia'
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<{ whatsapp: boolean; email: boolean; push: boolean }>({
    whatsapp: true,
    email: true,
    push: true,
  })
  const [savingPrefs, setSavingPrefs] = useState(false)

  const fetchNotifs = useCallback(async () => {
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    params.set('business_slug', businessSlug)
    const res = await fetch(`/api/client/notifications?${params.toString()}`)
    const json = (await res.json()) as unknown
    if (!res.ok) {
      const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`
      throw new Error(msg)
    }
    const data = json as { notifications: Notif[] }
    return data.notifications ?? []
  }, [phone, businessSlug])

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/client/preferences')
      if (!res.ok) return
      const j = (await res.json()) as {
        notification_prefs?: { whatsapp: boolean; email: boolean; push: boolean }
      }
      if (j.notification_prefs) setPrefs(j.notification_prefs)
    } catch {}
  }, [])

  const reload = useCallback(async () => {
    try {
      const n = await fetchNotifs()
      setNotifications(n)
      setError(null)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [fetchNotifs])

  useEffect(() => {
    setLoading(true)
    void reload()
    void fetchPrefs()
    const id = setInterval(() => {
      void reload()
    }, 30000)
    return () => clearInterval(id)
  }, [reload, fetchPrefs])

  async function togglePref(key: 'whatsapp' | 'email' | 'push') {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSavingPrefs(true)
    try {
      await fetch('/api/client/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_prefs: next }),
      })
    } catch {}
    setSavingPrefs(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="h-10 bg-white rounded-xl border animate-pulse" />
          <div className="h-24 bg-white rounded-xl border animate-pulse" />
          <div className="h-24 bg-white rounded-xl border animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-xl border border-red-200 p-4 text-center text-sm text-red-700">
            {error}
          </div>
          <div className="text-center mt-4">
            <a href="/client/me" className="text-xs text-gray-500 underline">
              ← Inicio 360
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-xs text-gray-500 mt-1">
            🔔 Confirmada hace 10m · 🎁 10pts · ⏳ Se liberó 18:30 · dedup 1h
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Preferencias</h3>
          <p className="text-xs text-gray-500 mt-1">
            Elegí por dónde te avisamos · clients.notification_prefs 088
          </p>
          <div className="mt-3 space-y-2">
            {(['whatsapp', 'email', 'push'] as const).map((k) => (
              <label
                key={k}
                className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2"
              >
                <span className="text-sm capitalize text-gray-700">
                  {k === 'whatsapp' ? 'WhatsApp' : k === 'email' ? 'Email' : 'Push'}
                </span>
                <input
                  type="checkbox"
                  checked={prefs[k]}
                  onChange={() => {
                    void togglePref(k)
                  }}
                  disabled={savingPrefs}
                  className="h-4 w-4"
                />
              </label>
            ))}
          </div>
          <div className="text-[11px] text-gray-400 mt-2">
            Recordatorios 24h/2h/post · respeto 1 promo/semana
          </div>
        </div>

        <NotificationList notifications={notifications} />

        <div className="text-center">
          <a href="/client/me" className="text-xs text-gray-500 underline">
            ← Inicio 360
          </a>
          <span className="mx-2 text-gray-300">·</span>
          <a href="/client/estilo" className="text-xs text-gray-500 underline">
            Mi estilo
          </a>
        </div>
      </div>
    </div>
  )
}

export default function NotificacionesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBF8F5] p-4">
          <div className="max-w-lg mx-auto h-40 bg-white rounded-xl border animate-pulse" />
        </div>
      }
    >
      <NotificacionesInner />
    </Suspense>
  )
}
