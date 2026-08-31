'use client'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { type Business, safeRawHtml } from './helpers'

function StatusMessage({ status, msg }: { status: 'ok' | 'error'; msg: string }) {
  if (status === 'ok') {
    return (
      <div className="mt-2 flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        {msg}
      </div>
    )
  }
  return (
    <div className="mt-2 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      {msg}
    </div>
  )
}

function EmailProviderSection({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const isSmtpReady = biz.smtp_host && biz.smtp_user && biz.smtp_pass && biz.smtp_from
  const isResendReady = !!biz.resend_api_key
  const emailConnected =
    (biz.email_provider === 'smtp' && isSmtpReady) ||
    (biz.email_provider === 'resend' && isResendReady)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-gray-900">{t('notifications.email.label')}</span>
        {emailConnected ? (
          <Badge variant="success">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('notifications.email.connected')}
          </Badge>
        ) : (
          <Badge variant="secondary">{t('notifications.email.notSet')}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-2 mb-4">
        {(['smtp', 'resend'] as const).map((p) => (
          <label key={p} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="email_provider"
              value={p}
              checked={biz.email_provider === p}
              onChange={() => setBiz((b) => ({ ...b, email_provider: p }))}
              className="accent-blue-600"
            />
            <span className="text-sm text-gray-700">
              {p === 'smtp'
                ? t('notifications.email.smtpOption')
                : t('notifications.email.resendOption')}
            </span>
          </label>
        ))}
      </div>
      {renderEmailProviderFields(biz, setBiz, t)}
    </div>
  )
}

function renderEmailProviderFields(
  biz: Business,
  setBiz: React.Dispatch<React.SetStateAction<Business>>,
  t: ReturnType<typeof useTranslations<'settings'>>,
) {
  if (biz.email_provider === 'smtp') {
    return (
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500">
            {t('notifications.email.smtpHost')}
          </label>
          <input
            type="text"
            value={biz.smtp_host ?? ''}
            onChange={(e) => setBiz((b) => ({ ...b, smtp_host: e.target.value || null }))}
            placeholder={t('notifications.email.smtpHostPlaceholder')}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">
            {t('notifications.email.smtpPort')}
          </label>
          <input
            type="number"
            value={biz.smtp_port ?? 587}
            onChange={(e) =>
              setBiz((b) => ({ ...b, smtp_port: parseInt(e.target.value, 10) || 587 }))
            }
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">
            {t('notifications.email.smtpUser')}
          </label>
          <input
            type="text"
            value={biz.smtp_user ?? ''}
            onChange={(e) => setBiz((b) => ({ ...b, smtp_user: e.target.value || null }))}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">
            {t('notifications.email.smtpPass')}
          </label>
          <input
            type="password"
            value={biz.smtp_pass ?? ''}
            onChange={(e) => setBiz((b) => ({ ...b, smtp_pass: e.target.value || null }))}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">{t('notifications.email.smtpPassHint')}</p>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-500">
            {t('notifications.email.smtpFrom')}
          </label>
          <input
            type="email"
            value={biz.smtp_from ?? ''}
            onChange={(e) => setBiz((b) => ({ ...b, smtp_from: e.target.value || null }))}
            placeholder={t('notifications.email.smtpFromPlaceholder')}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    )
  }
  if (biz.email_provider === 'resend') {
    return (
      <div>
        <label className="text-xs font-medium text-gray-500">
          {t('notifications.email.resendApiKey')}
        </label>
        <input
          type="password"
          value={biz.resend_api_key ?? ''}
          onChange={(e) => setBiz((b) => ({ ...b, resend_api_key: e.target.value || null }))}
          placeholder={t('notifications.email.resendApiKeyPlaceholder')}
          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">
          <a
            href="https://resend.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {t('notifications.email.resendSignup')}
          </a>
        </p>
      </div>
    )
  }
  return null
}

function TelegramSection({
  biz,
  setBiz,
  status,
  msg,
  onConnect,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  status: 'idle' | 'loading' | 'ok' | 'error'
  msg: string
  onConnect: () => void
}) {
  const t = useTranslations('settings')
  const isConnected = !!(biz as Business & { telegram_chat_id?: string | null }).telegram_chat_id
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-900">
          {t('notifications.telegram.label')}
        </span>
        {isConnected ? (
          <Badge variant="success">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('notifications.telegram.connected')}
          </Badge>
        ) : (
          <Badge variant="secondary">{t('notifications.telegram.notSet')}</Badge>
        )}
      </div>
      <ol className="text-xs text-gray-500 space-y-1 mb-3 list-decimal list-inside">
        <li dangerouslySetInnerHTML={{ __html: safeRawHtml(t, 'notifications.telegram.step1') }} />
        <li>{t('notifications.telegram.step2')}</li>
        <li dangerouslySetInnerHTML={{ __html: safeRawHtml(t, 'notifications.telegram.step3') }} />
      </ol>
      <div className="flex gap-2 min-w-0">
        <input
          type="text"
          value={biz.telegram_bot_token ?? ''}
          onChange={(e) => setBiz((b) => ({ ...b, telegram_bot_token: e.target.value }))}
          placeholder={t('notifications.telegram.placeholder')}
          className="min-w-0 flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button
          onClick={onConnect}
          disabled={status === 'loading' || !biz.telegram_bot_token}
          variant="outline"
          className="shrink-0"
        >
          {status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t('notifications.telegram.connectButton')
          )}
        </Button>
      </div>
      {status !== 'idle' && <StatusMessage status={status === 'ok' ? 'ok' : 'error'} msg={msg} />}
    </div>
  )
}

