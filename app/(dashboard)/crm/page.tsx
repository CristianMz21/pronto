import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { businesses, employees } from '@/drizzle/schema'
import { eq, and, or, ilike, desc, sql } from 'drizzle-orm'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CrmImportButton } from '@/components/clients/crm-import-button'
import { formatCurrency, formatInBusinessTimezone } from '@/lib/utils'
import { Plus, Search, Phone, Mail } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getAuthUser } from '@/lib/auth-user'

function inDaysFromNow(dateStr: string, days: number): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return false
  const now = new Date()
  // Birthday handling: compare month/day ignore year, within next 7 days
  const thisYear = now.getFullYear()
  const bThisYear = new Date(thisYear, d.getMonth(), d.getDate())
  const diff = Math.ceil((bThisYear.getTime() - now.getTime()) / 86400000)
  return diff >= 0 && diff <= days
}

export default async function CRMPage(
  props: {
    searchParams: Promise<{ q?: string; tag?: string; segment?: string; location?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient()
  const t = await getTranslations('crm')
  const user = await getAuthUser()

  // Drizzle ORM — portable to Postgres/MySQL/SQLite via DATABASE_URL
  let businessId: string | null = null
  let businessCurrency = 'COP'
  let businessTz = 'America/Bogota'
  const ownedBiz = await db.query.businesses.findFirst({
    where: eq(businesses.ownerId, user!.id),
    columns: { id: true, currency: true, timezone: true },
  })
  if (ownedBiz) { businessId = ownedBiz.id; businessCurrency = ownedBiz.currency ?? 'COP'; businessTz = ownedBiz.timezone ?? 'America/Bogota' }
  else {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.userId, user!.id), eq(employees.isActive, true)),
      with: { businesses: { columns: { currency: true, timezone: true } } },
    }) as unknown as { businessId: string; businesses: { currency: string; timezone: string } } | undefined
    if (emp) { businessId = emp.businessId; businessCurrency = emp.businesses?.currency ?? 'COP'; businessTz = emp.businesses?.timezone ?? 'America/Bogota' }
  }
  if (!businessId) return null
  const business = { id: businessId, currency: businessCurrency, timezone: businessTz }

  const selectedLocation = searchParams.location ?? null
  let query = supabase.from('clients')
    .select('id, name, phone, email, tags, created_at, birthday, last_visit_at, preferences, preferred_barber_id, location_id')
    .eq('business_id', business.id)
    .order('name')
    .limit(80)

  if (selectedLocation) {
    query = (query as unknown as { eq: (c:string,v:string)=> typeof query }).eq('location_id', selectedLocation) as typeof query
  }

  if (searchParams.q) {
    query = query.or(`name.ilike.%${searchParams.q}%,phone.ilike.%${searchParams.q}%,email.ilike.%${searchParams.q}%`)
  }
  if (searchParams.tag) {
    query = query.contains('tags', [searchParams.tag])
  }

  const { data: clientsRaw } = await query
  let clients = clientsRaw ?? []
  const { data: locations } = await supabase.from('locations').select('id, name').eq('business_id', business.id).order('name')

  // Compute visits, spent, last visit, and last service name live from transactions
  const clientIds = (clients ?? []).map((c) => c.id)
  const statsMap: Record<string, { total_visits: number; total_spent: number; last_visit_at: string | null; lastService: string | null }> = {}
  if (clientIds.length > 0) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('client_id, amount, created_at, items')
      .eq('business_id', business.id)
      .eq('status', 'completed')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
      .limit(800)
    for (const tx of txs ?? []) {
      if (!tx.client_id) continue
      if (!statsMap[tx.client_id]) {
        statsMap[tx.client_id] = { total_visits: 0, total_spent: 0, last_visit_at: null, lastService: null }
      }
      statsMap[tx.client_id].total_visits++
      statsMap[tx.client_id].total_spent += tx.amount
      if (!statsMap[tx.client_id].last_visit_at) statsMap[tx.client_id].last_visit_at = tx.created_at
      if (!statsMap[tx.client_id].lastService) {
        const items = Array.isArray(tx.items) ? tx.items : []
        const name = (items[0] as any)?.name
        if (name) statsMap[tx.client_id].lastService = name
      }
    }
  }

  // Segment filtering (FR-CRM-003)
  const segment = searchParams.segment
  if (segment) {
    const now = Date.now()
    clients = clients.filter((c) => {
      const stats = statsMap[c.id]
      const last = stats?.last_visit_at ?? (c as unknown as { last_visit_at?: string | null }).last_visit_at ?? null
      const visits = stats?.total_visits ?? 0
      const tags = (c.tags ?? []) as string[]
      const bd = (c as unknown as { birthday?: string | null }).birthday
      if (segment === 'inactive_30') return last ? (now - new Date(last).getTime()) / 86400000 >= 30 : true
      if (segment === 'inactive_42') return last ? (now - new Date(last).getTime()) / 86400000 >= 42 : true
      if (segment === 'inactive_60') return last ? (now - new Date(last).getTime()) / 86400000 >= 60 : true
      if (segment === 'birthday_7') return bd ? inDaysFromNow(bd, 7) : false
      if (segment === 'vip') return tags.includes('vip') || tags.includes('VIP')
      if (segment === 'new') return visits > 0 && visits < 3
      if (segment === 'frequent') return visits >= 10
      return true
    })
  }

  return (
    <>
      <Header
        title={t('title')}
        actions={
          <div className="flex gap-2">
            <CrmImportButton />
            <Link href="/crm/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> {t('addClient')}</Button>
            </Link>
          </div>
        }
      />
      <main className="p-6">
        {(locations?.length ?? 0) > 1 && (
          <div className="mb-3 flex gap-2 text-xs">
            <Link href="/crm" className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}>Todas</Link>
            {locations!.map((l) => (
              <Link key={l.id} href={`/crm?location=${l.id}`} className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}>{l.name}</Link>
            ))}
          </div>
        )}
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <form>
              <input name="q" defaultValue={searchParams.q} type="search"
                placeholder={t('searchPlaceholder')}
                className="w-full max-w-sm pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </form>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: '', label: 'Todos' },
              { key: 'inactive_30', label: 'Inactivos 30d' },
              { key: 'inactive_42', label: '42d' },
              { key: 'inactive_60', label: '60d' },
              { key: 'birthday_7', label: 'Cumple 7d' },
              { key: 'vip', label: 'VIP' },
              { key: 'new', label: 'Nuevos' },
            ].map((s) => (
              <Link key={s.key} href={`/crm${s.key ? `?segment=${s.key}` : ''}`} className={`text-xs px-3 py-1.5 rounded-full border ${searchParams.segment === s.key || (!searchParams.segment && s.key === '') ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{s.label}</Link>
            ))}
          </div>
          {searchParams.segment && (
            <Link href={`/crm-campaigns?segment=${searchParams.segment}`} className="text-xs text-blue-600 hover:underline ml-2">
              Crear campaña →
            </Link>
          )}
          <Link href="/crm-campaigns" className="text-xs text-gray-500 hover:text-gray-700 ml-2">Ver campañas</Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {clients?.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <div className="text-4xl mb-3">{t('empty.icon')}</div>
              <div className="font-medium">{t('empty.heading')}</div>
              <div className="text-sm mt-1">
                <Link href="/crm/new" className="text-blue-600 hover:underline">{t('empty.action')}</Link>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-3 font-medium">{t('table.name')}</th>
                  <th className="text-left px-4 py-3 font-medium">{t('table.contact')}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t('table.tags')}</th>
                  <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">{t('table.lastService')}</th>
                  <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">{t('table.visits')}</th>
                  <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">{t('table.spent')}</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">{t('table.lastVisit')}</th>
                </tr>
              </thead>
              <tbody>
                {clients?.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/crm/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">{c.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex flex-col gap-0.5">
                        {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>}
                        {c.email && <span className="flex items-center gap-1 text-xs"><Mail className="w-3 h-3" /> {c.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-gray-600 text-sm">
                      {statsMap[c.id]?.lastService ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-700">{statsMap[c.id]?.total_visits ?? 0}</td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell font-medium text-gray-900">
                      {formatCurrency(statsMap[c.id]?.total_spent ?? 0, business.currency)}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-gray-500">
                      {statsMap[c.id]?.last_visit_at ? formatInBusinessTimezone(statsMap[c.id]!.last_visit_at!, business.timezone) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  )
}
