'use client'
import { Check } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { type Business, CURRENCIES, getCurrencySelectValue } from './helpers'

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'UTC', label: '(UTC+0) UTC' },
  { value: 'Europe/London', label: '(UTC+0) London' },
  { value: 'Europe/Paris', label: '(UTC+1) Paris' },
  { value: 'Europe/Berlin', label: '(UTC+1) Berlin' },
  { value: 'Europe/Rome', label: '(UTC+1) Rome' },
  { value: 'Europe/Madrid', label: '(UTC+1) Madrid' },
  { value: 'Europe/Amsterdam', label: '(UTC+1) Amsterdam' },
  { value: 'Europe/Brussels', label: '(UTC+1) Brussels' },
  { value: 'Europe/Vienna', label: '(UTC+1) Vienna' },
  { value: 'Europe/Warsaw', label: '(UTC+1) Warsaw' },
  { value: 'Europe/Prague', label: '(UTC+1) Prague' },
  { value: 'Europe/Budapest', label: '(UTC+1) Budapest' },
  { value: 'Europe/Bucharest', label: '(UTC+2) Bucharest' },
  { value: 'Europe/Sofia', label: '(UTC+2) Sofia' },
  { value: 'Europe/Athens', label: '(UTC+2) Athens' },
  { value: 'Europe/Kiev', label: '(UTC+2) Kyiv' },
  { value: 'Europe/Minsk', label: '(UTC+3) Minsk' },
  { value: 'Europe/Moscow', label: '(UTC+3) Moscow' },
  { value: 'Europe/Istanbul', label: '(UTC+3) Istanbul' },
  { value: 'Asia/Dubai', label: '(UTC+4) Dubai' },
  { value: 'Asia/Karachi', label: '(UTC+5) Karachi' },
  { value: 'Asia/Kolkata', label: '(UTC+5:30) Kolkata' },
  { value: 'Asia/Dhaka', label: '(UTC+6) Dhaka' },
  { value: 'Asia/Bangkok', label: '(UTC+7) Bangkok' },
  { value: 'Asia/Singapore', label: '(UTC+8) Singapore' },
  { value: 'Asia/Shanghai', label: '(UTC+8) Shanghai' },
  { value: 'Asia/Tokyo', label: '(UTC+9) Tokyo' },
  { value: 'Asia/Seoul', label: '(UTC+9) Seoul' },
  { value: 'Australia/Sydney', label: '(UTC+10) Sydney' },
  { value: 'Australia/Melbourne', label: '(UTC+10) Melbourne' },
  { value: 'Pacific/Auckland', label: '(UTC+12) Auckland' },
  { value: 'America/New_York', label: '(UTC-5) New York' },
  { value: 'America/Toronto', label: '(UTC-5) Toronto' },
  { value: 'America/Chicago', label: '(UTC-6) Chicago' },
  { value: 'America/Mexico_City', label: '(UTC-6) Mexico City' },
  { value: 'America/Denver', label: '(UTC-7) Denver' },
  { value: 'America/Los_Angeles', label: '(UTC-8) Los Angeles' },
  { value: 'America/Vancouver', label: '(UTC-8) Vancouver' },
  { value: 'America/Anchorage', label: '(UTC-9) Anchorage' },
  { value: 'Pacific/Honolulu', label: '(UTC-10) Honolulu' },
  { value: 'America/Bogota', label: '(UTC-5) Bogota' },
  { value: 'America/Lima', label: '(UTC-5) Lima' },
  { value: 'America/Sao_Paulo', label: '(UTC-3) São Paulo' },
  { value: 'America/Buenos_Aires', label: '(UTC-3) Buenos Aires' },
]