function ViberSection({
  biz,
  initial,
  setBiz,
  status,
  msg,
  onConnect,
}: {
  biz: Business
  initial: Business & { viber_chat_id?: string | null }
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  status: 'idle' | 'loading' | 'ok' | 'error'
  msg: string
  onConnect: () => void
}) {
  const t = useTranslations('settings')
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-900">{t('notifications.viber.label')}</span>
        {initial.viber_chat_id ? (
          <Badge variant="success">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('notifications.viber.connected')}
          </Badge>
        ) : (
          <Badge variant="secondary">{t('notifications.viber.notSet')}</Badge>
        )}
      </div>
      <ol className="text-xs text-gray-500 space-y-1 mb-3 list-decimal list-inside">
        <li dangerouslySetInnerHTML={{ __html: safeRawHtml(t, 'notifications.viber.step1') }} />
        <li>{t('notifications.viber.step2')}</li>
        <li dangerouslySetInnerHTML={{ __html: safeRawHtml(t, 'notifications.viber.step3') }} />
      </ol>
      <div className="flex gap-2 min-w-0">
        <input
          type="text"
          value={biz.viber_bot_token ?? ''}
          onChange={(e) => setBiz((b) => ({ ...b, viber_bot_token: e.target.value }))}
          placeholder={t('notifications.viber.placeholder')}
          className="min-w-0 flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button
          onClick={onConnect}
          disabled={status === 'loading' || !biz.viber_bot_token}
          variant="outline"
          className="shrink-0"
        >
          {status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t('notifications.viber.connectButton')
          )}
        </Button>
      </div>
      {status !== 'idle' && <StatusMessage status={status === 'ok' ? 'ok' : 'error'} msg={msg} />}
    </div>
  )
}

function WhatsAppSection({
  biz,
  setBiz,
  status,
  msg,
  onConnect,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  status: 'idle' | 'loading' | 'ok' | 'error'
  msg: string
  onConnect: () => void
}) {
  const t = useTranslations('settings')
  const isConnected = !!(biz.meta_whatsapp_phone_number_id && biz.meta_whatsapp_access_token)
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-900">
          {t('notifications.whatsapp.label')}
        </span>
        {isConnected ? (
          <Badge variant="success">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('notifications.whatsapp.connected')}
          </Badge>
        ) : (
          <Badge variant="secondary">{t('notifications.whatsapp.notSet')}</Badge>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">{t('notifications.whatsapp.description')}</p>
      <ol className="text-xs text-gray-500 space-y-1 mb-3 list-decimal list-inside">
        <li dangerouslySetInnerHTML={{ __html: safeRawHtml(t, 'notifications.whatsapp.step1') }} />
        <li dangerouslySetInnerHTML={{ __html: safeRawHtml(t, 'notifications.whatsapp.step2') }} />
        <li
          dangerouslySetInnerHTML={{
            __html: safeRawHtml(t, 'notifications.whatsapp.step3').replace(
              '{saveButton}',
              `<strong>${t('notifications.whatsapp.saveButton')}</strong>`,
            ),
          }}
        />
        <li>{t('notifications.whatsapp.step4')}</li>
      </ol>
      <div className="space-y-2 mb-2">
        <input
          type="text"
          autoComplete="off"
          value={biz.meta_whatsapp_phone_number_id ?? ''}
          onChange={(e) =>
            setBiz((b) => ({ ...b, meta_whatsapp_phone_number_id: e.target.value || null }))
          }
          placeholder={t('notifications.whatsapp.phoneNumberIdPlaceholder')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={biz.meta_whatsapp_access_token ?? ''}
          onChange={(e) =>
            setBiz((b) => ({ ...b, meta_whatsapp_access_token: e.target.value || null }))
          }
          placeholder={t('notifications.whatsapp.accessTokenPlaceholder')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <Button
        onClick={onConnect}
        disabled={
          status === 'loading' ||
          !biz.meta_whatsapp_phone_number_id ||
          !biz.meta_whatsapp_access_token
        }
        variant="outline"
      >
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          t('notifications.whatsapp.saveButton')
        )}
      </Button>
      {status !== 'idle' && <StatusMessage status={status === 'ok' ? 'ok' : 'error'} msg={msg} />}
    </div>
  )
}

