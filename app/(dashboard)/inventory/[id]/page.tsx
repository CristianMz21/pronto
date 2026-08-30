import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { Header } from '@/components/layout/header'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'

import { InventoryDetailView } from './inventory-detail-view'

export default async function InventoryItemPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const t = await getTranslations('inventoryDetail')
  const user = await getAuthUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency, timezone')
    .eq('owner_id', user?.id ?? '')
    .maybeSingle()
  if (!business) return null

  const { data: item } = await supabase
    .from('inventory_items')
    .select(
      'id, name, sku, category, unit, quantity, low_stock_threshold, cost_price, sell_price, created_at, updated_at',
    )
    .eq('id', params.id)
    .eq('business_id', business.id)
    .maybeSingle()

  if (!item) notFound()

  const [{ data: movements }, { data: categoryRows }] = await Promise.all([
    supabase
      .from('inventory_movements')
      .select('id, type, quantity, note, created_at')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('inventory_items')
      .select('category')
      .eq('business_id', business.id)
      .not('category', 'is', null),
  ])

  const categories = [...new Set((categoryRows ?? []).map((r) => r.category as string))].sort()

  return (
    <>
      <Header
        title={item.name}
        actions={
          <Link
            href="/inventory"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('backToInventory')}
          </Link>
        }
      />
      <InventoryDetailView
        item={item}
        movements={
          (movements as unknown as {
            id: string
            type: 'in' | 'out' | 'adjustment'
            quantity: number
            note: string | null
            created_at: string
          }[]) ?? []
        }
        currency={business.currency}
        timezone={business.timezone}
        businessId={business.id}
        categories={categories}
      />
    </>
  )
}
