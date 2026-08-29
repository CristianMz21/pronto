import { Plus, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { InventoryExportButton } from '@/components/inventory/inventory-export-button'
import { InventoryImportButton } from '@/components/inventory/inventory-import-button'
import { InventoryMoreMenu } from '@/components/inventory/inventory-more-menu'
import { TransferButton } from '@/components/inventory/transfer-button'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'

import { InventoryTabs } from './inventory-tabs'

export default async function InventoryPage(props: {
  searchParams: Promise<{ filter?: string; tab?: string; location?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const t = await getTranslations('inventory')
  const user = await getAuthUser()

  let businessId: string | null = null
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('owner_id', user!.id)
    .maybeSingle()
  let currency = 'COP'
  if (owned) {
    businessId = (owned as { id: string; currency: string }).id
    currency = (owned as { currency: string }).currency ?? 'COP'
  } else {
    const { data: empBiz } = await supabase
      .from('employees')
      .select('business_id, businesses!inner(id, currency)')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (empBiz) {
      businessId = (empBiz as { business_id: string }).business_id
      const b = (empBiz as unknown as { businesses: { currency: string } }).businesses
      currency = b?.currency ?? 'COP'
    }
  }
  if (!businessId) return null
  const currencyVal = currency

  let query = supabase
    .from('inventory_items')
    .select(
      'id, name, sku, barcode, category, unit, quantity, low_stock_threshold, cost_price, sell_price, location_id',
    )
    .eq('business_id', businessId)
    .order('name')
  if (searchParams.location) query = query.eq('location_id', searchParams.location) as typeof query

  const [{ data: items }, { data: locations }] = await Promise.all([
    query,
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
  ])

  const lowStockCount =
    items?.filter((i) => Number(i.quantity) <= Number(i.low_stock_threshold)).length ?? 0

  return (
    <>
      <Header
        title={t('title')}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <InventoryImportButton />
              <InventoryExportButton />
            </div>
            <TransferButton
              items={(items ?? []).map((i) => ({
                id: i.id,
                name: i.name,
                quantity: Number(i.quantity),
              }))}
              locations={locations ?? []}
            />
            <InventoryMoreMenu />
            <Link href="/inventory/new">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" /> {t('addItem')}
              </Button>
            </Link>
          </div>
        }
      />
      <main className="p-6">
        {lowStockCount > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {lowStockCount === 1
              ? t('lowStockAlert', { count: lowStockCount })
              : t('lowStockAlertPlural', { count: lowStockCount })}
          </div>
        )}
        {/* @ts-expect-error - tsc strict fix */}
        <InventoryTabs
          items={items ?? []}
          currency={currencyVal}
          initialFilter={searchParams.filter}
          initialTab={searchParams.tab}
        />
        {(locations?.length ?? 0) > 1 && (
          <div className="mt-4 flex gap-2 text-xs">
            <Link
              href="/inventory"
              className={`px-3 py-1 rounded-full border ${!searchParams.location ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              Todas
            </Link>
            {locations!.map((l) => (
              <Link
                key={l.id}
                href={`/inventory?location=${l.id}`}
                className={`px-3 py-1 rounded-full border ${searchParams.location === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {l.name}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
