'use client'

import { useEffect, useState } from 'react'

export function CheckinQR({
  appointmentId,
  checkinCode,
  status,
}: {
  appointmentId: string
  checkinCode: string | null
  status: string
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Fetch QR image
  useEffect(() => {
    if (!appointmentId) return
    let cancelled = false
    async function fetchQR() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/client/check-in?appointment_id=${appointmentId}`)
        const j = (await res.json()) as { dataURL?: string; error?: string; message?: string }
        if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
        if (!cancelled) setDataUrl(j.dataURL ?? null)
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchQR()
    return () => {
      cancelled = true
    }
  }, [appointmentId])

  async function handleCheckin() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/client/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointmentId }),
      })
      const j = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
      setDone(true)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }

  if (status === 'completed' || status === 'cancelled' || status === 'no_show') {
    return null
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Check-in</h3>
      {checkinCode && (
        <div className="text-xs text-gray-500 mb-3">
          Código: <span className="font-mono font-medium text-gray-900">{checkinCode}</span>
        </div>
      )}
      {loading && !dataUrl && <div className="text-xs text-gray-500">Cargando QR…</div>}
      {dataUrl && (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt="QR check-in"
            width={180}
            height={180}
            className="rounded-lg border border-gray-200"
          />
          <div className="text-[11px] text-gray-400">Mostrá este QR en recepción</div>
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      {done && (
        <div className="text-xs text-green-700 mt-2">✓ Check-in registrado — En espera ~10min</div>
      )}
      {status === 'confirmed' && !done && (
        <button
          type="button"
          onClick={handleCheckin}
          disabled={loading}
          className="mt-4 w-full text-sm font-medium px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Enviando…' : 'Estoy aquí'}
        </button>
      )}
      {status === 'checked_in' && (
        <div className="mt-3 text-xs text-amber-700">En espera ~10min — te llamamos pronto</div>
      )}
      {status === 'in_service' && (
        <div className="mt-3 text-xs text-purple-700">En servicio — tu barbero te atiende</div>
      )}
    </div>
  )
}
