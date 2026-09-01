'use client'

import { useCallback, useEffect, useState } from 'react'

type ChatMsg = {
  id: string
  appointment_id: string
  message: string
  from: string
  sent_at: string
}

export function ChatThread({ appointmentId }: { appointmentId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/client/chat?appointment_id=${encodeURIComponent(appointmentId)}`,
      )
      const json = (await res.json()) as unknown
      if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`)
      const data = json as { messages: ChatMsg[] }
      setMessages(data.messages ?? [])
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [appointmentId])

  useEffect(() => {
    setLoading(true)
    void fetchThread()
    const id = setInterval(() => {
      void fetchThread()
    }, 15000)
    return () => clearInterval(id)
  }, [fetchThread])

  async function handleSend(): Promise<void> {
    const msg = input.trim()
    if (!msg) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/client/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointmentId, message: msg }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`)
      setInput('')
      await fetchThread()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4 text-xs text-gray-500">Cargando chat...</div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900">Chat transaccional</h3>
      <p className="text-xs text-gray-500 mt-1">
        ¿Puedo cambiar mi corte? Claro. (hilo por cita, moderado)
      </p>
      {error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}
      <div className="mt-3 max-h-64 overflow-y-auto space-y-2 border border-gray-100 rounded-lg p-2 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4">
            Sin mensajes aún — escribí tu consulta sobre esta cita.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`text-xs p-2 rounded-lg ${m.from === 'client' ? 'bg-white border' : 'bg-amber-50 border border-amber-200'}`}
            >
              <div className="text-gray-800">{m.message}</div>
              <div className="text-[11px] text-gray-400 mt-1">
                {new Date(m.sent_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} ·{' '}
                {m.from}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí tu mensaje (máx 500)"
          maxLength={500}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            void handleSend()
          }}
          disabled={sending || !input.trim()}
          className="text-xs font-medium px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50"
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
      <div className="text-[11px] text-gray-400 mt-2">
        Transaccional por appointment_id · no es chat libre · DomPurify moderado · 1h dedup via
        notification_log
      </div>
    </div>
  )
}
