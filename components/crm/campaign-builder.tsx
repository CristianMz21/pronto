'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Send, Eye } from 'lucide-react'

type Segment = 'inactive_30' | 'inactive_42' | 'inactive_60' | 'birthday_7' | 'vip' | 'new' | 'all'
type Channel = 'whatsapp' | 'email' | 'telegram'

const SEGMENT_LABELS: Record<Segment, string> = {
  inactive_30: 'Inactivos 30d',
  inactive_42: 'Inactivos 42d — Carlos',
  inactive_60: 'Inactivos 60d',
  birthday_7: 'Cumpleaños 7d',
  vip: 'VIP',
  new: 'Nuevos (<3 visitas)',
  all: 'Todos',
}

const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  telegram: 'Telegram',
}

interface Props {
  initialLocationId?: string | null
  onCreated?: () => void
}

export function CampaignBuilder({ initialLocationId, onCreated }: Props) {
  const [name, setName] = useState('')
  const [segment, setSegment] = useState<Segment>('inactive_42')
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [template, setTemplate] = useState('Hola {{name}} 👋 te extrañamos en {{business}}. ¡Tenemos 20% esta semana! Reserva aquí: {{business}}')
  const [locationId, setLocationId] = useState<string | null>(initialLocationId ?? null)
  const [count, setCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewSent, setPreviewSent] = useState<{ sent: number; failed: number; stub: boolean } | null>(null)

  const previewUrl = `/api/crm/segments?segment=${segment}${locationId ? `&location_id=${locationId}` : ''}`

  useEffect(() => {
    let cancelled = false
    setLoadingCount(true)
    fetch(previewUrl)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setCount(j.count ?? 0)
      })
      .catch(() => {
        if (!cancelled) setCount(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingCount(false)
      })
    return () => {
      cancelled = true
    }
  }, [previewUrl])

  async function create() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `Campaña ${SEGMENT_LABELS[segment]} — ${new Date().toLocaleDateString('es-CO')}`,
          segment,
          channel,
          template,
          location_id: locationId || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error ?? 'Error creando campaña')
        return
      }
      setCreatedId(j.id)
      onCreated?.()
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function send() {
    if (!createdId) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${createdId}/send`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error ?? 'Error enviando')
        return
      }
      setPreviewSent(j)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setSending(false)
    }
  }

  const interpolated = template.replaceAll('{{name}}', 'Carlos').replaceAll('{{business}}', 'Escudería')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <h3 className="font-semibold text-gray-900">Nueva campaña</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Te extrañamos — 20% corte"
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={120}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Segmento</label>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value as Segment)}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
            {loadingCount ? <><Loader2 className="w-3 h-3 animate-spin" /> calculando…</> : <span>{count !== null ? `${count} destinatarios` : '—'}</span>}
            <a href={previewUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">ver preview</a>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Canal</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Location (opcional)</label>
          <input
            value={locationId ?? ''}
            onChange={(e) => setLocationId(e.target.value || null)}
            placeholder="location_id o vacío = todas"
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500">Plantilla (usa {'{{name}}'} y {'{{business}}'})</label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-700 flex gap-2">
          <Eye className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <span className="whitespace-pre-wrap">{interpolated}</span>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {!createdId ? (
        <Button onClick={create} disabled={saving || !template.trim()} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Crear campaña ({count ?? '?'} destinatarios)
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Campaña creada: {createdId}</div>
          <Button onClick={send} disabled={sending} variant="default" className="w-full">
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar ahora
          </Button>
          {previewSent && (
            <div className="text-sm bg-gray-50 border rounded-lg px-3 py-2">
              <div>Enviados: {previewSent.sent}, fallidos: {previewSent.failed}{previewSent.stub ? ' (stub — sin credenciales Meta)' : ''}</div>
              <a href={`/api/campaigns/${createdId}/stats`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">Ver stats JSON</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
