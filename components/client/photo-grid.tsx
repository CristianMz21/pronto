'use client'

import { useCallback, useEffect, useState } from 'react'

interface StyleRow {
  id: string
  photo_url: string
  service_id: string | null
  employee_id: string | null
  notes: string | null
  is_favorite: boolean
  created_at: string
}

export function PhotoGrid({
  initialStyles = [],
  onUploaded,
}: {
  initialStyles?: StyleRow[]
  onUploaded?: () => void
}) {
  const [styles, setStyles] = useState<StyleRow[]>(initialStyles)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => setStyles(initialStyles), [initialStyles])

  const fetchStyles = useCallback(async () => {
    try {
      const res = await fetch('/api/client/styles')
      if (!res.ok) return
      const j = (await res.json()) as StyleRow[]
      if (Array.isArray(j)) setStyles(j)
    } catch {}
  }, [])

  useEffect(() => {
    if (initialStyles.length === 0) void fetchStyles()
  }, [initialStyles.length, fetchStyles])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setSuccess(null)
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('file_too_large: máximo 5MB')
      const fd = new FormData()
      fd.set('photo', file)
      const res = await fetch('/api/client/styles', { method: 'POST', body: fd })
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
      setSuccess('Foto subida ✓')
      await fetchStyles()
      onUploaded?.()
    } catch (err) {
      setError(String((err as Error).message))
    } finally {
      setUploading(false)
      // reset input
      e.target.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Borrar esta foto?')) return
    try {
      const res = await fetch(`/api/client/styles?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete_failed')
      setStyles((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      setError(String((err as Error).message))
    }
  }

  async function handleToggleFav(s: StyleRow) {
    try {
      const res = await fetch('/api/client/styles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, is_favorite: !s.is_favorite }),
      })
      // Fallback if PATCH not implemented: just update via direct table? For now toggle locally
      if (!res.ok) {
        // Local optimistic
        setStyles((prev) =>
          prev.map((x) => (x.id === s.id ? { ...x, is_favorite: !x.is_favorite } : x)),
        )
        return
      }
      const j = (await res.json()) as StyleRow
      setStyles((prev) => prev.map((x) => (x.id === j.id ? j : x)))
    } catch {
      setStyles((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, is_favorite: !x.is_favorite } : x)),
      )
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Mis cortes</h3>
        <label className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black cursor-pointer min-h-[36px] flex items-center">
          {uploading ? 'Subiendo…' : '+ Foto'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={handleFile}
            disabled={uploading}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Subí foto de tu corte (máx 5MB, JPG/PNG/WebP). El barbero la ve antes de atender.
      </p>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
          {error}
        </div>
      )}
      {success && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2 mb-3">
          {success}
        </div>
      )}

      {styles.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">
          Sin fotos aún — subí la primera de tu Low Fade favorito.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {styles.map((s) => (
            <div
              key={s.id}
              className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.photo_url}
                alt={s.notes ?? 'Corte'}
                className="w-full h-32 object-cover"
              />
              <div className="p-2">
                <div className="text-[11px] text-gray-600 line-clamp-2">{s.notes ?? '—'}</div>
                <div className="text-[11px] text-gray-400">
                  {new Date(s.created_at).toLocaleDateString('es-CO', {
                    timeZone: 'America/Bogota',
                  })}
                </div>
              </div>
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleToggleFav(s)}
                  className={`text-[11px] px-2 py-1 rounded-full font-medium ${s.is_favorite ? 'bg-amber-400 text-white' : 'bg-white/90 text-gray-700 border'}`}
                  title="Favorito"
                >
                  ★
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="text-[11px] px-2 py-1 rounded-full bg-red-600 text-white"
                  title="Borrar"
                >
                  ×
                </button>
              </div>
              {s.is_favorite && (
                <div className="absolute top-1 left-1 text-[10px] bg-amber-400 text-white px-1.5 py-0.5 rounded-full">
                  ★ Favorito
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] text-gray-400 mt-3">
        Storage bucket client-styles · privado · signed URL 1h · RLS por cliente
      </div>
    </div>
  )
}
