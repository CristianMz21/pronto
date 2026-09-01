'use client'

import { formatCurrency } from '@/lib/utils'

interface Props {
  points: number
  totalVisits?: number
  onRedeem?: (pts: number) => void
}

// 10-visit loyalty or points: we show both variants
export function LoyaltyCard({ points, totalVisits = 0 }: Props) {
  const perPointValue = 100 // 100 pts = 10000 COP => 100 per point
  const redeemValue = points * perPointValue
  // Membership-like progress 7/10 example: derive from visits modulo 10
  const progress = totalVisits % 10
  const remaining = 10 - progress === 10 ? 10 : 10 - progress
  const pct = Math.min(100, Math.round((progress / 10) * 100))

  const canRedeem = points >= 100

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Mi fidelidad</h3>

      {/* Visits progress 10 */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Progreso visitas</span>
          <span className="font-medium text-gray-900">{progress}/10</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {remaining === 10 && progress === 0
            ? '¡Empezá tu tarjeta! 10 visitas → corte gratis'
            : `Te faltan ${remaining} visita(s) → corte gratis`}
        </div>
        <div className="text-[11px] text-gray-400 mt-1">Total visitas: {totalVisits}</div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Puntos</div>
            <div className="text-2xl font-bold text-amber-700">{points} pts</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Equivale a</div>
            <div className="text-sm font-medium text-gray-900">
              {formatCurrency(redeemValue, 'COP')}
            </div>
            <div className="text-[11px] text-gray-400">100 pts = $10.000</div>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          {canRedeem
            ? 'Podés canjear 100 pts en tu próxima reserva.'
            : 'Acumulás 1 pt por cada $1.000. ¡Canjeá desde 100 pts!'}
        </div>
        {canRedeem && (
          <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800">
            Usá tus puntos en <span className="font-medium">Reservar → Beneficios</span> (100 pts =
            $10.000 descuento)
          </div>
        )}
      </div>
    </div>
  )
}
