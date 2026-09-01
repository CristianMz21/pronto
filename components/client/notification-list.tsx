'use client'

type NotificationItem = {
  id: string
  type: string
  channel: string
  sent_at: string
  icon: string
  title: string
  ref_id?: string
}

export function NotificationList({
  notifications,
  onMarkRead,
}: {
  notifications: NotificationItem[]
  onMarkRead?: (id: string) => void
}) {
  if (notifications.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
        <div className="text-2xl mb-2">🔕</div>
        <div className="text-sm font-medium text-gray-900">Sin notificaciones</div>
        <div className="text-xs text-gray-500 mt-1">
          Te avisamos por WhatsApp/email/push cuando haya novedades (cita, lista de espera, promos).
        </div>
        <div className="text-[11px] text-gray-400 mt-2">
          Dedup 1h: no duplicamos mismo aviso en 60 min
        </div>
      </div>
    )
  }

  function formatBogota(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso.slice(0, 16)
    }
  }

  const channelBadge: Record<string, string> = {
    whatsapp: 'bg-green-100 text-green-700',
    email: 'bg-blue-100 text-blue-700',
    push: 'bg-amber-100 text-amber-700',
    telegram: 'bg-sky-100 text-sky-700',
    viber: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3"
        >
          <div className="text-xl shrink-0">{n.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900">{n.title}</div>
            <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] ${channelBadge[n.channel] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {n.channel}
              </span>
              <span>·</span>
              <span className="font-mono text-[11px]">{n.type}</span>
              <span>·</span>
              <span>{formatBogota(n.sent_at)}</span>
            </div>
          </div>
          {onMarkRead && (
            <button
              type="button"
              onClick={() => onMarkRead(n.id)}
              className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
              aria-label="Marcar leída"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div className="text-[11px] text-gray-400 text-center">
        Ventana dedup 1h — no duplicamos avisos iguales dentro de 60 minutos
      </div>
    </div>
  )
}
