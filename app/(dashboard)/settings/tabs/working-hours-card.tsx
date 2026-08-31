'use client'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

import { type DayHours } from './helpers'

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
})

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center cursor-pointer relative">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </div>
    </label>
  )
}

function DayRow({
  day,
  dow,
  updateDay,
}: {
  day: DayHours
  dow: number
  updateDay: (dow: number, patch: Partial<DayHours>) => void
}) {
  const t = useTranslations('settings')
  const rawNames: unknown = t.raw('workingHours.dayNames')
  const dayNames: string[] = Array.isArray(rawNames) ? (rawNames as string[]) : []
  const dayName: string = dayNames[dow] ?? String(dow)
  const hasBreak = !!(day.break_start && day.break_end)

  return (
    <div key={dow}>
      <div className="flex items-center gap-3">
        <ToggleSwitch checked={day.is_open} onChange={(v) => updateDay(dow, { is_open: v })} />
        <span
          className={`w-10 text-sm font-medium ${day.is_open ? 'text-gray-900' : 'text-gray-400'}`}
        >
          {dayName}
        </span>
        {renderDayHoursContent(day, dow, updateDay, t)}
      </div>
      {renderBreakRowContent(day, dow, updateDay, hasBreak, t)}
    </div>
  )
}

function renderDayHoursContent(
  day: DayHours,
  dow: number,
  updateDay: (dow: number, patch: Partial<DayHours>) => void,
  t: ReturnType<typeof useTranslations<'settings'>>,
) {
  if (!day.is_open) {
    return <span className="text-sm text-gray-300 flex-1">{t('workingHours.closed')}</span>
  }
  return (
    <div className="flex items-center gap-2 flex-1">
      <span className="text-xs text-gray-400">{t('workingHours.from')}</span>
      <select
        value={day.open_time}
        onChange={(e) => updateDay(dow, { open_time: e.target.value })}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {TIME_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-400">{t('workingHours.to')}</span>
      <select
        value={day.close_time}
        onChange={(e) => updateDay(dow, { close_time: e.target.value })}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {TIME_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

function renderBreakRowContent(
  day: DayHours,
  dow: number,
  updateDay: (dow: number, patch: Partial<DayHours>) => void,
  hasBreak: boolean,
  t: ReturnType<typeof useTranslations<'settings'>>,
) {
  if (!day.is_open) return null
  return (
    <div className="flex items-center gap-3 pl-12">
      <ToggleSwitch
        checked={hasBreak}
        onChange={(v) =>
          updateDay(
            dow,
            v
              ? { break_start: day.open_time, break_end: day.close_time }
              : { break_start: null, break_end: null },
          )
        }
      />
      <span className="w-24 text-xs text-gray-500">{t('workingHours.addBreak')}</span>
      {hasBreak && day.break_start && day.break_end && (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-gray-400">{t('workingHours.from')}</span>
          <select
            value={day.break_start}
            onChange={(e) => updateDay(dow, { break_start: e.target.value })}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">{t('workingHours.to')}</span>
          <select
            value={day.break_end}
            onChange={(e) => updateDay(dow, { break_end: e.target.value })}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

export function WorkingHoursCard({
  hours,
  updateDay,
  savingHours,
  savedHours,
  validationError,
  onSave,
}: {
  hours: DayHours[]
  updateDay: (dow: number, patch: Partial<DayHours>) => void
  savingHours: boolean
  savedHours: boolean
  validationError: string | null
  onSave: () => void
}) {
  const t = useTranslations('settings')
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-5">{t('workingHours.heading')}</h2>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
          const day = hours.find((h) => h.day_of_week === dow)!
          return <DayRow key={dow} day={day} dow={dow} updateDay={updateDay} />
        })}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={onSave} disabled={savingHours}>
          {savingHours ? (
            t('workingHours.saving')
          ) : savedHours ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              {t('workingHours.saved')}
            </>
          ) : (
            t('workingHours.saveButton')
          )}
        </Button>
        {validationError && <p className="text-xs text-red-500">{validationError}</p>}
      </div>
    </div>
  )
}
