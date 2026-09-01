'use client'

import type { AppointmentSummary } from '@/lib/client-360'

function formatBogotaShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

function statusBadge(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: 'Completada', cls: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-700' },
    cancelled_late: { label: 'Cancelada (con cargo)', cls: 'bg-red-100 text-red-700' },
    no_show: { label: 'No asistió', cls: 'bg-amber-100 text-amber-700' },
    confirmed: { label: 'Confirmada', cls: 'bg-blue-100 text-blue-700' },
    checked_in: { label: 'En espera', cls: 'bg-amber-100 text-amber-700' },
    in_service: { label: 'En servicio', cls: 'bg-purple-100 text-purple-700' },
  }
  return map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
}

export function HistoryList({
  history,
  businessSlug = 'escuderia',
}: {
  history: AppointmentSummary[]
  businessSlug?: string
}) {
  if (history.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Historial</h3>
        <p className="text-sm text-gray-500">Aún no hay historial.</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Historial</h3>
        <span className="text-xs text-gray-400">{history.length} citas</span>
      </div>
      <div className="space-y-2">
        {history.map((h) => {
          const badge = statusBadge(h.status)
          const rebookHref = h.service_id
            ? `/book/${businessSlug}?service=${h.service_id}${h.employee_id ? `&employee=${h.employee_id}` : ''}`
            : `/book/${businessSlug}`
          return (
            <div
              key={h.id}
              className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {h.service_name ?? 'Cita'} {h.employee_name ? `· ${h.employee_name}` : ''} ·{' '}
                  {formatBogotaShort(h.starts_at)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {h.price != null && (
                    <span className="text-xs text-gray-600">
                      ${Number(h.price).toLocaleString('es-CO')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <a
                  href={rebookHref}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black"
                >
                  Reservar nuevamente
                </a>
                <a
                  href={`/book/${businessSlug}?service=${h.service_id ?? ''}`}
                  className="text-xs text-blue-600 hover:underline hidden sm:inline"
                >
                  Ver detalles
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
