'use client'

import { Heart, Home, Bell, CreditCard, Scissors, Calendar } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/client/me', label: 'Inicio', icon: Home, testId: 'tab-inicio' },
  { href: '/client/reservas', label: 'Reservas', icon: Calendar, testId: 'tab-reservas' },
  { href: '/client/estilo', label: 'Estilo', icon: Scissors, testId: 'tab-estilo' },
  { href: '/client/fidelidad', label: 'Fidelidad', icon: Heart, testId: 'tab-fidelidad' },
  { href: '/client/pagos', label: 'Pagos', icon: CreditCard, testId: 'tab-pagos' },
  { href: '/client/notificaciones', label: 'Notifs', icon: Bell, testId: 'tab-notifs' },
]

export function BottomTabClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <nav
      aria-label="Navegación cliente móvil"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto max-w-[375px] flex items-center justify-around px-0.5 py-1">
        {ITEMS.map(({ href, label, icon: Icon, testId }) => {
          // active if pathname starts with href (covers /client/me?phone, /client/reservas/espera etc)
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === '/client/me' && pathname === '/client/me')
          // Preserve phone query if present for client identity across tabs
          const phone = searchParams.get('phone')
          const businessSlug = searchParams.get('business_slug')
          const params = new URLSearchParams()
          if (phone) params.set('phone', phone)
          if (businessSlug) params.set('business_slug', businessSlug)
          const hrefWithQs = params.toString() ? `${href}?${params.toString()}` : href
          return (
            <Link
              key={href}
              href={hrefWithQs}
              data-testid={testId}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] font-medium leading-none transition-colors min-w-[56px]',
                active ? 'text-amber-700 bg-amber-50' : 'text-gray-500 hover:text-gray-700',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-amber-600' : 'text-gray-400')} />
              <span className="truncate max-w-[52px]">{label}</span>
            </Link>
          )
        })}
      </div>
      {/* Extra row for Gift on small overflow - hidden on 375+ because we fit 6, but keep accessible via fidelidad? Keep gift link outside tab, via fidelidad/regalo quick link */}
    </nav>
  )
}
