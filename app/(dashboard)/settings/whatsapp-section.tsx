'use client'

import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

interface Props {
  businessId: string
  initialPhoneNumberId: string | null
  initialAccessToken: string | null
}

export function WhatsAppSection({ businessId, initialPhoneNumberId, initialAccessToken }: Props) {
  const [phoneNumberId, setPhoneNumberId] = useState(initialPhoneNumberId ?? '')
  const [accessToken, setAccessToken] = useState(initialAccessToken ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setStatus('idle')
    setMsg('')
    try {
      const res = await fetch('/api/business/whatsapp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          phone_number_id: phoneNumberId.trim(),
          access_token: accessToken.trim(),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMsg(j.error ?? 'Failed to save')
        setSaving(false)
        return
      }
      // If credentials provided, verify via Meta Graph
      if (phoneNumberId.trim() && accessToken.trim()) {
        setStatus('loading')
        const verifyRes = await fetch('/api/business/whatsapp-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            phone_number_id: phoneNumberId.trim(),
            access_token: accessToken.trim(),
            verify: true,
          }),
        })
        const v = await verifyRes.json()
        if (v.ok) {
          setStatus('ok')
          setMsg('Verificado con Meta Cloud v20 ✓ — listo para campañas')
        } else {
          setStatus('error')
          setMsg(v.error ?? 'No verificado — revisa phone_number_id / access_token')
        }
      } else {
        setStatus('ok')
        setMsg('Guardado (sin verificación — modo stub para campañas)')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setStatus('error')
      setMsg(String((e as Error).message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">WhatsApp Cloud API (Meta v20)</h3>
        <p className="text-xs text-gray-500 mt-1">
          Configura <code className="bg-gray-100 px-1 rounded">meta_whatsapp_phone_number_id</code>{' '}
          y <code className="bg-gray-100 px-1 rounded">access_token</code> por business. Si no
          configurás, las campañas funcionan en <strong>modo stub</strong> (loguean sin enviar).
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Phone Number ID</label>
          <input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Access Token</label>
          <input
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="EAA..."
            type="password"
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || status === 'loading'} size="sm">
          {saving || status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          Guardar & verificar
        </Button>
        {saved && <span className="text-xs text-green-600">Guardado ✓</span>}
        {status === 'ok' && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="w-4 h-4" /> {msg}
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="w-4 h-4" /> {msg}
          </span>
        )}
      </div>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 border">
        Verificación hace{' '}
        <code>GET https://graph.facebook.com/v20.0/{'{phoneNumberId}'}?fields=verified_name</code>{' '}
        con Bearer token. Si usás token temporal, requiere renovar. Plantillas deben estar aprobadas
        en Meta Dashboard para <code>type: template</code>.
      </div>
    </div>
  )
}
