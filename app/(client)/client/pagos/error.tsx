'use client'
import { useEffect } from 'react'
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])
  return (
    <div className="min-h-[40vh] p-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl border border-red-200 p-6 text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-sm font-medium text-red-800">Algo salió mal</div>
          <div className="text-xs text-gray-500 mt-1">{error.message || 'Error inesperado'}</div>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 text-xs font-medium px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
          >
            Reintentar
          </button>
          <div className="mt-3">
            <a href="/client/me" className="text-xs text-gray-500 underline">
              ← Inicio 360
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
