'use client'

import { AlertCircle, Settings } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import type { ModuleKey } from '@/lib/modules'
import { createClient } from '@/lib/supabase/client'
import { isRecord } from '@/lib/validation/guard'

import { HolidaysSection } from './holidays-section'
import { AccountTab } from './tabs/account-tab'
import { AdvancedTab } from './tabs/advanced-tab'
import { BillingTab } from './tabs/billing-tab'
import { EmployeesTab } from './tabs/employees-tab'
import { GeneralTab } from './tabs/general-tab'
import {
  findBreakValidationError,
  getInitialTab,
  sanitizeSlug,
  type Business,
  type DayHours,
  type Employee,
  type Service,
} from './tabs/helpers'
import { ModulesTab } from './tabs/modules-tab'
import { NotificationsTab } from './tabs/notifications-tab'
import { ServicesTab } from './tabs/services-tab'
import { TabNavigation } from './tabs/tab-navigation'
import { WorkingHoursCard } from './tabs/working-hours-card'

// ─── Helpers outside component ───────────────────────────────────────────────

function getStringField(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'string' ? v : undefined
}
function getBooleanField(obj: unknown, key: string): boolean | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'boolean' ? v : undefined
}

const clean = (s: string, max = 500) => s?.trim().slice(0, max) ?? ''

const DEFAULT_HOURS: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
  day_of_week: dow,
  is_open: dow >= 1 && dow <= 5,
  open_time: '09:00',
  close_time: '19:00',
  break_start: null,
  break_end: null,
}))

type Tab =
  | 'general'
  | 'services'
  | 'employees'
  | 'notifications'
  | 'billing'
  | 'account'
  | 'modules'
  | 'advanced'

function buildTabs(
  t: ReturnType<typeof useTranslations<'settings'>>,
  bookingsOn: boolean,
  isOwner: boolean,
): { key: Tab; label: string; icon?: React.ReactNode }[] {
  const tabs: { key: Tab; label: string; icon?: React.ReactNode }[] = [
    { key: 'general', label: t('tabs.general') },
  ]
  if (bookingsOn) tabs.push({ key: 'services', label: t('tabs.services') })
  tabs.push(
    { key: 'employees', label: t('tabs.employees') },
    { key: 'notifications', label: t('tabs.notifications') },
    { key: 'billing', label: t('tabs.billing') },
    { key: 'modules', label: t('tabs.modules') },
    { key: 'account', label: t('tabs.account') },
  )
  if (isOwner) {
    tabs.push({
      key: 'advanced',
      label: t('tabs.advanced'),
      icon: <Settings className="w-3.5 h-3.5" />,
    })
  }
  return tabs
}

async function handleSaveAdvanced(args: {
  supabase: ReturnType<typeof createClient>
  biz: Business
  t: ReturnType<typeof useTranslations<'settings'>>
  setAdvancedError: (v: string) => void
  setAdvancedSaving: (v: boolean) => void
  setAdvancedSaved: (v: boolean) => void
  router: ReturnType<typeof useRouter>
}): Promise<void> {
  const v = args.biz.min_advance_minutes ?? 30
  if (!Number.isInteger(v) || v < 0 || v > 1440) {
    args.setAdvancedError(args.t('advanced.minAdvanceError'))
    setTimeout(() => args.setAdvancedError(''), 3000)
    return
  }
  args.setAdvancedSaving(true)
  args.setAdvancedError('')
  const { error } = await args.supabase
    .from('businesses')
    .update({
      min_advance_minutes: v,
      booking_lead_time_enabled: args.biz.booking_lead_time_enabled ?? true,
      require_cash_register_for_cash: args.biz.require_cash_register_for_cash ?? true,
      allow_guest_bookings: args.biz.allow_guest_bookings ?? true,
    })
    .eq('id', args.biz.id)
  args.setAdvancedSaving(false)
  if (error) {
    args.setAdvancedError(error.message)
    return
  }
  args.setAdvancedSaved(true)
  setTimeout(() => args.setAdvancedSaved(false), 2000)
  args.router.refresh()
}

