'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
  actions?: React.ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  // Callers pass an arbitrary action row (0-3+ buttons/links). Rather than
  // trust every caller to protect against overflow, the actions row owns its
  // own overflow-x here — a real scroll container clips its own overflow
  // instead of stretching the sticky header (and, on this app's fixed-shell
  // layout, the page's actual horizontal scroll container) wider than the
  // viewport. See settings-tabs.tsx for the same pattern.
  const actionsRef = useRef<HTMLDivElement>(null)
  const [actionsOverflow, setActionsOverflow] = useState(false)

  useEffect(() => {
    function measure() {
      const el = actionsRef.current
      if (!el) return
      setActionsOverflow(el.scrollWidth > el.clientWidth + 1)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [actions])

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 gap-4 sticky top-0 z-10">
      <h1 className="text-base font-semibold text-gray-900 flex-1">{title}</h1>
      {actions && (
        <div className="relative min-w-0">
          <div
            ref={actionsRef}
            className="flex items-center gap-2 overflow-x-auto flex-nowrap min-w-0 max-w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {actions}
          </div>
          {actionsOverflow && (
            <div className="pointer-events-none absolute top-0 right-0 h-full w-6 bg-gradient-to-l from-white to-transparent" />
          )}
        </div>
      )}
      <button className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0">
        <Bell className="w-4 h-4" />
      </button>
    </header>
  )
}
