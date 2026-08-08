'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface DatePickerProps {
  value: string               // YYYY-MM-DD
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** JS weekday numbers (0=Sun, 6=Sat) that should be non-selectable */
  disabledWeekdays?: number[]
  /** Minimum selectable date YYYY-MM-DD — days before it are greyed out */
  minDate?: string
}

function parseDate(val: string): Date | null {
  if (!val || val.length < 10) return null
  const d = new Date(val + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  className = '',
  disabledWeekdays,
  minDate,
}: DatePickerProps) {
  const dp = useTranslations('datePicker')
  const MONTHS = dp.raw('months') as string[]
  const DAY_NAMES = dp.raw('days') as string[]
  const today = new Date()
  const parsed = parseDate(value)

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth())
  const ref = useRef<HTMLDivElement>(null)

  // Sync view to value when value changes externally
  useEffect(() => {
    const d = parseDate(value)
    if (d) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }
  }, [value])

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // ── Calendar helpers ──────────────────────────────────────────────────────
  function daysInMonth(y: number, m: number) {
    return new Date(y, m + 1, 0).getDate()
  }

  // Monday-based: Mon=0 … Sun=6
  function firstWeekday(y: number, m: number) {
    const day = new Date(y, m, 1).getDay() // 0=Sun
    return day === 0 ? 6 : day - 1
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  /** Returns true if the given day number in the current view is disabled */
  function isDayDisabled(day: number): boolean {
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    const dateStr = `${viewYear}-${mm}-${dd}`

    if (minDate && dateStr < minDate) return true

    if (disabledWeekdays?.length) {
      const dow = new Date(viewYear, viewMonth, day).getDay() // 0=Sun, 6=Sat
      if (disabledWeekdays.includes(dow)) return true
    }

    return false
  }

  function selectDay(day: number) {
    if (isDayDisabled(day)) return
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    onChange(`${viewYear}-${mm}-${dd}`)
    setOpen(false)
  }

  function goToday() {
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
    setViewYear(yyyy); setViewMonth(today.getMonth())
    setOpen(false)
  }

  // Build grid: leading nulls + day numbers + trailing nulls
  const total = daysInMonth(viewYear, viewMonth)
  const leading = firstWeekday(viewYear, viewMonth)
  const cells: (number | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selDay = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth
    ? parsed.getDate() : null
  const todayDay = today.getFullYear() === viewYear && today.getMonth() === viewMonth
    ? today.getDate() : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* Text input + calendar icon */}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            // Auto-insert dashes as user types digits
            let v = e.target.value.replace(/\D/g, '').slice(0, 8)
            if (v.length >= 5) v = `${v.slice(0, 4)}-${v.slice(4)}`
            if (v.length >= 8) v = `${v.slice(0, 7)}-${v.slice(7)}`
            onChange(v)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          maxLength={10}
          className="w-full border border-gray-200 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {/* Dropdown calendar */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl border border-gray-200 shadow-xl p-3 w-64 select-none">
          {/* Month / year header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day name headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              const disabled = day !== null && isDayDisabled(day)
              return (
                <div key={i} className="flex items-center justify-center">
                  {day ? (
                    <button
                      type="button"
                      onClick={() => selectDay(day)}
                      disabled={disabled}
                      title={disabled ? undefined : undefined}
                      className={[
                        'w-8 h-8 rounded-full text-sm transition-colors',
                        disabled
                          ? 'text-gray-300 cursor-not-allowed'
                          : selDay === day
                            ? 'bg-blue-600 text-white font-semibold'
                            : todayDay === day
                              ? 'border-2 border-blue-500 text-blue-600 font-semibold hover:bg-blue-50'
                              : 'text-gray-700 hover:bg-gray-100',
                      ].join(' ')}
                    >
                      {day}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* Today shortcut */}
          <div className="mt-2 pt-2 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={goToday}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium py-0.5"
            >
              {dp('today')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
