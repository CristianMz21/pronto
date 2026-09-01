'use client'

import { useCallback, useEffect, useState } from 'react'

interface FavoriteRow {
  client_id: string
  employee_id: string
  created_at: string
  employee_name: string | null
  employee_avatar?: string | null
  nextAvailability: string | null
}

function formatNextAvailability(iso: string | null): string {
  if (!iso) return 'Sin horarios próximos'
  try {
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso.slice(0, 16)
  }
}

export function FavoritesList({
  initialFavorites = [],
  businessSlug = 'escuderia',
}: {
  initialFavorites?: FavoriteRow[]
  businessSlug?: string
}) {
  const [favorites, setFavorites] = useState<FavoriteRow[]>(initialFavorites)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([])

  const fetchFavorites = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/client/favorites')
      const j = (await res.json()) as FavoriteRow[] | { error?: string }
      if (!res.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`)
      if (Array.isArray(j)) setFavorites(j)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchBarbers = useCallback(async () => {
    try {
      // Reuse booking-form data? Fetch via supabase directly would need auth; easiest: GET /api/employees?public?
      // For now, fetch via /api/book availability? Instead, try /api/employees list if exists else fallback empty
      const res = await fetch('/api/employees')
      if (res.ok) {
        const j = (await res.json()) as Array<{ id: string; name: string }>
        if (Array.isArray(j)) setBarbers(j)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (initialFavorites.length === 0) void fetchFavorites()
    void fetchBarbers()
  }, [initialFavorites.length, fetchFavorites, fetchBarbers])

  async function handleToggle(employeeId: string, isFav: boolean) {
    try {
      const method = isFav ? 'DELETE' : 'POST'
      const url = isFav
        ? `/api/client/favorites?employee_id=${employeeId}`
        : '/api/client/favorites'
      const init: RequestInit =
        method === 'POST'
          ? {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ employee_id: employeeId }),
            }
          : { method, headers: { 'Content-Type': 'application/json' } }
      const res = await fetch(url, init)
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      await fetchFavorites()
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  const favIds = new Set(favorites.map((f) => f.employee_id))
  const nonFavBarbers = barbers.filter((b) => !favIds.has(b.id))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900">Favoritos</h3>
      <p className="text-xs text-gray-500 mb-3">
        Marcá tu barbero estrella — pre-seleccionado al reservar y con próxima disponibilidad.
      </p>

      {loading && <div className="text-xs text-gray-500">Cargando…</div>}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
          {error}
        </div>
      )}

      {favorites.length === 0 && !loading ? (
        <div className="text-xs text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-lg">
          Sin favoritos — tocá ★ en tu barbero ideal.
        </div>
      ) : (
        <div className="space-y-2">
          {favorites.map((f) => (
            <div
              key={f.employee_id}
              className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
                  {(f.employee_name?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1">
                    <span>★</span> {f.employee_name ?? f.employee_id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Próxima: {formatNextAvailability(f.nextAvailability)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <a
                  href={`/book/${businessSlug}?employee=${f.employee_id}`}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black"
                >
                  Reservar
                </a>
                <button
                  type="button"
                  onClick={() => handleToggle(f.employee_id, true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                  title="Quitar favorito"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {nonFavBarbers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-700 mb-2">Agregar favorito</div>
          <div className="space-y-1">
            {nonFavBarbers.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1">
                <span className="text-xs text-gray-700">{b.name}</span>
                <button
                  type="button"
                  onClick={() => handleToggle(b.id, false)}
                  className="text-xs px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                >
                  ★ Agregar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
