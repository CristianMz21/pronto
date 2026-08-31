'use client'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

import { type Service } from './helpers'

function ServiceActions({
  isConfirming,
  onEdit,
  onConfirmDelete,
  onDelete,
  onCancel,
}: {
  isConfirming: boolean
  onEdit: () => void
  onConfirmDelete: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  const t = useTranslations('settings')
  if (isConfirming) {
    return (
      <div className="flex justify-end items-center gap-2">
        <span className="text-xs text-gray-500">{t('services.deleteConfirm')}</span>
        <button
          type="button"
          onClick={onDelete}
          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
        >
          {t('services.deleteYes')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          {t('services.deleteNo')}
        </button>
      </div>
    )
  }
  return (
    <div className="flex justify-end gap-1">
      <button type="button" onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded">
        <Pencil className="w-3.5 h-3.5 text-gray-500" />
      </button>
      <button type="button" onClick={onConfirmDelete} className="p-1.5 hover:bg-red-50 rounded">
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </button>
    </div>
  )
}

function ServicesTable({
  services,
  bizCurrency,
  confirmDeleteSvcId,
  setConfirmDeleteSvcId,
  setSvcForm,
  setEditingSvc,
  onDelete,
}: {
  services: Service[]
  bizCurrency: string
  confirmDeleteSvcId: string | null
  setConfirmDeleteSvcId: (v: string | null) => void
  setSvcForm: React.Dispatch<React.SetStateAction<Partial<Service>>>
  setEditingSvc: (v: string | null) => void
  onDelete: (id: string) => void
}) {
  const t = useTranslations('settings')
  if (services.length === 0) {
    return <div className="py-10 text-center text-gray-500 text-sm">{t('services.empty')}</div>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
          <th className="text-left px-4 py-3 font-medium">{t('services.table.name')}</th>
          <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">
            {t('services.table.category')}
          </th>
          <th className="text-right px-4 py-3 font-medium">{t('services.table.price')}</th>
          <th className="text-right px-4 py-3 font-medium">{t('services.table.duration')}</th>
          <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">
            {t('services.table.capacity')}
          </th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {services.map((s) => (
          <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-0">
            <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
            <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{s.category ?? '—'}</td>
            <td className="px-4 py-3 text-right">
              {bizCurrency} {s.price}
            </td>
            <td className="px-4 py-3 text-right text-gray-500">{s.duration_min} min</td>
            <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
              {(s.capacity ?? 1) > 1 ? (
                <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">
                  <Users className="w-3 h-3" />
                  {s.capacity}
                </span>
              ) : (
                '1'
              )}
            </td>
            <td className="px-4 py-3 text-right">
              <ServiceActions
                isConfirming={confirmDeleteSvcId === s.id}
                onEdit={() => {
                  setSvcForm(s)
                  setEditingSvc(s.id)
                }}
                onConfirmDelete={() => setConfirmDeleteSvcId(s.id)}
                onDelete={() => onDelete(s.id)}
                onCancel={() => setConfirmDeleteSvcId(null)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ServicesTab({
  services,
  bizCurrency,
  svcForm,
  setSvcForm,
  editingSvc,
  setEditingSvc,
  confirmDeleteSvcId,
  setConfirmDeleteSvcId,
  onSave,
  onDelete,
}: {
  services: Service[]
  bizCurrency: string
  svcForm: Partial<Service>
  setSvcForm: React.Dispatch<React.SetStateAction<Partial<Service>>>
  editingSvc: string | null
  setEditingSvc: (v: string | null) => void
  confirmDeleteSvcId: string | null
  setConfirmDeleteSvcId: (v: string | null) => void
  onSave: () => void
  onDelete: (id: string) => void
}) {
  const t = useTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <ServicesTable
          services={services}
          bizCurrency={bizCurrency}
          confirmDeleteSvcId={confirmDeleteSvcId}
          setConfirmDeleteSvcId={setConfirmDeleteSvcId}
          setSvcForm={setSvcForm}
          setEditingSvc={setEditingSvc}
          onDelete={onDelete}
        />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {editingSvc ? t('services.editHeading') : t('services.addHeading')}
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {(
            [
              { key: 'name' as const, label: t('services.fields.name'), type: 'text' },
              { key: 'category' as const, label: t('services.fields.category'), type: 'text' },
              { key: 'price' as const, label: t('services.fields.price'), type: 'number' },
              {
                key: 'duration_min' as const,
                label: t('services.fields.duration'),
                type: 'number',
              },
            ] as { key: keyof Service; label: string; type: string }[]
          ).map(({ key, label, type }) => (
            <div key={key}>
              <label className="text-xs font-medium text-gray-500">{label}</label>
              <input
                type={type}
                value={(svcForm[key] as string | number) ?? ''}
                onChange={(e) =>
                  setSvcForm((f) => ({
                    ...f,
                    [key]: type === 'number' ? Number(e.target.value) : e.target.value,
                  }))
                }
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-gray-500">
              {t('services.fields.capacity')}
            </label>
            <input
              type="number"
              min={1}
              value={(svcForm.capacity as number) ?? 1}
              onChange={(e) =>
                setSvcForm((f) => ({ ...f, capacity: Math.max(1, Number(e.target.value)) }))
              }
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">{t('services.capacityHint')}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {editingSvc && (
            <Button
              variant="outline"
              onClick={() => {
                setSvcForm({})
                setEditingSvc(null)
              }}
            >
              {t('services.cancelButton')}
            </Button>
          )}
          <Button onClick={onSave} disabled={!svcForm.name}>
            <Plus className="w-4 h-4 mr-1" />
            {editingSvc ? t('services.updateButton') : t('services.addButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}
