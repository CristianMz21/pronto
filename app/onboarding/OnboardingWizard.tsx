'use client'

import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import { completeOnboarding } from './actions'

type Tab = 0 | 1 | 2 | 3 | 4
type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
}

function nameToSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

interface Props {
  initialSlug: string
  initialName: string
  isSaas: boolean
  rootDomain: string
}

export function OnboardingWizard({ initialSlug, initialName, isSaas, rootDomain }: Props) {
  const t = useTranslations('onboarding')
  const [step, setStep] = useState<Tab>(0)
  const [bizName, setBizName] = useState(initialName)
  const [bizType, setBizType] = useState('')
  const [service, setService] = useState({ name: '', price: '', duration_min: '60' })
  const [slug, setSlug] = useState(initialSlug)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>(
    isSaas ? (SLUG_RE.test(initialSlug) ? 'checking' : 'idle') : 'idle',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Config steps (T077): locations, holidays, tax, membership preview
  const [locationName, setLocationName] = useState('')
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayReason, setHolidayReason] = useState('')
  const [taxRate, setTaxRate] = useState('0')
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['cash', 'card'])
  const [membershipPreview, setMembershipPreview] = useState({
    name: '4 cortes/mes',
    price: '99000',
    duration: '30',
  })
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  // Business types where duration doesn't apply (retail/product-based)
  const noDuration = ['cafe']
  const showDuration = !noDuration.includes(bizType)

  const businessTypes = [
    { value: 'salon', label: t('businessTypes.salon') },
    { value: 'barbershop', label: t('businessTypes.barbershop') },
    { value: 'auto_repair', label: t('businessTypes.auto_repair') },
    { value: 'cafe', label: t('businessTypes.cafe') },
    { value: 'dental', label: t('businessTypes.dental') },
    { value: 'fitness', label: t('businessTypes.fitness') },
    { value: 'massage', label: t('businessTypes.massage') },
    { value: 'other', label: t('businessTypes.other') },
  ]

  const steps = [
    t('steps.businessType'),
    t('steps.firstService'),
    t('steps.notifications'),
    'Sucursal & Festivos',
    'Impuestos & Membresía',
  ]

  // Debounced slug availability check
  useEffect(() => {
    if (!isSaas) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!slug) {
      setSlugStatus('idle')
      return
    }

    if (!SLUG_RE.test(slug)) {
      setSlugStatus('invalid')
      return
    }

    setSlugStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-slug?slug=${encodeURIComponent(slug)}`)
        const data = await res.json()
        setSlugStatus(data.available ? 'available' : 'taken')
      } catch {
        setSlugStatus('idle')
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [slug, isSaas])

  // Run initial check on mount for the pre-filled slug
  useEffect(() => {
    if (!isSaas || !initialSlug) return
    // Trigger the effect above by keeping slug === initialSlug (already set)
  }, [initialSlug, isSaas])

  const canContinueStep0 = !!bizName.trim() && !!bizType && (!isSaas || slugStatus === 'available')

  function handleBizNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newName = e.target.value
    setBizName(newName)
    // Auto-generate slug from business name in SaaS mode (until manually edited)
    if (isSaas && !slugManuallyEdited) {
      setSlug(nameToSlug(newName))
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugManuallyEdited(true)
    setSlug(normalizeSlug(e.target.value))
  }

  async function saveConfigStep() {
    setConfigSaving(true)
    setConfigMsg('')
    try {
      // Create optional location
      if (locationName.trim()) {
        await fetch('/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: locationName.trim(), address: '' }),
        })
      }
      // Create holiday if provided
      if (holidayDate) {
        await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: holidayDate,
            reason: holidayReason || 'Festivo',
            is_open: false,
          }),
        })
      }
      // Save tax/payment config
      const tax = Number(taxRate)
      if (!Number.isNaN(tax) && tax >= 0 && tax <= 100) {
        await fetch('/api/business/tax', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tax_rate: tax, payment_methods: paymentMethods }),
        })
      }
      // Membership preview: create if name+price set
      if (membershipPreview.name && Number(membershipPreview.price) > 0) {
        await fetch('/api/memberships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: membershipPreview.name,
            price: Number(membershipPreview.price),
            duration_days: Number(membershipPreview.duration) || 30,
            benefits: { cuts: 4 },
            is_active: true,
          }),
        }).catch(() => {})
      }
      setConfigMsg('Configuración guardada ✓')
      setTimeout(() => setConfigMsg(''), 2000)
    } catch {
      setConfigMsg('Algunos campos no se guardaron — podés configurarlos luego en Settings')
    } finally {
      setConfigSaving(false)
    }
  }

  async function finish() {
    // Save config opportunistic before complete
    if (step === 4) await saveConfigStep()
    setSaving(true)
    setError('')
    try {
      // @ts-expect-error - tsc strict fix
      await completeOnboarding({
        bizType,
        bizName: bizName.trim() || undefined,
        serviceName: service.name,
        servicePrice: Number(service.price),
        serviceDuration: showDuration ? Number(service.duration_min) || 60 : 0,
        ...(isSaas ? { slug } : {}),
      })
    } catch {
      setError(t('step2.error'))
      setSaving(false)
    }
  }

  function slugStatusText() {
    switch (slugStatus) {
      case 'checking':
        return t('step0.slugChecking')
      case 'available':
        return t('step0.slugAvailable')
      case 'taken':
        return t('step0.slugTaken')
      case 'invalid':
        return t('step0.slugInvalid')
      default:
        return ''
    }
  }

  function slugStatusColor() {
    switch (slugStatus) {
      case 'available':
        return 'text-green-600'
      case 'taken':
      case 'invalid':
        return 'text-red-500'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-blue-600 mb-1">{t('logo')}</div>
          <p className="text-sm text-gray-500">{t('intro')}</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-400'
                }`}
              >
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block ${i === step ? 'text-gray-900' : 'text-gray-400'}`}
              >
                {s}
              </span>
              {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {/* ── Step 0: Business name + type (+ URL in SaaS) ──────────────── */}
          {step === 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('step0.heading')}</h2>
              <p className="text-sm text-gray-500 mb-6">{t('step0.subheading')}</p>

              {/* Business name */}
              <div className="mb-6">
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  {t('step0.bizNameLabel')}
                </label>
                <input
                  type="text"
                  value={bizName}
                  onChange={handleBizNameChange}
                  placeholder={t('step0.bizNamePlaceholder')}
                  maxLength={80}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-xs font-medium text-gray-500 mb-3">
                {t('step0.businessTypeLabel')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {businessTypes.map((bt) => (
                  <button
                    type="button"
                    key={bt.value}
                    onClick={() => setBizType(bt.value)}
                    className={`p-4 rounded-xl border text-sm text-left transition-colors ${
                      bizType === bt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {bt.label}
                  </button>
                ))}
              </div>

              {/* Slug field — SaaS only */}
              {isSaas && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <label className="text-xs font-medium text-gray-500 block mb-1">
                    {t('step0.slugLabel')}
                  </label>
                  <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <span className="px-3 py-2.5 bg-gray-50 text-sm text-gray-400 border-r border-gray-200 select-none whitespace-nowrap">
                      {rootDomain}/
                    </span>
                    <input
                      type="text"
                      value={slug}
                      onChange={handleSlugChange}
                      maxLength={30}
                      placeholder="my-business"
                      className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    />
                    {slugStatus === 'checking' && (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin mr-3 flex-shrink-0" />
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className={`text-xs ${slugStatusColor()}`}>
                      {slugStatusText() || t('step0.slugHint')}
                    </p>
                  </div>
                  {slug && SLUG_RE.test(slug) && (
                    <p className="mt-2 text-xs text-gray-400">
                      {t('step0.slugPreview')}{' '}
                      <span className="font-medium text-gray-600">
                        {slug}.{rootDomain}
                      </span>
                    </p>
                  )}
                </div>
              )}

              <Button
                className="w-full mt-6"
                onClick={() => setStep(1)}
                disabled={!canContinueStep0}
              >
                {t('step0.continue')}
              </Button>
            </div>
          )}

          {/* ── Step 1: First service ──────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('step1.heading')}</h2>
              <p className="text-sm text-gray-500 mb-6">{t('step1.subheading')}</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">
                    {t('step1.serviceNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={service.name}
                    onChange={(e) => setService((s) => ({ ...s, name: e.target.value }))}
                    placeholder={t('step1.serviceNamePlaceholder')}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className={showDuration ? 'grid grid-cols-2 gap-3' : ''}>
                  <div>
                    <label className="text-xs font-medium text-gray-500">
                      {t('step1.priceLabel')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={service.price}
                      onChange={(e) => setService((s) => ({ ...s, price: e.target.value }))}
                      placeholder="0"
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {showDuration && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">
                        {t('step1.durationLabel')}
                      </label>
                      <input
                        type="number"
                        min={5}
                        value={service.duration_min}
                        onChange={(e) =>
                          setService((s) => ({ ...s, duration_min: e.target.value }))
                        }
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(0)}>
                  {t('step1.back')}
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  {t('step1.skip')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep(2)}
                  disabled={!service.name || !service.price}
                >
                  {t('step1.continue')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Notifications ──────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('step2.heading')}</h2>
              <p className="text-sm text-gray-500 mb-6">{t('step2.subheading')}</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <div className="text-2xl">✉️</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {t('step2.emailChannel')}
                    </div>
                    <div className="text-xs text-gray-500">{t('step2.emailChannelSub')}</div>
                  </div>
                  <span className="ml-auto text-xs text-green-600 font-medium">
                    {t('step2.emailChannelStatus')}
                  </span>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-200">
                  <div className="text-2xl">📱</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {t('step2.messengerChannel')}
                    </div>
                    <div className="text-xs text-gray-500">{t('step2.messengerChannelSub')}</div>
                  </div>
                  <span className="ml-auto text-xs text-gray-400">
                    {t('step2.messengerChannelStatus')}
                  </span>
                </div>
              </div>
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                  {t('step1.back')}
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)} disabled={saving}>
                  Continuar → sucursales
                </Button>
              </div>
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={finish}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Omitir y finalizar
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Sucursal + Festivo (T077) ───────────────────────────── */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Sucursales &amp; Festivos
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Configurá tu sede extra y festivos. Todo es opcional — podés hacerlo luego en
                Settings.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">
                    Nueva sucursal (opcional)
                  </label>
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Ej: Escudería Norte"
                    maxLength={80}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Se crea con slug automático. Sin sede extra, operás solo Centro.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Festivo (opcional)</label>
                    <input
                      type="date"
                      value={holidayDate}
                      onChange={(e) => setHolidayDate(e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Motivo</label>
                    <input
                      type="text"
                      value={holidayReason}
                      onChange={(e) => setHolidayReason(e.target.value)}
                      placeholder="Navidad"
                      maxLength={100}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>
                {configMsg && (
                  <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    {configMsg}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Atrás
                </Button>
                <Button variant="ghost" onClick={() => setStep(4)}>
                  Omitir
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    await saveConfigStep()
                    setStep(4)
                  }}
                  disabled={configSaving}
                >
                  {configSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Guardar
                  y continuar
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Impuestos & membresía preview + checklist (T077) ────── */}
          {step === 4 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Impuestos &amp; Membresía
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Define impuestos y una membresía de prueba. Checklist final antes de arrancar.
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Tax %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Métodos pago</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(['cash', 'card', 'transfer', 'digital'] as const).map((m) => (
                        <label key={m} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={paymentMethods.includes(m)}
                            onChange={(e) =>
                              setPaymentMethods((prev) =>
                                e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                              )
                            }
                          />
                          {m}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                  <div className="text-xs font-medium text-gray-500 mb-2">
                    Membresía preview (opcional)
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={membershipPreview.name}
                      onChange={(e) =>
                        setMembershipPreview((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="Nombre"
                      className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      value={membershipPreview.price}
                      onChange={(e) =>
                        setMembershipPreview((p) => ({ ...p, price: e.target.value }))
                      }
                      placeholder="Precio"
                      className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      value={membershipPreview.duration}
                      onChange={(e) =>
                        setMembershipPreview((p) => ({ ...p, duration: e.target.value }))
                      }
                      placeholder="Días"
                      className="border border-gray-200 rounded-lg px-2 py-2 text-sm"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Se creará como membresía activa &quot;{membershipPreview.name}&quot; por $
                    {membershipPreview.price} / {membershipPreview.duration}d con 4 cortes.
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Checklist</div>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li className="flex gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${bizName ? 'text-green-500' : 'text-gray-300'}`}
                      />{' '}
                      Negocio: {bizName || '—'}
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${service.name ? 'text-green-500' : 'text-gray-300'}`}
                      />{' '}
                      Servicio: {service.name || '—'}
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${locationName ? 'text-green-500' : 'text-gray-300'}`}
                      />{' '}
                      Sucursal: {locationName || 'Centro (default)'}
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${holidayDate ? 'text-green-500' : 'text-gray-300'}`}
                      />{' '}
                      Festivo: {holidayDate || '— (luego en Settings)'}
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${Number(taxRate) > 0 ? 'text-green-500' : 'text-gray-300'}`}
                      />{' '}
                      Tax: {taxRate}% — {paymentMethods.join(', ')}
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 ${membershipPreview.name ? 'text-green-500' : 'text-gray-300'}`}
                      />{' '}
                      Membresía: {membershipPreview.name}
                    </li>
                  </ul>
                </div>
                {configMsg && (
                  <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    {configMsg}
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                    {error}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(3)} disabled={saving}>
                  Atrás
                </Button>
                <Button className="flex-1" onClick={finish} disabled={saving}>
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('step2.settingUp')}
                    </span>
                  ) : (
                    t('step2.submit')
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
