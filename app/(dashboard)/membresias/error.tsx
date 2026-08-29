'use client'
import { Button } from '@/components/ui/button'
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-sm font-semibold text-red-800">No se pudo cargar membresías</h2>
        <p className="mt-1 text-sm text-red-600">{error.message || 'Error inesperado. Intenta de nuevo.'}</p>
        <Button size="sm" variant="outline" className="mt-4" onClick={() => reset()}>Reintentar</Button>
      </div>
    </div>
  )
}