async function handleUploadLogo(args: {
  file: File
  setLogoError: (v: string) => void
  setLogoUploading: (v: boolean) => void
  setLogoUrl: (v: string | null) => void
  t: ReturnType<typeof useTranslations<'settings'>>
}): Promise<void> {
  args.setLogoError('')
  args.setLogoUploading(true)
  try {
    const form = new FormData()
    form.append('logo', args.file)
    const res = await fetch('/api/business/logo', { method: 'POST', body: form })
    let json: unknown = {}
    try {
      json = await res.json()
    } catch {
      /* non-JSON response */
    }
    if (!res.ok) {
      const err = getStringField(json, 'error')
      args.setLogoError(err ?? `Upload failed (HTTP ${res.status})`)
      return
    }
    const logoUrlVal = getStringField(json, 'logo_url')
    args.setLogoUrl(logoUrlVal ?? null)
  } catch (e) {
    args.setLogoError(
      args.t('general.logoErrorNetwork', {
        message: e instanceof Error ? e.message : 'please try again',
      }),
    )
  } finally {
    args.setLogoUploading(false)
  }
}

async function handleRemoveLogo(args: {
  setLogoError: (v: string) => void
  setLogoUploading: (v: boolean) => void
  setLogoUrl: (v: string | null) => void
  t: ReturnType<typeof useTranslations<'settings'>>
}): Promise<void> {
  args.setLogoError('')
  args.setLogoUploading(true)
  try {
    await fetch('/api/business/logo', { method: 'DELETE' })
    args.setLogoUrl(null)
  } catch {
    args.setLogoError(args.t('general.logoErrorRemove'))
  } finally {
    args.setLogoUploading(false)
  }
}

async function handleSaveBusiness(args: {
  supabase: ReturnType<typeof createClient>
  biz: Business
  initialSlug: string
  slugError: string
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  setSaving: (v: boolean) => void
  setSaved: (v: boolean) => void
  router: ReturnType<typeof useRouter>
}): Promise<void> {
  if (args.slugError) return
  args.setSaving(true)
  const cleanSlug = sanitizeSlug(args.biz.slug, args.initialSlug)
  const bizName = clean(args.biz.name || '', 100)
  const bizAddress = args.biz.address ? clean(args.biz.address, 200) || null : null
  args.setBiz((b) => ({ ...b, slug: cleanSlug }))
  await args.supabase
    .from('businesses')
    .update({
      name: bizName,
      slug: cleanSlug,
      type: args.biz.type,
      phone: args.biz.phone,
      email: args.biz.email,
      address: bizAddress,
      timezone: args.biz.timezone,
      currency: args.biz.currency,
      telegram_bot_token: args.biz.telegram_bot_token,
      viber_bot_token: args.biz.viber_bot_token,
      owner_whatsapp: args.biz.owner_whatsapp,
      email_provider: args.biz.email_provider,
      smtp_host: args.biz.smtp_host,
      smtp_port: args.biz.smtp_port,
      smtp_user: args.biz.smtp_user,
      smtp_pass: args.biz.smtp_pass,
      smtp_from: args.biz.smtp_from,
      resend_api_key: args.biz.resend_api_key,
      meta_whatsapp_phone_number_id: args.biz.meta_whatsapp_phone_number_id,
      meta_whatsapp_access_token: args.biz.meta_whatsapp_access_token,
      wa_template_confirmation: args.biz.wa_template_confirmation,
      wa_template_reminder: args.biz.wa_template_reminder,
      wa_template_thankyou: args.biz.wa_template_thankyou,
      wa_template_reactivation: args.biz.wa_template_reactivation,
      wa_template_birthday: args.biz.wa_template_birthday,
      wa_template_language: args.biz.wa_template_language ?? 'en',
      brand_color: args.biz.brand_color || '#2D2926',
      notification_language: args.biz.notification_language ?? 'en',
    })
    .eq('id', args.biz.id)
  args.setSaving(false)
  args.setSaved(true)
  setTimeout(() => args.setSaved(false), 2000)
  args.router.refresh()
}

