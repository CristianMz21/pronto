'use client'
import { useTranslations } from 'next-intl'

export function BillingTab() {
  const t = useTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-2">{t('tabs.billing')}</h2>
        <p className="text-sm text-gray-500 mb-4">
          You are running the self-hosted version of Pronto. All features are available without
          subscription.
        </p>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm font-medium text-green-800 mb-1">
            Self-hosted — All features unlocked
          </p>
          <p className="text-sm text-green-700">
            All Pro/Agency features are available to you at no charge. Manage your instance via
            Docker Compose.
          </p>
        </div>
      </div>
    </div>
  )
}
