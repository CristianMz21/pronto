import { and, eq, ilike, inArray, or } from 'drizzle-orm'
import { Mail, Phone, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { CrmImportButton } from '@/components/clients/crm-import-button'
import { Header } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  businesses,
  clients as clientsTable,
  employees,
  locations,
  transactions,
} from '@/drizzle/schema'
import { getAuthUser } from '@/lib/auth-user'
import { db } from '@/lib/db'
import { formatCurrency, formatInBusinessTimezone } from '@/lib/utils'

function inDaysFromNow(dateStr: string, days: number): boolean {
  if (!dateStr) return false
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  const thisYear = now.getFullYear()
  const bThisYear = new Date(thisYear, d.getMonth(), d.getDate())
  const diff = Math.ceil((bThisYear.getTime() - now.getTime()) / 86400000)
  return diff >= 0 && diff <= days
}

type CrmClient = {
  id: string
  name: string
  phone: string | null
  email: string | null
  tags: string[]
  createdAt: string
  birthday: string | null
  lastVisitAt: string | null
  locationId: string | null
}

async function resolveCrmBusiness(
  userId: string | undefined,
): Promise<{ id: string; currency: string; timezone: string } | null> {
  const ownedBiz = await db.query.businesses.findFirst({
    where: eq(businesses.ownerId, userId ?? ''),
    columns: { id: true, currency: true, timezone: true },
  })
  if (ownedBiz)
    return {
      id: ownedBiz.id,
      currency: ownedBiz.currency ?? 'COP',
      timezone: ownedBiz.timezone ?? 'America/Bogota',
    }
  const emp = (await db.query.employees.findFirst({
    where: and(eq(employees.userId, userId ?? ''), eq(employees.isActive, true)),
    with: { business: { columns: { currency: true, timezone: true } } },
  })) as unknown as
    | { businessId: string; business: { currency: string; timezone: string } }
    | undefined
  if (!emp) return null
  return {
    id: emp.businessId,
    currency: emp.business?.currency ?? 'COP',
    timezone: emp.business?.timezone ?? 'America/Bogota',
  }
}

function buildClientConditions(
  businessId: string,
  location: string | null,
  qParam: string | undefined,
): ReturnType<typeof eq>[] {
  const conds: ReturnType<typeof eq>[] = [eq(clientsTable.businessId, businessId)]
  if (location) conds.push(eq(clientsTable.locationId, location))
  if (qParam) {
    const q = `%${qParam}%`
    conds.push(
      or(
        ilike(clientsTable.name, q),
        ilike(clientsTable.phone, q),
        ilike(clientsTable.email, q),
      ) as unknown as ReturnType<typeof eq>,
    )
  }
  return conds
}

function filterByTag(clients: CrmClient[], tag: string | undefined): CrmClient[] {
  if (!tag) return clients
  return clients.filter((c) => (c.tags ?? []).includes(tag))
}

function matchesSegment(
  c: CrmClient,
  segment: string,
  stats: Record<string, { total_visits: number; last_visit_at: string | null }>,
  now: number,
): boolean {
  const s = stats[c.id]
  const last =
    s?.last_visit_at ?? (c as unknown as { lastVisitAt?: string | null }).lastVisitAt ?? null
  const visits = s?.total_visits ?? 0
  const tags = (c.tags ?? []) as string[]
  const bd = (c as unknown as { birthday?: string | null }).birthday
  if (segment === 'inactive_30')
    return last ? (now - new Date(last).getTime()) / 86400000 >= 30 : true
  if (segment === 'inactive_42')
    return last ? (now - new Date(last).getTime()) / 86400000 >= 42 : true
  if (segment === 'inactive_60')
    return last ? (now - new Date(last).getTime()) / 86400000 >= 60 : true
  if (segment === 'birthday_7') return bd ? inDaysFromNow(bd, 7) : false
  if (segment === 'vip') return tags.includes('vip') || tags.includes('VIP')
  if (segment === 'new') return visits > 0 && visits < 3
  if (segment === 'frequent') return visits >= 10
  return true
}

function filterBySegment(
  clients: CrmClient[],
  segment: string | undefined,
  statsMap: Record<string, { total_visits: number; last_visit_at: string | null }>,
): CrmClient[] {
  if (!segment) return clients
  const now = Date.now()
  return clients.filter((c) => matchesSegment(c, segment, statsMap, now))
}

async function fetchClientsWithFilters(
  businessId: string,
  location: string | null,
  q: string | undefined,
  tag: string | undefined,
): Promise<CrmClient[]> {
  const conds = buildClientConditions(businessId, location, q)
  let clientsRaw = await db.query.clients.findMany({
    where: and(...conds),
    orderBy: (c, { asc }) => [asc(c.name)],
    limit: 80,
  })
  let clients = clientsRaw as unknown as CrmClient[]
  clients = filterByTag(clients, tag)
  return clients
}