function OwnerWhatsappField({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const isConnected = !!(biz.meta_whatsapp_phone_number_id && biz.meta_whatsapp_access_token)
  if (!isConnected) return null
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">
        {t('notifications.ownerWhatsapp.label')}
      </label>
      <p className="text-xs text-gray-400 mb-2">{t('notifications.ownerWhatsapp.description')}</p>
      <input
        type="tel"
        value={biz.owner_whatsapp ?? ''}
        onChange={(e) => setBiz((b) => ({ ...b, owner_whatsapp: e.target.value || null }))}
        placeholder={t('notifications.ownerWhatsapp.placeholder')}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

function WaTemplatesSection({
  biz,
  setBiz,
}: {
  biz: Business
  setBiz: React.Dispatch<React.SetStateAction<Business>>
}) {
  const t = useTranslations('settings')
  const templates: { field: keyof Business; label: string; placeholder: string }[] = [
    {
      field: 'wa_template_confirmation',
      label: t('notifications.waTemplates.confirmation'),
      placeholder: t('notifications.waTemplates.confirmationPlaceholder'),
    },
    {
      field: 'wa_template_reminder',
      label: t('notifications.waTemplates.reminder'),
      placeholder: t('notifications.waTemplates.reminderPlaceholder'),
    },
    {
      field: 'wa_template_thankyou',
      label: t('notifications.waTemplates.thankyou'),
      placeholder: t('notifications.waTemplates.thankyouPlaceholder'),
    },
    {
      field: 'wa_template_reactivation',
      label: t('notifications.waTemplates.reengagement'),
      placeholder: t('notifications.waTemplates.reengagementPlaceholder'),
    },
    {
      field: 'wa_template_birthday',
      label: t('notifications.waTemplates.birthday'),
      placeholder: t('notifications.waTemplates.birthdayPlaceholder'),
    },
  ]
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-900 mb-1">
        {t('notifications.waTemplates.heading')}
      </h3>
      <p className="text-xs text-gray-500 mb-3">{t('notifications.waTemplates.description')}</p>
      <div className="space-y-3">
        {templates.map(({ field, label, placeholder }) => (
          <div key={field}>
            <label className="text-xs font-medium text-gray-500">{label}</label>
            <input
              type="text"
              value={(biz[field] as string) ?? ''}
              onChange={(e) => setBiz((b) => ({ ...b, [field]: e.target.value || null }))}
              placeholder={placeholder}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
        <div>
          <label className="text-xs font-medium text-gray-500">
            {t('notifications.waTemplates.language')}
          </label>
          <input
            type="text"
            value={biz.wa_template_language ?? ''}
            onChange={(e) =>
              setBiz((b) => ({ ...b, wa_template_language: e.target.value || null }))
            }
            placeholder="en"
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  )
}

export function NotificationsTab({
  biz,
  initial,
  setBiz,
  webhookStatus,
  webhookMsg,
  viberWebhookStatus,
  viberWebhookMsg,
  waStatus,
  waMsg,
  onConnectTelegram,
  onConnectViber,
  onConnectWhatsApp,
  onSave,
  saving,
  saved,
}: {
  biz: Business
  initial: Business & { viber_chat_id?: string | null; telegram_chat_id?: string | null }
  setBiz: React.Dispatch<React.SetStateAction<Business>>
  webhookStatus: 'idle' | 'loading' | 'ok' | 'error'
  webhookMsg: string
  viberWebhookStatus: 'idle' | 'loading' | 'ok' | 'error'
  viberWebhookMsg: string
  waStatus: 'idle' | 'loading' | 'ok' | 'error'
  waMsg: string
  onConnectTelegram: () => void
  onConnectViber: () => void
  onConnectWhatsApp: () => void
  onSave: () => void
  saving: boolean
  saved: boolean
}) {
  const t = useTranslations('settings')
  const triggers = [
    t('notifications.triggers.confirmation'),
    t('notifications.triggers.reminder24h'),
    t('notifications.triggers.reminder1h'),
    t('notifications.triggers.thankYou'),
    t('notifications.triggers.reactivation'),
    t('notifications.triggers.birthday'),
    t('notifications.triggers.lowStock'),
  ]
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <h2 className="font-semibold text-gray-900">{t('notifications.heading')}</h2>
        <EmailProviderSection biz={biz} setBiz={setBiz} />
        <hr className="border-gray-100" />
        <TelegramSection
          biz={biz}
          setBiz={setBiz}
          status={webhookStatus}
          msg={webhookMsg}
          onConnect={onConnectTelegram}
        />
        <hr className="border-gray-100" />
        <ViberSection
          biz={biz}
          initial={initial}
          setBiz={setBiz}
          status={viberWebhookStatus}
          msg={viberWebhookMsg}
          onConnect={onConnectViber}
        />
        <hr className="border-gray-100" />
        <WhatsAppSection
          biz={biz}
          setBiz={setBiz}
          status={waStatus}
          msg={waMsg}
          onConnect={onConnectWhatsApp}
        />
        <OwnerWhatsappField biz={biz} setBiz={setBiz} />
        <hr className="border-gray-100" />
        <WaTemplatesSection biz={biz} setBiz={setBiz} />
        <Button onClick={onSave} disabled={saving}>
          {saving
            ? t('notifications.saving')
            : saved
              ? t('notifications.saved')
              : t('notifications.save')}
        </Button>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {t('notifications.triggersHeading')}
        </h3>
        <ul className="space-y-2 text-sm text-gray-600">
          {triggers.map((tr) => (
            <li key={tr} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              {tr}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
