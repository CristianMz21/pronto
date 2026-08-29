'use client'

import { LayoutDashboard, CalendarDays, ShoppingCart, Users, Package, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { canAccessRoute, type CanonicalRole } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/booking', label: 'Agenda', icon: CalendarDays },
  { href: '/pos', label: 'POS', icon: ShoppingCart },
  { href: '/crm', label: 'Clientes', icon: Users },
  { href: '/inventory', label: 'Stock', icon: Package },
]

export function BottomTab({ role }: { role?: CanonicalRole | null }) {
  const pathname = usePathname()
  const visible = role ? ITEMS.filter((i) => canAccessRoute(role, i.href)) : ITEMS.slice(0, 3)
  // barbero sees 3 (dashboard/booking/pos), others see 5
  return (
    <nav
      aria-label="Navegación principal móvil"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around px-1 py-1">
        {visible.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors',
                active ? 'text-green-700 bg-green-50' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className={cn('h-5 w-5', active ? 'text-green-600' : 'text-gray-400')} />
              {label}
            </Link>
          )
        })}
        {role && canAccessRoute(role, '/settings') && (
          <Link
            href="/settings"
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors',
              pathname.startsWith('/settings')
                ? 'text-green-700 bg-green-50'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Settings
              className={cn(
                'h-5 w-5',
                pathname.startsWith('/settings') ? 'text-green-600' : 'text-gray-400',
              )}
            />
            Ajustes
          </Link>
        )}
      </div>
    </nav>
  )
}
