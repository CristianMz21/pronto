'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { isRecord } from '@/lib/supabase/typed'

import { CategoryCombobox } from '../category-combobox'
import { UnitSelect } from '../unit-select'

interface Props {
  categories: string[]
}

export function NewInventoryForm({ categories }: Props) {
  const t = useTranslations('newInventoryItem')
  const router = useRouter()
  const [unit, setUnit] = useState('pcs')
  const [category, setCategory] = useState('')
  const [skuError, setSkuError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSkuError('')
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        sku: fd.get('sku'),
        category,
        unit,
        quantity: fd.get('quantity'),
        cost_price: fd.get('cost_price'),
        sell_price: fd.get('sell_price'),
        low_stock_threshold: fd.get('low_stock_threshold'),
      }),
    })
    if (res.status === 409) {
      const json: unknown = (await res.json()) as unknown
      if (isRecord(json) && json['error'] === 'sku_taken' && typeof json['message'] === 'string') {
        setSkuError(json['message'] as string)
      }
    } else if (res.ok) {
      const data: unknown = (await res.json()) as unknown
      if (isRecord(data) && typeof data['id'] === 'string') {
        const id = data['id'] as string
        router.push(`/inventory/${id}`)
      }
      router.refresh()
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.name')}</label>
        <input
          type="text"
          name="name"
          required
          placeholder={t('fields.namePlaceholder')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.sku')}</label>
          <input
            type="text"
            name="sku"
            placeholder={t('fields.skuPlaceholder')}
            onChange={() => skuError && setSkuError('')}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              skuError ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-blue-500'
            }`}
          />
          {skuError && <p className="mt-1 text-xs text-red-500">{skuError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('fields.category')}
          </label>
          <CategoryCombobox
            value={category}
            onChange={setCategory}
            categories={categories}
            placeholder={t('fields.categoryPlaceholder')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.unit')}</label>
          <UnitSelect value={unit} onChange={setUnit} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('fields.quantity')}
          </label>
          <input
            type="number"
            name="quantity"
            min={0}
            defaultValue={0}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('fields.costPrice')}
          </label>
          <input
            type="number"
            name="cost_price"
            min={0}
            step="0.01"
            placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('fields.sellPrice')}
          </label>
          <input
            type="number"
            name="sell_price"
            min={0}
            step="0.01"
            placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('fields.lowStockThreshold')}
        </label>
        <input
          type="number"
          name="low_stock_threshold"
          min={0}
          defaultValue={5}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Link
          href="/inventory"
          className="flex-1 text-center border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {t('cancelButton')}
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {submitting ? '…' : t('submitButton')}
        </button>
      </div>
    </form>
  )
}
