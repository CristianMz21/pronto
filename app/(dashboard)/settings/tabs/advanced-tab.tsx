'use client'
import { AlertCircle, Check, Loader2, Settings } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

import { type Business } from './helpers'

function LargeToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center cursor-pointer relative shrink-0 ml-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </div>
    </label>
  )
}

function BookingLeadSection({
  biz,
  setBiz,
  advancedError,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  advancedError: string
}) {
  const t = useTranslations('settings')
  const bookingLeadEnabled = biz.booking_lead_time_enabled ?? true
  const minAdvanceValue = biz.min_advance_minutes ?? 30

  function handleMinAdvanceChange(raw: string): void {
    if (raw === '') {
      setBiz((b) => ({ ...b, min_advance_minutes: 0 }))
      return
    }
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) return
    const clamped = Math.max(0, Math.min(1440, n))
    setBiz((b) => ({ ...b, min_advance_minutes: clamped }))
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 border-t border-gray-100 pt-4">
        {t('advanced.bookingHeading')}
      </h3>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {t('advanced.bookingLeadTimeEnabledLabel')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{t('advanced.bookingLeadTimeEnabledHint')}</p>
        </div>
        <LargeToggle
          checked={bookingLeadEnabled}
          onChange={(v) => setBiz((b) => ({ ...b, booking_lead_time_enabled: v }))}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500">
          {t('advanced.minAdvanceMinutesLabel')}
        </label>
        <input
          type="number"
          min={0}
          max={1440}
          value={minAdvanceValue}
          disabled={!bookingLeadEnabled}
          onChange={(e) => handleMinAdvanceChange(e.target.value)}
          className={`w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${!bookingLeadEnabled ? 'bg-gray-50 text-gray-400 border-gray-200' : 'border-gray-200'} ${advancedError ? 'border-red-300 focus:ring-red-400' : ''}`}
        />
        <p className="text-xs text-gray-400 mt-1">{t('advanced.minAdvanceMinutesHint')}</p>
        {!bookingLeadEnabled && (
          <p className="text-xs text-amber-600 mt-1">{t('advanced.minAdvanceDisabledHint')}</p>
        )}
      </div>
    </div>
  )
}

function PosSection({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const requireCashRegister = biz.require_cash_register_for_cash ?? true
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">{t('advanced.posHeading')}</h3>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {t('advanced.requireCashRegisterLabel')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{t('advanced.requireCashRegisterHint')}</p>
        </div>
        <LargeToggle
          checked={requireCashRegister}
          onChange={(v) => setBiz((b) => ({ ...b, require_cash_register_for_cash: v }))}
        />
      </div>
      <p className="text-xs text-gray-400">{t('advanced.requireCashRegisterDescription')}</p>
    </div>
  )
}

function GuestBookingSection({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const allowGuestBookings = biz.allow_guest_bookings ?? true
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Acceso clientes</h3>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Permitir reservas sin registro (invitados)
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Si está desactivado, solo clientes registrados pueden reservar online
          </p>
        </div>
        <LargeToggle
          checked={allowGuestBookings}
          onChange={(v) => setBiz((b) => ({ ...b, allow_guest_bookings: v }))}
        />
      </div>
    </div>
  )
}

export function AdvancedTab({
  biz,
  setBiz,
  isOwner,
  advancedSaving,
  advancedSaved,
  advancedError,
  onSave,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  isOwner: boolean
  advancedSaving: boolean
  advancedSaved: boolean
  advancedError: string
  onSave: () => void
}) {
  const t = useTranslations('settings')
  if (!isOwner) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">{t('advanced.ownerOnly')}</p>
          <p className="text-xs text-amber-700 mt-1">{t('advanced.ownerOnlyHint')}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-500" />
          {t('advanced.heading')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('advanced.description')}</p>
      </div>
      <BookingLeadSection biz={biz} setBiz={setBiz} advancedError={advancedError} />
      <hr className="border-gray-100" />
      <PosSection biz={biz} setBiz={setBiz} />
      <hr className="border-gray-100" />
      <GuestBookingSection biz={biz} setBiz={setBiz} />
      {advancedError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {advancedError}
        </div>
      )}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={onSave} disabled={advancedSaving}>
          {advancedSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('advanced.saving')}
            </>
          ) : advancedSaved ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              {t('advanced.saved')}
            </>
          ) : (
            t('advanced.saveButton')
          )}
        </Button>
        {advancedSaved && <span className="text-xs text-green-600">{t('advanced.savedHint')}</span>}
      </div>
    </div>
  )
}