async function handleSaveService(args: {
  supabase: ReturnType<typeof createClient>
  svcForm: Partial<Service>
  editingSvc: string | null
  bizId: string
  setServices: React.Dispatch<React.SetStateAction<Service[]>>
  setSvcForm: (v: Partial<Service>) => void
  setEditingSvc: (v: string | null) => void
  router: ReturnType<typeof useRouter>
}): Promise<void> {
  if (!args.svcForm.name || args.svcForm.price == null) return
  const svcName = clean(args.svcForm.name, 100)
  if (!svcName) return
  const svcDescription = args.svcForm.description
    ? clean(args.svcForm.description, 500) || null
    : null
  const svcCategory = args.svcForm.category ? clean(args.svcForm.category, 100) || null : null
  const sanitizedForm = {
    ...args.svcForm,
    name: svcName,
    description: svcDescription,
    category: svcCategory,
  }
  if (args.editingSvc) {
    await args.supabase.from('services').update(sanitizedForm).eq('id', args.editingSvc)
    args.setServices((prev) =>
      prev.map((s) => (s.id === args.editingSvc ? ({ ...s, ...sanitizedForm } as Service) : s)),
    )
  } else {
    const { data } = await args.supabase
      .from('services')
      .insert({
        business_id: args.bizId,
        name: svcName,
        description: svcDescription,
        price: args.svcForm.price!,
        duration_min: args.svcForm.duration_min ?? 60,
        category: svcCategory,
        capacity: args.svcForm.capacity ?? 1,
      })
      .select()
      .single()
    if (data) args.setServices((prev) => [...prev, data as Service])
  }
  args.setSvcForm({})
  args.setEditingSvc(null)
  args.router.refresh()
}

async function handleDeleteService(args: {
  supabase: ReturnType<typeof createClient>
  id: string
  setServices: React.Dispatch<React.SetStateAction<Service[]>>
  setConfirmDeleteSvcId: (v: string | null) => void
  router: ReturnType<typeof useRouter>
}): Promise<void> {
  await args.supabase.from('services').delete().eq('id', args.id)
  args.setServices((prev) => prev.filter((s) => s.id !== args.id))
  args.setConfirmDeleteSvcId(null)
  args.router.refresh()
}

async function handleSaveEmployee(args: {
  supabase: ReturnType<typeof createClient>
  empForm: Partial<Employee>
  editingEmp: string | null
  bizId: string
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>
  setEmpForm: (v: Partial<Employee>) => void
  setEditingEmp: (v: string | null) => void
  router: ReturnType<typeof useRouter>
}): Promise<void> {
  if (!args.empForm.name) return
  const empName = clean(args.empForm.name, 100)
  if (!empName) return
  const sanitizedEmp = { ...args.empForm, name: empName }
  if (args.editingEmp) {
    await args.supabase.from('employees').update(sanitizedEmp).eq('id', args.editingEmp)
    args.setEmployees((prev) =>
      prev.map((e) => (e.id === args.editingEmp ? ({ ...e, ...sanitizedEmp } as Employee) : e)),
    )
  } else {
    const { data } = await args.supabase
      .from('employees')
      .insert({
        business_id: args.bizId,
        name: empName,
        role: args.empForm.role ?? 'employee',
        email: args.empForm.email ?? null,
        phone: args.empForm.phone ?? null,
      })
      .select()
      .single()
    if (data) args.setEmployees((prev) => [...prev, data as Employee])
  }
  args.setEmpForm({})
  args.setEditingEmp(null)
  args.router.refresh()
}

async function handleDeleteEmployee(args: {
  supabase: ReturnType<typeof createClient>
  id: string
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>
  setConfirmDeleteEmpId: (v: string | null) => void
  router: ReturnType<typeof useRouter>
}): Promise<void> {
  await args.supabase.from('employees').delete().eq('id', args.id)
  args.setEmployees((prev) => prev.filter((e) => e.id !== args.id))
  args.setConfirmDeleteEmpId(null)
  args.router.refresh()
}

