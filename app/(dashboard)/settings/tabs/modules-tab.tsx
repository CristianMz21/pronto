'use client'
import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { MODULES, type ModuleKey } from '@/lib/modules'

const DEFAULT_MODULES = ['bookings', 'crm', 'pos', 'inventory', 'notifications']

function ModuleRow({
  modKey,
  enabled,
  isConfirming,
  onToggle,
  onConfirmOff,
  onCancel,
}: {
  modKey: ModuleKey
  enabled: boolean
  isConfirming: boolean
  onToggle: () => void
  onConfirmOff: () => void
  onCancel: () => void
}) {
  const t = useTranslations('settings')
  const modLabel = t(`modules.items.${modKey}.label` as Parameters<typeof t>[0])
  return (
    <div key={modKey}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{modLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t(`modules.items.${modKey}.description` as Parameters<typeof t>[0])}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
      {isConfirming && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-amber-800">{t('modules.confirmOff', { label: modLabel })}</p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t('modules.cancelButton')}
            </button>
            <button
              type="button"
              onClick={onConfirmOff}
              className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              {t('modules.turnOffButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ModulesTab({
  enabledModules,
  setEnabledModules,
  confirmModule,
  setConfirmModule,
  modulesSaving,
  modulesSaved,
  onSave,
}: {
  enabledModules: string[]
  setEnabledModules: React.Dispatch<React.SetStateAction<string[]>>
  confirmModule: ModuleKey | null
  setConfirmModule: (v: ModuleKey | null) => void
  modulesSaving: boolean
  modulesSaved: boolean
  onSave: () => void
}) {
  const t = useTranslations('settings')
  const presets: { labelKey: string; modules: string[] }[] = [
    {
      labelKey: 'modules.presets.salon',
      modules: ['bookings', 'crm', 'pos', 'inventory', 'notifications'],
    },
    { labelKey: 'modules.presets.shop', modules: ['inventory', 'pos', 'notifications'] },
    { labelKey: 'modules.presets.cafe', modules: ['pos', 'crm', 'inventory', 'notifications'] },
    { labelKey: 'modules.presets.all', modules: DEFAULT_MODULES },
  ]

  function handleToggle(enabled: boolean, key: ModuleKey): void {
    if (enabled) {
      setConfirmModule(key)
      return
    }
    setEnabledModules((prev) => [...prev, key])
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-900">{t('modules.heading')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('modules.description')}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            {t('modules.presetsLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                type="button"
                key={preset.labelKey}
                onClick={() => setEnabledModules(preset.modules)}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:text-blue-700 transition-colors"
              >
                {t(preset.labelKey as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4 pt-2 border-t border-gray-100">
          {(Object.keys(MODULES) as ModuleKey[]).map((key) => (
            <ModuleRow
              key={key}
              modKey={key}
              enabled={enabledModules.includes(key)}
              isConfirming={confirmModule === key}
              onToggle={() => handleToggle(enabledModules.includes(key), key)}
              onConfirmOff={() => {
                setEnabledModules((prev) => prev.filter((m) => m !== key))
                setConfirmModule(null)
              }}
              onCancel={() => setConfirmModule(null)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={modulesSaving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {modulesSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : modulesSaved ? (
            <Check className="w-4 h-4" />
          ) : null}
          {modulesSaved ? t('modules.saved') : t('modules.saveButton')}
        </button>
      </div>
    </div>
  )
}
