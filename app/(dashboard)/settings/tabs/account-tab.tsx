'use client'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

function EmailStatus({
  status,
  msg,
}: {
  status: 'idle' | 'loading' | 'ok' | 'error'
  msg: string
}) {
  if (status === 'ok') {
    return (
      <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {msg}
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        <AlertCircle className="w-4 h-4 shrink-0" /> {msg}
      </div>
    )
  }
  return null
}

function PasswordStatus({
  status,
  msg,
}: {
  status: 'idle' | 'loading' | 'ok' | 'error'
  msg: string
}) {
  if (status === 'ok') {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <CheckCircle2 className="w-4 h-4 shrink-0" /> {msg}
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        <AlertCircle className="w-4 h-4 shrink-0" /> {msg}
      </div>
    )
  }
  return null
}

export function AccountTab({
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
}: {
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
}) {
  const t = useTranslations('settings')
  void setEmailMsg
  void setPwStatus
  void setPwMsg
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">{t('account.heading')}</h2>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs font-medium text-gray-500">
              {t('account.currentEmailLabel')}
            </label>
            <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
              <span className="text-sm text-gray-700 flex-1">{userEmail}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">
              {t('account.newEmailLabel')}
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value)
                setEmailStatus('idle')
              }}
              placeholder={t('account.newEmailPlaceholder')}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <EmailStatus status={emailStatus} msg={emailMsg} />
          <Button
            onClick={onChangeEmail}
            variant="outline"
            disabled={emailStatus === 'loading' || !newEmail}
          >
            {emailStatus === 'loading' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('account.saving')}
              </>
            ) : (
              t('account.changeEmailButton')
            )}
          </Button>
          <p className="text-xs text-gray-400">{t('account.emailHint')}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">{t('account.passwordHeading')}</h3>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs font-medium text-gray-500">
              {t('account.newPasswordLabel')}
            </label>
            <div className="relative mt-1">
              <input
                type={showPw ? 'text' : 'password'}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="Min. 8 characters"
                className="w-full border border-gray-200 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">
              {t('account.confirmPasswordLabel')}
            </label>
            <input
              type={showPw ? 'text' : 'password'}
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              placeholder={t('account.confirmPasswordPlaceholder')}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <PasswordStatus status={pwStatus} msg={pwMsg} />
          <Button
            onClick={onChangePassword}
            disabled={pwStatus === 'loading' || !pwForm.newPassword || !pwForm.confirm}
          >
            {pwStatus === 'loading' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('account.saving')}
              </>
            ) : (
              t('account.changePasswordButton')
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
