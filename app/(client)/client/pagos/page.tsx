'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'

import type { Client360 } from '@/lib/client-360'
import { formatCurrency } from '@/lib/utils'

function PagosInner() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? undefined
  const businessSlug = searchParams.get('business_slug') ?? 'escuderia'

  const [data, setData] = useState<Client360 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMe = useCallback(async () => {
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    params.set('business_slug', businessSlug)
    const res = await fetch(`/api/client/me?${params.toString()}`)
    const json = (await res.json()) as unknown
    if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`)
    return json as Client360
  }, [phone, businessSlug])

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetchMe()
        setData(r)
      } catch (e) {
        setError(String((e as Error).message))
      } finally {
        setLoading(false)
      }
    })()
  }, [fetchMe])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto h-64 bg-white rounded-xl border animate-pulse" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#FBF8F5] p-4">
        <div className="max-w-lg mx-auto bg-white rounded-xl border border-red-200 p-6 text-center text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }
  if (!data) return null

  const txs = data.transactions
  const deposits = data.upcoming.filter((a) => a.payment_status === 'deposit_paid')
  const hasDeposit = deposits.length > 0
  const firstDeposit = deposits[0] as (typeof deposits)[number] | undefined
  const depositAmt =
    typeof firstDeposit?.deposit_amount === 'number' ? firstDeposit.deposit_amount : 10000
  const servicePrice = typeof firstDeposit?.price === 'number' ? firstDeposit.price : 35000
  const saldo = Math.max(0, servicePrice - depositAmt)

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-gray-900">Pagos</h1>
          <p className="text-xs text-gray-500 mt-1">
            Historial desde POS · método / anticipo / saldo / propina
          </p>
        </div>

        {hasDeposit && firstDeposit && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            Anticipo: {formatCurrency(depositAmt, 'COP')} pagado · saldo{' '}
            {formatCurrency(saldo, 'COP')} en caja (stub V1, sin PSP)
            <div className="text-[11px] text-amber-700 mt-1">
              Cita{' '}
              {new Date(firstDeposit.starts_at).toLocaleDateString('es-CO', {
                timeZone: 'America/Bogota',
              })}{' '}
              · {firstDeposit.guest_name ? `para ${firstDeposit.guest_name} · ` : ''}
              {formatCurrency(servicePrice, 'COP')} total
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Historial (últimos 10)</h3>
          {txs.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">
              Sin pagos aún — tus transacciones completadas aparecerán aquí.
              <div className="text-[11px] text-gray-400 mt-1">
                Fuente: transactions status=completed
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {txs.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(t.amount, 'COP')} ·{' '}
                      <span className="font-mono text-xs">{t.payment_method}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(t.created_at).toLocaleString('es-CO', {
                        timeZone: 'America/Bogota',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      ·{' '}
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[11px] ${t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        ✓ {t.status === 'completed' ? 'Pagado' : t.status}
                      </span>
                    </div>
                    {t.tip_amount > 0 && (
                      <div className="text-[11px] text-gray-400">
                        Propina {formatCurrency(t.tip_amount, 'COP')}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 shrink-0 ml-3">#{t.id.slice(0, 8)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-gray-400 mt-3">
            Solo lectura · POS escribe transactions. Anticipo online stub V2 con Bold/Wompi.
          </div>
        </div>

        <div className="text-center">
          <a href="/client/me" className="text-xs text-gray-500 underline">
            ← Inicio 360
          </a>
          <span className="mx-2 text-gray-300">·</span>
          <a href="/client/fidelidad" className="text-xs text-gray-500 underline">
            Fidelidad
          </a>
        </div>
      </div>
    </div>
  )
}

export default function PagosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBF8F5] p-4">
          <div className="max-w-lg mx-auto h-40 bg-white rounded-xl border animate-pulse" />
        </div>
      }
    >
      <PagosInner />
    </Suspense>
  )
}
