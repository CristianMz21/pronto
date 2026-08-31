'use client'

import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { isRecord } from '@/lib/validation/guard'

function extractApiError(json: unknown): string | undefined {
  if (!isRecord(json)) return undefined
  const msg = json['message']
  if (typeof msg === 'string' && msg.length > 0) return msg
  const err = json['error']
  if (typeof err === 'string' && err.length > 0) return err
  return undefined
}

interface Props {
  businessId: string
  currency: string
  openRegister: {
    id: string
    opening_cash: number
    expected: number
    txSum: number
    inSum: number
    outSum: number
    opened_at: string
  } | null
  history: {
    id: string
    opening_cash: number
    expected_cash: number | null
    actual_cash: number | null
    difference: number | null
    status: string
    opened_at: string
    closed_at: string | null
  }[]
  movements: {
    id: string
    type: string
    amount: number
    reason: string | null
    created_at: string
  }[]
}

export function CajaView({ currency, openRegister, history, movements }: Props): React.JSX.Element {
  const router = useRouter()
  const [opening, setOpening] = useState<string>('')
  const [actual, setActual] = useState<string>('')
  const [moveAmount, setMoveAmount] = useState<string>('')
  const [moveReason, setMoveReason] = useState<string>('')
  const [moveType, setMoveType] = useState<'in' | 'out'>('in')
  const [loading, setLoading] = useState<boolean>(false)
  const [msg, setMsg] = useState<string>('')
  // Hydration-safe date formatting: server and initial client render use deterministic
  // ISO fallback (UTC). After mount we switch to locale-aware 'es-CO' formatting.
  // This prevents text mismatch when server timezone (UTC) differs from client (America/Bogota)
  // or when Intl formatting differs between Node and browser.
  const [mounted, setMounted] = useState<boolean>(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  async function open(): Promise<void> {
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/cash/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_cash: Number(opening) || 0 }),
    })
    const json: unknown = await res.json()
    if (!res.ok) {
      const apiErr = extractApiError(json)
      setMsg(apiErr ?? `Request failed (${res.status})`)
    } else {
      setOpening('')
      router.refresh()
    }
    setLoading(false)
  }
  async function close(): Promise<void> {
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/cash/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_cash: Number(actual) || 0 }),
    })
    const json: unknown = await res.json()
    if (!res.ok) {
      const apiErr = extractApiError(json)
      setMsg(apiErr ?? `Request failed (${res.status})`)
    } else {
      setActual('')
      router.refresh()
    }
    setLoading(false)
  }
  async function addMove(): Promise<void> {
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/cash/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: moveType, amount: Number(moveAmount), reason: moveReason }),
    })
    const json: unknown = await res.json()
    if (!res.ok) {
      const apiErr =
        isRecord(json) && typeof json['error'] === 'string' ? (json['error'] as string) : undefined
      setMsg(apiErr ?? `Request failed (${res.status})`)
    } else {
      setMoveAmount('')
      setMoveReason('')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {openRegister ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Unlock className="w-4 h-4 text-green-600" /> Caja abierta —{' '}
              <span suppressHydrationWarning>
                {mounted
                  ? new Date(openRegister.opened_at).toLocaleString('es-CO', {
                      timeZone: 'America/Bogota',
                    })
                  : new Date(openRegister.opened_at).toISOString().slice(0, 16).replace('T', ' ')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-gray-500 text-xs">Apertura</div>
                <div className="font-bold">
                  {formatCurrency(Number(openRegister.opening_cash), currency)}
                </div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-gray-500 text-xs">Ventas cash</div>
                <div className="font-bold text-blue-700">
                  {formatCurrency(openRegister.txSum, currency)}
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-gray-500 text-xs">Ingresos manual</div>
                <div className="font-bold text-green-700">
                  +{formatCurrency(openRegister.inSum, currency)}
                </div>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <div className="text-gray-500 text-xs">Egresos</div>
                <div className="font-bold text-red-700">
                  -{formatCurrency(openRegister.outSum, currency)}
                </div>
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex justify-between items-center">
              <span className="text-sm font-medium">Esperado en caja</span>
              <span className="text-lg font-bold">
                {formatCurrency(openRegister.expected, currency)}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="Efectivo real contado"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <Button onClick={close} disabled={loading}>
                <Lock className="w-4 h-4 mr-1" /> Cerrar caja
              </Button>
            </div>
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={moveType}
                  onChange={(e) => setMoveType(e.target.value as 'in' | 'out')}
                  className="border rounded-lg px-2 py-2 text-sm"
                >
                  <option value="in">Ingreso</option>
                  <option value="out">Egreso</option>
                </select>
                <input
                  type="number"
                  value={moveAmount}
                  onChange={(e) => setMoveAmount(e.target.value)}
                  placeholder="Monto"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="Motivo"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <Button size="sm" onClick={addMove} disabled={loading}>
                  {moveType === 'in' ? (
                    <ArrowUpCircle className="w-4 h-4" />
                  ) : (
                    <ArrowDownCircle className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {movements.length > 0 && (
                <div className="text-xs space-y-1 max-h-40 overflow-auto">
                  {movements.map((m) => (
                    <div key={m.id} className="flex justify-between border-b py-1">
                      <span>
                        {m.type === 'in' ? '↑' : '↓'} {formatCurrency(Number(m.amount), currency)}{' '}
                        {m.reason ? `— ${m.reason}` : ''}
                      </span>
                      <span className="text-gray-400" suppressHydrationWarning>
                        {mounted
                          ? new Date(m.created_at).toLocaleTimeString('es-CO', {
                              timeZone: 'America/Bogota',
                            })
                          : new Date(m.created_at).toISOString().slice(11, 16)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {msg && <p className="text-sm text-red-600">{msg}</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Abrir caja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              No hay caja abierta. Ingresa el efectivo inicial para comenzar el día.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="Efectivo inicial"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <Button onClick={open} disabled={loading}>
                <Unlock className="w-4 h-4 mr-1" /> Abrir
              </Button>
            </div>
            {msg && <p className="text-sm text-red-600">{msg}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Historial (últimas 10)</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">Sin cierres aún</p>
          ) : (
            <div className="space-y-2 text-sm">
              {history.map((h) => (
                <div key={h.id} className="flex justify-between items-center border-b py-2">
                  <div>
                    <div className="font-medium" suppressHydrationWarning>
                      {mounted
                        ? new Date(h.opened_at).toLocaleDateString('es-CO', {
                            timeZone: 'America/Bogota',
                          })
                        : new Date(h.opened_at).toISOString().slice(0, 10)}{' '}
                      {h.status === 'open'
                        ? '— abierta'
                        : `→ ${
                            mounted && h.closed_at
                              ? new Date(h.closed_at).toLocaleDateString('es-CO', {
                                  timeZone: 'America/Bogota',
                                })
                              : h.closed_at
                                ? new Date(h.closed_at).toISOString().slice(0, 10)
                                : ''
                          }`}
                    </div>
                    <div className="text-xs text-gray-500">
                      Apertura {formatCurrency(Number(h.opening_cash), currency)} · Esperado{' '}
                      {h.expected_cash != null
                        ? formatCurrency(Number(h.expected_cash), currency)
                        : '—'}{' '}
                      · Real{' '}
                      {h.actual_cash != null
                        ? formatCurrency(Number(h.actual_cash), currency)
                        : '—'}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-bold ${Number(h.difference) < 0 ? 'text-red-600' : Number(h.difference) > 0 ? 'text-green-600' : 'text-gray-600'}`}
                  >
                    {h.difference != null
                      ? (Number(h.difference) > 0 ? '+' : '') +
                        formatCurrency(Number(h.difference), currency)
                      : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
