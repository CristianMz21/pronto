'use client'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

import { type Employee } from './helpers'

function EmployeeActions({
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
        <span className="text-xs text-gray-500">{t('employees.deleteConfirm')}</span>
        <button
          type="button"
          onClick={onDelete}
          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
        >
          {t('employees.deleteYes')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          {t('employees.deleteNo')}
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

function EmployeesTable({
  employees,
  confirmDeleteEmpId,
  setConfirmDeleteEmpId,
  setEmpForm,
  setEditingEmp,
  onDelete,
}: {
  employees: Employee[]
  confirmDeleteEmpId: string | null
  setConfirmDeleteEmpId: (v: string | null) => void
  setEmpForm: React.Dispatch<React.SetStateAction<Partial<Employee>>>
  setEditingEmp: (v: string | null) => void
  onDelete: (id: string) => void
}) {
  const t = useTranslations('settings')
  if (employees.length === 0) {
    return <div className="py-10 text-center text-gray-500 text-sm">{t('employees.empty')}</div>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
          <th className="text-left px-4 py-3 font-medium">{t('employees.table.name')}</th>
          <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">
            {t('employees.table.role')}
          </th>
          <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
            {t('employees.table.contact')}
          </th>
          <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">
            {t('employees.table.phone')}
          </th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {employees.map((e) => (
          <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-0">
            <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
            <td className="px-4 py-3 text-gray-500 hidden sm:table-cell capitalize">{e.role}</td>
            <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{e.email ?? '—'}</td>
            <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{e.phone ?? '—'}</td>
            <td className="px-4 py-3 text-right">
              <EmployeeActions
                isConfirming={confirmDeleteEmpId === e.id}
                onEdit={() => {
                  setEmpForm(e)
                  setEditingEmp(e.id)
                }}
                onConfirmDelete={() => setConfirmDeleteEmpId(e.id)}
                onDelete={() => onDelete(e.id)}
                onCancel={() => setConfirmDeleteEmpId(null)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function EmployeesTab({
  employees,
  empForm,
  setEmpForm,
  editingEmp,
  setEditingEmp,
  confirmDeleteEmpId,
  setConfirmDeleteEmpId,
  onSave,
  onDelete,
}: {
  employees: Employee[]
  empForm: Partial<Employee>
  setEmpForm: React.Dispatch<React.SetStateAction<Partial<Employee>>>
  editingEmp: string | null
  setEditingEmp: (v: string | null) => void
  confirmDeleteEmpId: string | null
  setConfirmDeleteEmpId: (v: string | null) => void
  onSave: () => void
  onDelete: (id: string) => void
}) {
  const t = useTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <EmployeesTable
          employees={employees}
          confirmDeleteEmpId={confirmDeleteEmpId}
          setConfirmDeleteEmpId={setConfirmDeleteEmpId}
          setEmpForm={setEmpForm}
          setEditingEmp={setEditingEmp}
          onDelete={onDelete}
        />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {editingEmp ? t('employees.editHeading') : t('employees.addHeading')}
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {(
            [
              { key: 'name' as const, label: t('employees.fields.name'), type: 'text' },
              { key: 'role' as const, label: t('employees.fields.role'), type: 'text' },
              { key: 'email' as const, label: t('employees.fields.email'), type: 'email' },
              { key: 'phone' as const, label: t('employees.fields.phone'), type: 'tel' },
            ] as { key: keyof Employee; label: string; type: string }[]
          ).map(({ key, label, type }) => (
            <div key={key}>
              <label className="text-xs font-medium text-gray-500">{label}</label>
              <input
                type={type}
                value={(empForm[key] as string) ?? ''}
                onChange={(e) => setEmpForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          {editingEmp && (
            <Button
              variant="outline"
              onClick={() => {
                setEmpForm({})
                setEditingEmp(null)
              }}
            >
              {t('employees.cancelButton')}
            </Button>
          )}
          <Button onClick={onSave} disabled={!empForm.name}>
            <Plus className="w-4 h-4 mr-1" />
            {editingEmp ? t('employees.updateButton') : t('employees.addButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}
