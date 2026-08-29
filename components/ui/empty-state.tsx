import { Crown, Tag, Building2, Megaphone, CalendarDays, SearchX } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EmptyVariant = 'memberships' | 'promotions' | 'locations' | 'campaigns' | 'generic' | 'search'

const icons: Record<EmptyVariant, React.ComponentType<{ className?: string }>> = {
  memberships: Crown,
  promotions: Tag,
  locations: Building2,
  campaigns: Megaphone,
  generic: CalendarDays,
  search: SearchX,
}

const copy: Record<EmptyVariant, { title: string; description: string }> = {
  memberships: {
    title: 'Sin membresías aún',
    description:
      'Crea tu primer plan — ej. “4 cortes/mes $99k”. Los clientes verán sus usos restantes al reservar.',
  },
  promotions: {
    title: 'Sin promociones activas',
    description:
      'Configura un descuento por segmento, día o servicio y pruébalo antes de publicar.',
  },
  locations: {
    title: 'Sin sucursales adicionales',
    description:
      'La sede por defecto “Escudería Centro” ya está creada. Agrega Norte, Sur u otras sedes aquí.',
  },
  campaigns: {
    title: 'Sin campañas aún',
    description:
      'Elige un segmento (p. ej. inactivos 42 días) y lanza tu primera campaña de WhatsApp en 30 s.',
  },
  generic: {
    title: 'Nada por aquí todavía',
    description: 'Cuando haya datos, aparecerán aquí. Agrega el primer registro para empezar.',
  },
  search: {
    title: 'Sin resultados',
    description: 'Prueba ajustando filtros o el término de búsqueda.',
  },
}

export function EmptyState({
  variant = 'generic',
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: {
  variant?: EmptyVariant
  title?: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  className?: string
}) {
  const Icon = icons[variant]
  const defaults = copy[variant]
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
        <Icon className="h-6 w-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900">{title ?? defaults.title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
        {description ?? defaults.description}
      </p>
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-4">
          {actionHref ? (
            <Link href={actionHref}>
              <Button size="sm">{actionLabel}</Button>
            </Link>
          ) : (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function InlineEmpty({ message, className }: { message: string; className?: string }) {
  return <p className={cn('py-8 text-center text-sm text-gray-400', className)}>{message}</p>
}