async function handleConnectWhatsApp(args: {
  supabase: ReturnType<typeof createClient>
  biz: Business
  setWaStatus: (v: 'idle' | 'loading' | 'ok' | 'error') => void
  setWaMsg: (v: string) => void
  router: ReturnType<typeof useRouter>
}): Promise<void> {
  args.setWaStatus('loading')
  args.setWaMsg('')
  const { error } = await args.supabase
    .from('businesses')
    .update({
      meta_whatsapp_phone_number_id: args.biz.meta_whatsapp_phone_number_id,
      meta_whatsapp_access_token: args.biz.meta_whatsapp_access_token,
    })
    .eq('id', args.biz.id)
  if (error) {
    args.setWaStatus('error')
    args.setWaMsg(error.message)
  } else {
    args.setWaStatus('ok')
    args.setWaMsg('WhatsApp credentials saved successfully.')
    args.router.refresh()
  }
}

async function handleConnectViber(args: {
  supabase: ReturnType<typeof createClient>
  biz: Business
  setViberWebhookStatus: (v: 'idle' | 'loading' | 'ok' | 'error') => void
  setViberWebhookMsg: (v: string) => void
}): Promise<void> {
  args.setViberWebhookStatus('loading')
  args.setViberWebhookMsg('')
  await args.supabase
    .from('businesses')
    .update({ viber_bot_token: args.biz.viber_bot_token })
    .eq('id', args.biz.id)
  const res = await fetch('/api/viber/set-webhook', { method: 'POST' })
  const json: unknown = await res.json()
  const ok = getBooleanField(json, 'ok') ?? false
  if (ok) {
    const botName = getStringField(json, 'botName') ?? 'Viber Bot'
    args.setViberWebhookStatus('ok')
    args.setViberWebhookMsg(
      `Connected! Bot: ${botName}. Now open your Viber bot and start a conversation.`,
    )
  } else {
    args.setViberWebhookStatus('error')
    const err = getStringField(json, 'error')
    args.setViberWebhookMsg(err ?? 'Unknown error')
  }
}

async function handleConnectTelegram(args: {
  supabase: ReturnType<typeof createClient>
  biz: Business
  setWebhookStatus: (v: 'idle' | 'loading' | 'ok' | 'error') => void
  setWebhookMsg: (v: string) => void
}): Promise<void> {
  args.setWebhookStatus('loading')
  args.setWebhookMsg('')
  await args.supabase
    .from('businesses')
    .update({ telegram_bot_token: args.biz.telegram_bot_token })
    .eq('id', args.biz.id)
  const res = await fetch('/api/telegram/set-webhook', { method: 'POST' })
  const json: unknown = await res.json()
  const ok = getBooleanField(json, 'ok') ?? false
  if (ok) {
    const botUsername = getStringField(json, 'botUsername') ?? 'bot'
    args.setWebhookStatus('ok')
    args.setWebhookMsg(
      `Connected! Bot: @${botUsername}. Now open your bot in Telegram and send /start.`,
    )
  } else {
    args.setWebhookStatus('error')
    const err = getStringField(json, 'error')
    args.setWebhookMsg(err ?? 'Unknown error')
  }
}

async function handleChangePassword(args: {
  supabase: ReturnType<typeof createClient>
  pwForm: { newPassword: string; confirm: string }
  t: ReturnType<typeof useTranslations<'settings'>>
  setPwStatus: (v: 'idle' | 'loading' | 'ok' | 'error') => void
  setPwMsg: (v: string) => void
  setPwForm: (v: { newPassword: string; confirm: string }) => void
}): Promise<void> {
  if (args.pwForm.newPassword.length < 8) {
    args.setPwStatus('error')
    args.setPwMsg(args.t('account.pwMinLength'))
    return
  }
  if (args.pwForm.newPassword !== args.pwForm.confirm) {
    args.setPwStatus('error')
    args.setPwMsg(args.t('account.pwNoMatch'))
    return
  }
  args.setPwStatus('loading')
  args.setPwMsg('')
  const { error } = await args.supabase.auth.updateUser({ password: args.pwForm.newPassword })
  if (error) {
    args.setPwStatus('error')
    args.setPwMsg(error.message)
  } else {
    args.setPwStatus('ok')
    args.setPwMsg(args.t('account.pwSuccess'))
    args.setPwForm({ newPassword: '', confirm: '' })
  }
}