function GeneralFieldsGrid({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const fields: { key: keyof Business; label: string; type: string }[] = [
    { key: 'name', label: t('general.fields.name'), type: 'text' },
    { key: 'phone', label: t('general.fields.phone'), type: 'tel' },
    { key: 'email', label: t('general.fields.email'), type: 'email' },
    { key: 'address', label: t('general.fields.address'), type: 'text' },
  ]
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {fields.map(({ key, label, type }) => (
        <div key={key}>
          <label className="text-xs font-medium text-gray-500">{label}</label>
          <input
            type={type}
            value={(biz[key] as string) ?? ''}
            onChange={(e) => setBiz((b) => ({ ...b, [key]: e.target.value }))}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}
      <TimezoneSelect biz={biz} setBiz={setBiz} />
      <CurrencySelect biz={biz} setBiz={setBiz} />
    </div>
  )
}

function TimezoneSelect({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{t('general.fields.timezone')}</label>
      <select
        value={biz.timezone ?? 'UTC'}
        onChange={(e) => setBiz((b) => ({ ...b, timezone: e.target.value }))}
        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function CurrencySelect({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const currencySelectValue = getCurrencySelectValue(biz.currency)
  const isOther = currencySelectValue === 'other'

  function handleSelectChange(value: string): void {
    if (value !== 'other') setBiz((b) => ({ ...b, currency: value }))
    else setBiz((b) => ({ ...b, currency: '' }))
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{t('general.fields.currency')}</label>
      <select
        value={currencySelectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {CURRENCIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      {isOther && (
        <input
          type="text"
          value={biz.currency ?? ''}
          onChange={(e) => setBiz((b) => ({ ...b, currency: e.target.value.toUpperCase() }))}
          placeholder="e.g. SGD"
          maxLength={10}
          className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  )
}

function BusinessTypeSelect({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const types = [
    'salon',
    'barbershop',
    'auto_repair',
    'cafe',
    'dental',
    'fitness',
    'massage',
    'other',
  ] as const
  return (
    <div className="pt-2">
      <label className="text-xs font-medium text-gray-500">{t('general.typeLabel')}</label>
      <select
        value={biz.type ?? ''}
        onChange={(e) => setBiz((b) => ({ ...b, type: e.target.value }))}
        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{t('general.typeDefault')}</option>
        {types.map((tp) => (
          <option key={tp} value={tp}>
            {t(`general.types.${tp}`)}
          </option>
        ))}
      </select>
    </div>
  )
}

function SlugField({
  biz,
  setBiz,
  slugError,
  setSlugError,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  slugError: string
  setSlugError: (v: string) => void
}) {
  const t = useTranslations('settings')
  function handleSlugChange(value: string): void {
    const converted = value.toLowerCase().replace(/ /g, '-')
    setBiz((b) => ({ ...b, slug: converted }))
    const hasError = /[^a-z0-9-]/.test(converted)
    setSlugError(hasError ? t('general.slugError') : '')
  }
  return (
    <div className="pt-2">
      <label className="text-xs font-medium text-gray-500">{t('general.fields.slug')}</label>
      <input
        type="text"
        value={biz.slug ?? ''}
        onChange={(e) => handleSlugChange(e.target.value)}
        className={`w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${slugError ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-blue-500'}`}
      />
      {slugError ? (
        <p className="text-xs text-red-500 mt-1">{slugError}</p>
      ) : (
        <p className="text-xs text-gray-400 mt-1">{t('general.slugHint')}</p>
      )}
    </div>
  )
}

function BrandColorField({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  return (
    <div className="pt-2">
      <label className="text-xs font-medium text-gray-500">{t('general.brandColorLabel')}</label>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="color"
          value={biz.brand_color || '#2D2926'}
          onChange={(e) => setBiz((b) => ({ ...b, brand_color: e.target.value }))}
          className="w-10 h-9 p-0.5 border border-gray-200 rounded-lg cursor-pointer"
        />
        <input
          type="text"
          value={biz.brand_color || '#2D2926'}
          onChange={(e) => setBiz((b) => ({ ...b, brand_color: e.target.value }))}
          maxLength={7}
          className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{t('general.brandColorHint')}</p>
    </div>
  )
}

function LogoSection({
  logoUrl,
  logoUploading,
  logoError,
  onUpload,
  onRemove,
}: {
  logoUrl: string | null
  logoUploading: boolean
  logoError: string
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const t = useTranslations('settings')
  if (logoUrl) {
    return (
      <div className="pt-2">
        <label className="text-xs font-medium text-gray-500">{t('general.logoLabel')}</label>
        <p className="text-xs text-gray-400 mt-0.5 mb-2">{t('general.logoHint')}</p>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
            <Image
              src={logoUrl}
              alt="Business logo"
              width={52}
              height={52}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={logoUploading}
            className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
          >
            {logoUploading ? t('general.logoRemoving') : t('general.logoRemove')}
          </button>
        </div>
        {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
      </div>
    )
  }
  return (
    <div className="pt-2">
      <label className="text-xs font-medium text-gray-500">{t('general.logoLabel')}</label>
      <p className="text-xs text-gray-400 mt-0.5 mb-2">{t('general.logoHint')}</p>
      <label
        className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : 'border-gray-200 hover:border-blue-400 bg-gray-50 hover:bg-blue-50'}`}
      >
        <span className="text-sm text-gray-500">
          {logoUploading ? t('general.logoUploading') : t('general.logoUpload')}
        </span>
        <span className="text-xs text-gray-400 mt-1">{t('general.logoFormats')}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
          }}
        />
      </label>
      {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
    </div>
  )
}

function NotificationLanguageSection({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const current = biz.notification_language ?? 'en'
  return (
    <div className="pt-2">
      <label className="text-xs font-medium text-gray-500">
        {t('general.notificationLanguageLabel')}
      </label>
      <div className="flex gap-2 mt-1">
        {(['en', 'es', 'pt'] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setBiz((b) => ({ ...b, notification_language: lang }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${current === lang ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}
          >
            {lang === 'en' ? 'English' : lang === 'es' ? 'Español' : 'Português'}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1">{t('general.notificationLanguageHint')}</p>
    </div>
  )
}

export function GeneralTab({
  biz,
  setBiz,
  slugError,
  setSlugError,
  logoUrl,
  logoUploading,
  logoError,
  onUploadLogo,
  onRemoveLogo,
  bookingUrl,
  saving,
  saved,
  onSave,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  slugError: string
  setSlugError: (v: string) => void
  logoUrl: string | null
  logoUploading: boolean
  logoError: string
  onUploadLogo: (file: File) => void
  onRemoveLogo: () => void
  bookingUrl: string
  saving: boolean
  saved: boolean
  onSave: () => void
}) {
  const t = useTranslations('settings')
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-4">{t('general.heading')}</h2>
      <GeneralFieldsGrid biz={biz} setBiz={setBiz} />
      <BusinessTypeSelect biz={biz} setBiz={setBiz} />
      <SlugField biz={biz} setBiz={setBiz} slugError={slugError} setSlugError={setSlugError} />
      <BrandColorField biz={biz} setBiz={setBiz} />
      <LogoSection
        logoUrl={logoUrl}
        logoUploading={logoUploading}
        logoError={logoError}
        onUpload={onUploadLogo}
        onRemove={onRemoveLogo}
      />
      <NotificationLanguageSection biz={biz} setBiz={setBiz} />
      <div className="pt-2">
        <div className="text-xs font-medium text-gray-500 mb-1">{t('general.bookingUrlLabel')}</div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-blue-600 select-all">
          {bookingUrl}
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={onSave} disabled={saving || !!slugError}>
          {saving ? (
            t('general.saving')
          ) : saved ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              {t('general.saved')}
            </>
          ) : (
            t('general.saveButton')
          )}
        </Button>
        <Badge variant="outline">
          {t('general.planLabel')} {biz.plan}
        </Badge>
      </div>
    </div>
  )
}
