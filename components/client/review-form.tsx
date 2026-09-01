'use client'

import { useState } from 'react'

const TAGS = ['Atención', 'Corte', 'Puntualidad', 'Ambiente'] as const

export function ReviewForm({
  appointmentId,
  onSuccess,
}: {
  appointmentId: string
  onSuccess?: () => void
}) {
  const [rating, setRating] = useState<number>(0)
  const [hover, setHover] = useState<number>(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  async function submit() {
    if (rating < 1 || rating > 5) {
      setError('Elegí de 1 a 5 estrellas')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointmentId,
          rating,
          tags,
          comment: comment.trim() || null,
        }),
      })
      const j = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
      setDone(true)
      onSuccess?.()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl border border-green-200 p-5">
        <div className="text-sm font-medium text-green-800">¡Gracias por tu reseña! ⭐</div>
        <div className="text-xs text-gray-500 mt-1">
          Tu opinión ayuda a la barbería y a otros clientes.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900">¿Cómo estuvo tu cita?</h3>
      <div className="flex items-center gap-1 mt-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={`text-2xl leading-none ${(hover ? n <= hover : n <= rating) ? 'text-amber-400' : 'text-gray-300'}`}
            aria-label={`Rate ${n}`}
          >
            ★
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-2">
          {rating ? `${rating}/5` : 'Sin calificar'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggleTag(t)}
            className={`text-xs px-3 py-1.5 rounded-full border ${tags.includes(t) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comentario opcional (máx 500)"
        maxLength={500}
        rows={3}
        className="mt-4 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />

      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={saving || rating === 0}
        className="mt-4 w-full text-sm font-medium px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50"
      >
        {saving ? 'Enviando…' : 'Enviar reseña'}
      </button>
      <div className="text-[11px] text-gray-400 mt-2 text-center">
        Solo se puede calificar una vez por cita completada
      </div>
    </div>
  )
}