async function handleChangeEmail(args: {
  supabase: ReturnType<typeof createClient>
  newEmail: string
  t: ReturnType<typeof useTranslations<'settings'>>
  setEmailStatus: (v: 'idle' | 'loading' | 'ok' | 'error') => void
  setEmailMsg: (v: string) => void
  setNewEmail: (v: string) => void
}): Promise<void> {
  if (!args.newEmail.includes('@')) {
    args.setEmailStatus('error')
    args.setEmailMsg(args.t('account.emailInvalid'))
    return
  }
  args.setEmailStatus('loading')
  args.setEmailMsg('')
  const { error } = await args.supabase.auth.updateUser({ email: args.newEmail })
  if (error) {
    args.setEmailStatus('error')
    args.setEmailMsg(error.message)
  } else {
    args.setEmailStatus('ok')
    args.setEmailMsg(args.t('account.emailConfirmSent', { email: args.newEmail }))
    args.setNewEmail('')
  }
}

function renderActiveTab(args: {
  tab: Tab
  biz: Business
  initial: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  slugError: string
  setSlugError: (v: string) => void
  logoUrl: string | null
  logoUploading: boolean
  logoError: string
  onUploadLogo: (f: File) => void
  onRemoveLogo: () => void
  bookingUrl: string
  saving: boolean
  saved: boolean
  onSaveBusiness: () => void
  hours: DayHours[]
  updateDay: (dow: number, patch: Partial<DayHours>) => void
  savingHours: boolean
  savedHours: boolean
  hoursValidationError: string | null
  onSaveWorkingHours: () => void
  services: Service[]
  svcForm: Partial<Service>
  setSvcForm: React.Dispatch<React.SetStateAction<Partial<Service>>>
  editingSvc: string | null
  setEditingSvc: (v: string | null) => void
  confirmDeleteSvcId: string | null
  setConfirmDeleteSvcId: (v: string | null) => void
  onSaveService: () => void
  onDeleteService: (id: string) => void
  employees: Employee[]
  empForm: Partial<Employee>
  setEmpForm: React.Dispatch<React.SetStateAction<Partial<Employee>>>
  editingEmp: string | null
  setEditingEmp: (v: string | null) => void
  confirmDeleteEmpId: string | null
  setConfirmDeleteEmpId: (v: string | null) => void
  onSaveEmployee: () => void
  onDeleteEmployee: (id: string) => void
  webhookStatus: 'idle' | 'loading' | 'ok' | 'error'
  webhookMsg: string
  viberWebhookStatus: 'idle' | 'loading' | 'ok' | 'error'
  viberWebhookMsg: string
  waStatus: 'idle' | 'loading' | 'ok' | 'error'
  waMsg: string
  onConnectTelegram: () => void
  onConnectViber: () => void
  onConnectWhatsApp: () => void
  enabledModules: string[]
  setEnabledModules: React.Dispatch<React.SetStateAction<string[]>>
  confirmModule: ModuleKey | null
  setConfirmModule: (v: ModuleKey | null) => void
  modulesSaving: boolean
  modulesSaved: boolean
  onSaveModules: () => void
  userEmail: string
  newEmail: string
  setNewEmail: (v: string) => void
  emailStatus: 'idle' | 'loading' | 'ok' | 'error'
  setEmailStatus: (v: 'idle' | 'loading' | 'ok' | 'error') => void
  emailMsg: string
  setEmailMsg: (v: string) => void
  onChangeEmail: () => void
  pwForm: { newPassword: string; confirm: string }
  setPwForm: React.Dispatch<React.SetStateAction<{ newPassword: string; confirm: string }>>
  showPw: boolean
  setShowPw: React.Dispatch<React.SetStateAction<boolean>>
  pwStatus: 'idle' | 'loading' | 'ok' | 'error'
  setPwStatus: (v: 'idle' | 'loading' | 'ok' | 'error') => void
  pwMsg: string
  setPwMsg: (v: string) => void
  onChangePassword: () => void
  isOwner: boolean
  advancedSaving: boolean
  advancedSaved: boolean
  advancedError: string
  onSaveAdvanced: () => void
}): React.ReactNode {
  if (args.tab === 'general') {
    return (
      <div className="space-y-6">
        <GeneralTab
          biz={args.biz}
          setBiz={args.setBiz}
          slugError={args.slugError}
          setSlugError={args.setSlugError}
          logoUrl={args.logoUrl}
          logoUploading={args.logoUploading}
          logoError={args.logoError}
          onUploadLogo={args.onUploadLogo}
          onRemoveLogo={args.onRemoveLogo}
          bookingUrl={args.bookingUrl}
          saving={args.saving}
          saved={args.saved}
          onSave={args.onSaveBusiness}
        />
        <WorkingHoursCard
          hours={args.hours}
          updateDay={args.updateDay}
          savingHours={args.savingHours}
          savedHours={args.savedHours}
          validationError={args.hoursValidationError}
          onSave={args.onSaveWorkingHours}
        />
        <HolidaysSection businessId={args.biz.id} />
      </div>
    )
  }
  if (args.tab === 'services') {
    return (
      <ServicesTab
        services={args.services}
        bizCurrency={args.biz.currency}
        svcForm={args.svcForm}
        setSvcForm={args.setSvcForm}
        editingSvc={args.editingSvc}
        setEditingSvc={args.setEditingSvc}
        confirmDeleteSvcId={args.confirmDeleteSvcId}
        setConfirmDeleteSvcId={args.setConfirmDeleteSvcId}
        onSave={args.onSaveService}
        onDelete={args.onDeleteService}
      />
    )
  }
  if (args.tab === 'employees') {
    return (
      <EmployeesTab
        employees={args.employees}
        empForm={args.empForm}
        setEmpForm={args.setEmpForm}
        editingEmp={args.editingEmp}
        setEditingEmp={args.setEditingEmp}
        confirmDeleteEmpId={args.confirmDeleteEmpId}
        setConfirmDeleteEmpId={args.setConfirmDeleteEmpId}
        onSave={args.onSaveEmployee}
        onDelete={args.onDeleteEmployee}
      />
    )
  }
  if (args.tab === 'notifications') {
    return (
      <NotificationsTab
        biz={args.biz}
        initial={args.initial}
        setBiz={args.setBiz}
        webhookStatus={args.webhookStatus}
        webhookMsg={args.webhookMsg}
        viberWebhookStatus={args.viberWebhookStatus}
        viberWebhookMsg={args.viberWebhookMsg}
        waStatus={args.waStatus}
        waMsg={args.waMsg}
        onConnectTelegram={args.onConnectTelegram}
        onConnectViber={args.onConnectViber}
        onConnectWhatsApp={args.onConnectWhatsApp}
        onSave={args.onSaveBusiness}
        saving={args.saving}
        saved={args.saved}
      />
    )
  }
  if (args.tab === 'billing') return <BillingTab />
  if (args.tab === 'modules') {
    return (
      <ModulesTab
        enabledModules={args.enabledModules}
        setEnabledModules={args.setEnabledModules}
        confirmModule={args.confirmModule}
        setConfirmModule={args.setConfirmModule}
        modulesSaving={args.modulesSaving}
        modulesSaved={args.modulesSaved}
        onSave={args.onSaveModules}
      />
    )
  }
  if (args.tab === 'account') {
    return (
      <AccountTab
        userEmail={args.userEmail}
        newEmail={args.newEmail}
        setNewEmail={args.setNewEmail}
        emailStatus={args.emailStatus}
        setEmailStatus={args.setEmailStatus}
        emailMsg={args.emailMsg}
        setEmailMsg={args.setEmailMsg}
        onChangeEmail={args.onChangeEmail}
        pwForm={args.pwForm}
        setPwForm={args.setPwForm}
        showPw={args.showPw}
        setShowPw={args.setShowPw}
        pwStatus={args.pwStatus}
        setPwStatus={args.setPwStatus}
        pwMsg={args.pwMsg}
        setPwMsg={args.setPwMsg}
        onChangePassword={args.onChangePassword}
      />
    )
  }
  if (args.tab === 'advanced') {
    return (
      <AdvancedTab
        biz={args.biz}
        setBiz={args.setBiz}
        isOwner={args.isOwner}
        advancedSaving={args.advancedSaving}
        advancedSaved={args.advancedSaved}
        advancedError={args.advancedError}
        onSave={args.onSaveAdvanced}
      />
    )
  }
  return null
}

