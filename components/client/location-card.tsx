'use client'

import { useEffect, useState } from 'react'

interface LocationRow {
  id: string
  name: string
  slug: string
  address: string | null
  phone: string | null
  is_active: boolean
}

interface BusinessRow {
  id: string
  name: string
  slug: string
  address: string | null
  phone: string | null
  timezone: string
}

interface Props {
  businessSlug?: string
  compact?: boolean
}

export function LocationCard({ businessSlug = 'escuderia', compact = false }: Props) {
  const [locs, setLocs] = useState<LocationRow[]>([])
  const [biz, setBiz] = useState<BusinessRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState<string>('Lun–Sáb 09:00–20:00 · break 13–14')

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        // Business via slug fallback to service
        const bRes = await fetch(`/api/businesses?slug=${encodeURIComponent(businessSlug)}`).catch(
          () => null,
        )
        if (bRes && bRes.ok) {
          const j = (await bRes.json().catch(() => null)) as BusinessRow | null
          if (!cancelled && j?.id) setBiz(j)
        }
        // Locations
        const lRes = await fetch(
          `/api/locations?business_slug=${encodeURIComponent(businessSlug)}`,
        ).catch(() => null)
        if (lRes && lRes.ok) {
          const j = (await lRes.json().catch(() => null)) as LocationRow[] | null
          if (!cancelled && Array.isArray(j) && j.length) setLocs(j)
        } else {
          // Fallback via supabase public endpoint if custom API not present: try /api/client/me business
          if (!cancelled) setLocs([])
        }
        // Business hours fallback generic
        try {
          const hRes = await fetch(
            `/api/business-hours?business_slug=${encodeURIComponent(businessSlug)}`,
          ).catch(() => null)
          if (hRes && hRes.ok) {
            const h = (await hRes.json().catch(() => [])) as Array<{
              day_of_week: number
              is_open: boolean
              open_time: string
              close_time: string
              break_start?: string
              break_end?: string
            }>
            if (!cancelled && Array.isArray(h) && h.length) {
              const open = h.find((x) => x.is_open)
              if (open)
                setHours(
                  `Lun–Sáb ${open.open_time}–${open.close_time}${open.break_start ? ` · break ${open.break_start}–${open.break_end}` : ''}`,
                )
            }
          }
        } catch {}
      } catch {}
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [businessSlug])

  if (loading) {
    return <div className="bg-white rounded-xl border p-4 h-28 animate-pulse" />
  }

  // If no locations API, synthesize from business
  const displayLocs =
    locs.length > 0
      ? locs
      : biz
        ? [
            {
              id: biz.id,
              name: biz.name,
              slug: biz.slug,
              address: biz.address,
              phone: biz.phone,
              is_active: true,
            },
          ]
        : [
            {
              id: 'escuderia',
              name: 'Barbería Escudería',
              slug: 'escuderia',
              address: null,
              phone: null,
              is_active: true,
            },
          ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Barbería Escudería ★4.9</h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">
          Abierta
        </span>
      </div>
      {!compact && (
        <p className="text-xs text-gray-500 mt-1">
          Experiencia premium · centro de la ciudad · PWA instalable
        </p>
      )}
      <div className="mt-3 space-y-3">
        {displayLocs.slice(0, 2).map((l) => (
          <div key={l.id} className="border border-gray-100 rounded-lg p-3">
            <div className="text-sm font-medium text-gray-900">📍 {l.name}</div>
            <div className="text-xs text-gray-500 mt-1">
              {l.address ?? 'Calle XX # — Centro · Bogotá'}
            </div>
            <div className="text-xs text-gray-500 mt-1">{hours} · America/Bogota</div>
            {l.phone && <div className="text-xs text-gray-600 mt-1">Tel: {l.phone}</div>}
            <div className="flex flex-wrap gap-2 mt-3">
              <a
                href={
                  l.address
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}`
                    : 'https://maps.google.com/?q=barberia+escuderia+bogota'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
              >
                Cómo llegar
              </a>
              <a
                href={
                  l.phone
                    ? `https://wa.me/${l.phone.replace(/\D/g, '')}`
                    : `https://wa.me/573001234567`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                WhatsApp
              </a>
              <a
                href={l.phone ? `tel:${l.phone}` : 'tel:+573001234567'}
                className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                Llamar
              </a>
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-gray-400 mt-3 text-center">
        Datos desde locations 044 · business_hours + holidays
      </div>
    </div>
  )
}
