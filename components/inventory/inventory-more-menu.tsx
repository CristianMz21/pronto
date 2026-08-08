'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { InventoryImportButton } from './inventory-import-button'
import { InventoryExportButton } from './inventory-export-button'

interface Props {
  atLimit?: boolean
}

export function InventoryMoreMenu({ atLimit }: Props) {
  const t = useTranslations('inventory')
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // The trigger sits inside Header's overflow-x-auto actions row (needed to
  // isolate horizontal scroll there — see header.tsx). Per the CSS overflow
  // spec, setting overflow-x without overflow-y forces overflow-y to 'auto'
  // too, so an absolutely-positioned popover nested inside it gets clipped
  // instead of floating above the page. Portal it to <body> with viewport
  // coordinates instead, so it's immune to any ancestor's overflow/clipping.
  const PANEL_WIDTH = 176 // w-44
  const EDGE_MARGIN = 8

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      // Anchoring purely to the button's right edge can push the panel past
      // the left edge of the viewport when the button isn't near the right
      // side (e.g. narrow phones where "More actions" sits mid-header) —
      // clamp so the panel always stays fully on-screen.
      let right = window.innerWidth - rect.right
      const left = window.innerWidth - right - PANEL_WIDTH
      if (left < EDGE_MARGIN) right = window.innerWidth - EDGE_MARGIN - PANEL_WIDTH
      setCoords({ top: rect.bottom + 4, right })
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="sm:hidden shrink-0">
      <button
        ref={btnRef}
        onClick={toggle}
        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
        aria-label={t('moreActions')}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && mounted && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right }}
          className="w-44 max-w-[calc(100vw-16px)] bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 space-y-1 [&_button]:w-full [&_button]:justify-start"
        >
          <InventoryImportButton atLimit={atLimit} />
          <InventoryExportButton />
        </div>,
        document.body
      )}
    </div>
  )
}
