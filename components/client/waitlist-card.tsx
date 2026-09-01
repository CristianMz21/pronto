'use client'

interface WaitlistEntry {
  id: string
  business_id: string
  location_id: string | null
  service_id: string
  employee_id: string | null
  client_id: string
  desired_at: string
  status: 'waiting' | 'notified' | 'converted' | 'expired' | 'cancelled'
  notified_at: string | null
  created_at: string
  services?: { id: string; name: string } | null
  employees?: { id: string; name: string } | null
}

function statusBadge(s: WaitlistEntry['status']) {
  const map: Record<string, { label: string; cls: string }> = {
    waiting: { label: 'En espera', cls: 'bg-amber-100 text-amber-800' },
    notified: { label: '¡Se liberó!', cls: 'bg-green-100 text-green-700' },
    converted: { label: 'Convertida', cls: 'bg-blue-100 text-blue-700' },
    expired: { label: 'Expirada', cls: 'bg-gray-100 text-gray-500' },
    cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-600' },
  }
  return map[s] ?? { label: s, cls: 'bg-gray-100 text-gray-700' }
}

function formatDesired(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso.slice(0, 16)
  }
}

export function WaitlistCard({
  entry,
  onCancel,
  onConvert,
  businessSlug = 'escuderia',
}: {
  entry: WaitlistEntry
  onCancel?: (id: string) => void
  onConvert?: (id: string) => void
  businessSlug?: string
}) {
  const badge = statusBadge(entry.status)
  const isWaiting = entry.status === 'waiting'
  const isNotified = entry.status === 'notified'
  const ttlInfo =
    isNotified && entry.notified_at
      ? (() => {
          const exp = new Date(new Date(entry.notified_at).getTime() + 30 * 60_000)
          const mins = Math.max(0, Math.round((exp.getTime() - Date.now()) / 60000))
          return `Expira en ${mins} min`
        })()
      : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-medium text-gray-900">
          {entry.services?.name ?? 'Servicio'}{' '}
          {entry.employees?.name ? `· ${entry.employees.name}` : ''}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="text-xs text-gray-600">{formatDesired(entry.desired_at)}</div>
      {ttlInfo && <div className="text-xs text-amber-700 mt-1">{ttlInfo} — confirmá rápido.</div>}
      {isNotified && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-800">
          Se liberó {formatDesired(entry.desired_at)}{' '}
          {entry.employees?.name ? `con ${entry.employees.name}` : ''} —{' '}
          <span className="font-medium">¡Reservá ahora!</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {isNotified && onConvert && (
          <a
            href={`/book/${businessSlug}?service=${entry.service_id}${entry.employee_id ? `&employee=${entry.employee_id}` : ''}`}
            onClick={(e) => {
              e.preventDefault()
              onConvert(entry.id)
            }}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700"
          >
            Confirmar ahora
          </a>
        )}
        {isWaiting && (
          <button
            type="button"
            onClick={() => onCancel?.(entry.id)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            Salir de espera
          </button>
        )}
        {isNotified && (
          <button
            type="button"
            onClick={() => onCancel?.(entry.id)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black"
          >
            Confirmar (30m TTL)
          </button>
        )}
      </div>
      <div className="text-[11px] text-gray-400 mt-2">
        ID {entry.id.slice(0, 8)} · {new Date(entry.created_at).toLocaleDateString('es-CO')}
      </div>
    </div>
  )
}