async function buildStatsMap(
  businessId: string,
  clientIds: string[],
): Promise<
  Record<
    string,
    {
      total_visits: number
      total_spent: number
      last_visit_at: string | null
      lastService: string | null
    }
  >
> {
  const map: Record<
    string,
    {
      total_visits: number
      total_spent: number
      last_visit_at: string | null
      lastService: string | null
    }
  > = {}
  if (clientIds.length === 0) return map
  const txs = await db.query.transactions.findMany({
    where: and(
      eq(transactions.businessId, businessId),
      eq(transactions.status, 'completed'),
      inArray(transactions.clientId, clientIds),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 800,
    columns: { clientId: true, amount: true, createdAt: true, items: true },
  })
  for (const tx of txs) {
    if (!tx.clientId) continue
    if (!map[tx.clientId])
      map[tx.clientId] = { total_visits: 0, total_spent: 0, last_visit_at: null, lastService: null }
    const entry = map[tx.clientId]!
    entry.total_visits++
    entry.total_spent += Number(tx.amount ?? 0)
    if (!entry.last_visit_at) entry.last_visit_at = tx.createdAt as unknown as string
    if (!entry.lastService) {
      const items = Array.isArray(tx.items) ? (tx.items as unknown[]) : []
      const name = (items[0] as { name?: string } | undefined)?.name
      if (name) entry.lastService = name
    }
  }
  return map
}

export default async function CRMPage(props: {
  searchParams: Promise<{ q?: string; tag?: string; segment?: string; location?: string }>
}) {
  const searchParams = await props.searchParams
  const t = await getTranslations('crm')
  const user = await getAuthUser()

  const business = await resolveCrmBusiness(user?.id)
  if (!business) return null

  const selectedLocation = searchParams.location ?? null

  let clients = await fetchClientsWithFilters(
    business.id,
    selectedLocation,
    searchParams.q,
    searchParams.tag,
  )

  const locs = await db.query.locations.findMany({
    where: eq(locations.businessId, business.id),
    orderBy: (l, { asc }) => [asc(l.name)],
    columns: { id: true, name: true },
  })

  const clientIds = clients.map((c) => c.id)
  const statsMap = await buildStatsMap(business.id, clientIds)

  clients = filterBySegment(
    clients,
    searchParams.segment,
    statsMap as unknown as Record<string, { total_visits: number; last_visit_at: string | null }>,
  )

  return (
    <>
      <Header
        title={t('title')}
        actions={
          <div className="flex gap-2">
            <CrmImportButton />
            <Link href="/crm/new">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" /> {t('addClient')}
              </Button>
            </Link>
          </div>
        }
      />
      <main className="p-6">
        {(locs?.length ?? 0) > 1 && (
          <div className="mb-3 flex gap-2 text-xs">
            <Link
              href="/crm"
              className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              Todas
            </Link>
            {locs?.map((l) => (
              <Link
                key={l.id}
                href={`/crm?location=${l.id}`}
                className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {l.name}
              </Link>
            ))}
          </div>
        )}
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <form>
              <input
                name="q"
                defaultValue={searchParams.q}
                type="search"
                placeholder={t('searchPlaceholder')}
                className="w-full max-w-sm pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
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
              <Link
                key={s.key}
                href={`/crm${s.key ? `?segment=${s.key}` : ''}`}
                className={`text-xs px-3 py-1.5 rounded-full border ${searchParams.segment === s.key || (!searchParams.segment && s.key === '') ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          {searchParams.segment && (
            <Link
              href={`/crm-campaigns?segment=${searchParams.segment}`}
              className="text-xs text-blue-600 hover:underline ml-2"
            >
              Crear campaña →
            </Link>
          )}
          <Link href="/crm-campaigns" className="text-xs text-gray-500 hover:text-gray-700 ml-2">
            Ver campañas
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {clients?.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <div className="text-4xl mb-3">{t('empty.icon')}</div>
              <div className="font-medium">{t('empty.heading')}</div>
              <div className="text-sm mt-1">
                <Link href="/crm/new" className="text-blue-600 hover:underline">
                  {t('empty.action')}
                </Link>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-3 font-medium">{t('table.name')}</th>
                  <th className="text-left px-4 py-3 font-medium">{t('table.contact')}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
                    {t('table.tags')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">
                    {t('table.lastService')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">
                    {t('table.visits')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">
                    {t('table.spent')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">
                    {t('table.lastVisit')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients?.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/crm/${c.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex flex-col gap-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1 text-xs">
                            <Mail className="w-3 h-3" /> {c.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-gray-600 text-sm">
                      {statsMap[c.id]?.lastService ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-700">
                      {statsMap[c.id]?.total_visits ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell font-medium text-gray-900">
                      {formatCurrency(statsMap[c.id]?.total_spent ?? 0, business.currency)}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-gray-500">
                      {statsMap[c.id]?.last_visit_at
                        ? formatInBusinessTimezone(
                            statsMap[c.id]?.last_visit_at ?? '',
                            business.timezone,
                          )
                        : '—'}
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
