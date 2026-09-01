'use client'

import { formatCurrency } from '@/lib/utils'

interface Promo {
  id: string
  name: string
  type: string
  value: number
  promo_code: string | null
  valid_from?: string
  valid_to?: string | null
}

function discountLabel(p: Promo): string {
  if (p.type === 'percent') return `${p.value}% OFF`
  if (p.type === 'fixed') return `${formatCurrency(p.value, 'COP')} OFF`
  return `${formatCurrency(p.value, 'COP')} dto`
}

export function PromoCard({ promo }: { promo: Promo }) {
  const until = promo.valid_to
    ? new Date(promo.valid_to).toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        day: 'numeric',
        month: 'short',
      })
    : null

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">🎁 {promo.name}</div>
          <div className="text-xs text-gray-600 mt-1">
            {discountLabel(promo)} {promo.promo_code ? `· Código: ${promo.promo_code}` : ''}
          </div>
          {until && <div className="text-[11px] text-gray-500 mt-1">Hasta {until}</div>}
        </div>
        <div className="shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-amber-500 text-white">
          {promo.type === 'percent' ? `${promo.value}%` : formatCurrency(promo.value, 'COP')}
        </div>
      </div>
      {promo.promo_code && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-mono bg-white border border-amber-200 px-2 py-1 rounded-lg">
            {promo.promo_code}
          </span>
          <span className="text-[11px] text-gray-500">Usalo al reservar</span>
        </div>
      )}
    </div>
  )
}

export function PromoList({
  promos,
  businessSlug = 'escuderia',
}: {
  promos: Promo[]
  businessSlug?: string
}) {
  if (promos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="text-sm font-medium text-gray-900">Sin promos activas</div>
        <div className="text-xs text-gray-500 mt-1">
          Volvé pronto — te avisamos por WhatsApp (1 por semana máx) si calificás por inactivo 30d o
          cumpleaños.
        </div>
        <a
          href={`/book/${businessSlug}`}
          className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white"
        >
          Reservar igual
        </a>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Ofertas para vos</h3>
      {promos.map((p) => (
        <PromoCard key={p.id} promo={p} />
      ))}
      <div className="text-[11px] text-gray-400">
        Máx 1 promo/semana — no spam. Inactivo 30d / cumpleaños en 7d califican.
      </div>
    </div>
  )
}