interface Props {
  business: Business
  services: Service[]
  employees: Employee[]
  workingHours: DayHours[]
  userEmail: string
  userId?: string
}

export function SettingsTabs({
  business: initial,
  services: initServices,
  employees: initEmployees,
  workingHours: initHours,
  userEmail,
  userId,
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const t = useTranslations('settings')
  const searchParams = useSearchParams()
  const initialTab = getInitialTab(searchParams.get('tab'))
  const [tab, setTab] = useState<Tab>(initialTab)
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [webhookMsg, setWebhookMsg] = useState('')
  const [viberWebhookStatus, setViberWebhookStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  )
  const [viberWebhookMsg, setViberWebhookMsg] = useState('')
  const [waStatus, setWaStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [waMsg, setWaMsg] = useState('')
  const [biz, setBiz] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [slugError, setSlugError] = useState('')
  const [services, setServices] = useState(initServices)
  const [svcForm, setSvcForm] = useState<Partial<Service>>({})
  const [confirmDeleteSvcId, setConfirmDeleteSvcId] = useState<string | null>(null)
  const [confirmDeleteEmpId, setConfirmDeleteEmpId] = useState<string | null>(null)
  const [editingSvc, setEditingSvc] = useState<string | null>(null)
  const [employees, setEmployees] = useState(initEmployees)
  const [empForm, setEmpForm] = useState<Partial<Employee>>({})
  const [editingEmp, setEditingEmp] = useState<string | null>(null)

  const DEFAULT_MODULES = ['bookings', 'crm', 'pos', 'inventory', 'notifications']
  const [enabledModules, setEnabledModules] = useState<string[]>(
    initial.enabled_modules ?? DEFAULT_MODULES,
  )
  const [modulesSaving, setModulesSaving] = useState(false)
  const [confirmModule, setConfirmModule] = useState<ModuleKey | null>(null)
  const [modulesSaved, setModulesSaved] = useState(false)

  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logo_url ?? null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')

  const [advancedSaving, setAdvancedSaving] = useState(false)
  const [advancedSaved, setAdvancedSaved] = useState(false)
  const [advancedError, setAdvancedError] = useState('')
  const isOwner = !initial.owner_id || !userId ? true : initial.owner_id === userId

  const [hours, setHours] = useState<DayHours[]>(() => {
    return DEFAULT_HOURS.map((def) => {
      const fromDb = initHours.find((h) => h.day_of_week === def.day_of_week)
      return fromDb ?? def
    })
  })
  const [savingHours, setSavingHours] = useState(false)
  const [origin, setOrigin] = useState('')
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const bookingUrl = useMemo(() => `${origin}/book/${biz.slug}`, [biz.slug, origin])

  const [savedHours, setSavedHours] = useState(false)
  const [hoursValidationError, setHoursValidationError] = useState<string | null>(null)

  const [pwForm, setPwForm] = useState({ newPassword: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [pwStatus, setPwStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [pwMsg, setPwMsg] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [emailMsg, setEmailMsg] = useState('')

  function updateDay(dow: number, patch: Partial<DayHours>) {
    setHours((prev) => prev.map((h) => (h.day_of_week === dow ? { ...h, ...patch } : h)))
  }

  const onSaveAdvanced = () =>
    void handleSaveAdvanced({
      supabase,
      biz,
      t,
      setAdvancedError,
      setAdvancedSaving,
      setAdvancedSaved,
      router,
    })
  const onUploadLogo = (file: File) =>
    void handleUploadLogo({ file, setLogoError, setLogoUploading, setLogoUrl, t })
  const onRemoveLogo = () =>
    void handleRemoveLogo({ setLogoError, setLogoUploading, setLogoUrl, t })
  const onSaveWorkingHours = () => {
    const validationError = findBreakValidationError(hours, t)
    if (validationError) {
      setHoursValidationError(validationError)
      setTimeout(() => setHoursValidationError(null), 4000)
      return
    }
    setSavingHours(true)
    const rows = hours.map((h) => ({
      business_id: biz.id,
      day_of_week: h.day_of_week,
      is_open: h.is_open,
      open_time: h.open_time,
      close_time: h.close_time,
      break_start: h.break_start ?? null,
      break_end: h.break_end ?? null,
    }))
    void supabase
      .from('business_hours')
      .upsert(rows, { onConflict: 'business_id,day_of_week' })
      .then(() => {
        setSavingHours(false)
        setSavedHours(true)
        setTimeout(() => setSavedHours(false), 2000)
      })
  }
  const onChangePassword = () =>
    void handleChangePassword({ supabase, pwForm, t, setPwStatus, setPwMsg, setPwForm })
  const onChangeEmail = () =>
    void handleChangeEmail({ supabase, newEmail, t, setEmailStatus, setEmailMsg, setNewEmail })
  const onSaveBusiness = () =>
    void handleSaveBusiness({
      supabase,
      biz,
      initialSlug: initial.slug,
      slugError,
      setBiz,
      setSaving,
      setSaved,
      router,
    })
  const onSaveService = () =>
    void handleSaveService({
      supabase,
      svcForm,
      editingSvc,
      bizId: biz.id,
      setServices,
      setSvcForm,
      setEditingSvc,
      router,
    })
  const onDeleteService = (id: string) =>
    void handleDeleteService({ supabase, id, setServices, setConfirmDeleteSvcId, router })
  const onSaveEmployee = () =>
    void handleSaveEmployee({
      supabase,
      empForm,
      editingEmp,
      bizId: biz.id,
      setEmployees,
      setEmpForm,
      setEditingEmp,
      router,
    })
  const onDeleteEmployee = (id: string) =>
    void handleDeleteEmployee({ supabase, id, setEmployees, setConfirmDeleteEmpId, router })
  const onConnectWhatsApp = () =>
    void handleConnectWhatsApp({ supabase, biz, setWaStatus, setWaMsg, router })
  const onConnectViber = () =>
    void handleConnectViber({ supabase, biz, setViberWebhookStatus, setViberWebhookMsg })
  const onConnectTelegram = () =>
    void handleConnectTelegram({ supabase, biz, setWebhookStatus, setWebhookMsg })
  const onSaveModules = async () => {
    setModulesSaving(true)
    setModulesSaved(false)
    await fetch('/api/business/modules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_modules: enabledModules }),
    })
    setModulesSaving(false)
    setModulesSaved(true)
    router.refresh()
    setTimeout(() => setModulesSaved(false), 2500)
  }

  const bookingsOn = enabledModules.includes('bookings')
  const tabs = buildTabs(t, bookingsOn, isOwner)

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      {!isOwner && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('advanced.ownerOnly')}
        </div>
      )}
      <TabNavigation tabs={tabs} active={tab} onChange={setTab} />
      {renderActiveTab({
        tab,
        biz,
        initial,
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
        onSaveBusiness,
        hours,
        updateDay,
        savingHours,
        savedHours,
        hoursValidationError,
        onSaveWorkingHours,
        services,
        svcForm,
        setSvcForm,
        editingSvc,
        setEditingSvc,
        confirmDeleteSvcId,
        setConfirmDeleteSvcId,
        onSaveService,
        onDeleteService,
        employees,
        empForm,
        setEmpForm,
        editingEmp,
        setEditingEmp,
        confirmDeleteEmpId,
        setConfirmDeleteEmpId,
        onSaveEmployee,
        onDeleteEmployee,
        webhookStatus,
        webhookMsg,
        viberWebhookStatus,
        viberWebhookMsg,
        waStatus,
        waMsg,
        onConnectTelegram,
        onConnectViber,
        onConnectWhatsApp,
        enabledModules,
        setEnabledModules,
        confirmModule,
        setConfirmModule,
        modulesSaving,
        modulesSaved,
        onSaveModules,
        userEmail,
        newEmail,
        setNewEmail,
        emailStatus,
        setEmailStatus,
        emailMsg,
        setEmailMsg,
        onChangeEmail,
        pwForm,
        setPwForm,
        showPw,
        setShowPw,
        pwStatus,
        setPwStatus,
        pwMsg,
        setPwMsg,
        onChangePassword,
        isOwner,
        advancedSaving,
        advancedSaved,
        advancedError,
        onSaveAdvanced,
      })}
    </div>
  )
}
