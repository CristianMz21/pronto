'use client'

import { Suspense, useState } from 'react'

import { formatCurrency } from '@/lib/utils'

function RegaloInner() {
  const [amount, setAmount] = useState('50000')
  const [recipient, setRecipient] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ code: string; amount: number; balance: number } | null>(
    null,
  )
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemResult, setRedeemResult] = useState<{
    amount: number
    balance: number
    code: string
    expired?: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleBuy(): Promise<void> {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          recipient_name: recipient.trim() || null,
          recipient_email: email.trim() || null,
          business_slug: 'escuderia',
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        code?: string
        amount?: number
        balance?: number
      }
      if (!res.ok) throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`)
      setResult({ code: String(j.code), amount: Number(j.amount), balance: Number(j.balance) })
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setSaving(false)
    }
  }

  async function handleRedeem(): Promise<void> {
    setError(null)
    try {
      const res = await fetch(`/api/gift-cards?code=${encodeURIComponent(redeemCode.trim())}`)
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        amount?: number
        balance?: number
        code?: string
        expired?: boolean
      }
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setRedeemResult({
        amount: Number(j.amount),
        balance: Number(j.balance),
        code: String(j.code),
        expired: !!j.expired,
      })
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-gray-900">🎁 Tarjetas regalo</h1>
          <p className="text-xs text-gray-500 mt-1">
            Compra stub V1 · code único · balance COP · redención parcial V2
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900">Comprar tarjeta</h3>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs text-gray-500">Monto COP</label>
              <input
                type="number"
                min={1000}
                max={2000000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Para (nombre)</label>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Nombre del destinatario"
                maxLength={80}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Email destinatario (opcional)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="destinatario@mail.com"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void handleBuy()
              }}
              disabled={saving}
              className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Comprar tarjeta'}
            </button>
            {result && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs">
                <div className="font-mono font-bold text-green-800">CODE: {result.code}</div>
                <div className="text-gray-600 mt-1">
                  Monto {formatCurrency(result.amount, 'COP')} · Balance{' '}
                  {formatCurrency(result.balance, 'COP')}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  Guardá este código — sirve para canje parcial futuro.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900">Canjear / consultar</h3>
          <div className="mt-3 flex gap-2">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => {
                void handleRedeem()
              }}
              className="text-xs font-medium px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
            >
              Consultar
            </button>
          </div>
          {redeemResult && (
            <div className="mt-3 bg-gray-50 border rounded-lg p-3 text-xs">
              <div className="font-mono">
                {redeemResult.code} · {formatCurrency(redeemResult.balance, 'COP')} /{' '}
                {formatCurrency(redeemResult.amount, 'COP')}
              </div>
              {redeemResult.expired && <div className="text-red-600 mt-1">Expirada</div>}
            </div>
          )}
          <div className="text-[11px] text-gray-400 mt-2">
            GET /api/gift-cards?code= — stub V1, flujo compra parcial V2 descuenta balance
          </div>
        </div>

        <div className="text-center">
          <a href="/client/me" className="text-xs text-gray-500 underline">
            ← Inicio 360
          </a>
        </div>
      </div>
    </div>
  )
}

export default function RegaloPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBF8F5] p-4">
          <div className="max-w-lg mx-auto h-40 bg-white rounded-xl border animate-pulse" />
        </div>
      }
    >
      <RegaloInner />
    </Suspense>
  )
}
