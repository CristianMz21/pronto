import { ArrowUpRight, CalendarDays, Package, TrendingUp, Users } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { Header } from '@/components/layout/header'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatInBusinessTimezone } from '@/lib/utils'

const STATUS_STRIPE: Record<string, string> = {
  pending: '#94a3b8',
  confirmed: '#16a34a',
  completed: '#3b82f6',
  paid: '#eab308',
  cancelled: '#ef4444',
  no_show: '#f97316',
}

type DashboardBusiness = {
  id: string
  name: string
  currency: string
  timezone: string
  onboarding_completed: boolean | null
  enabled_modules: string[] | null
}

async function resolveDashboardBusiness(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | undefined,
): Promise<DashboardBusiness | null> {
  const { data: ownedBiz } = await supabase
    .from('businesses')
    .select('id, name, currency, timezone, onboarding_completed, enabled_modules')
    .eq('owner_id', userId ?? '')
    .maybeSingle()
  if (ownedBiz) return ownedBiz as unknown as DashboardBusiness
  const { data: empBiz } = await supabase
    .from('employees')
    .select(
      'business_id, businesses!inner(id, name, currency, timezone, onboarding_completed, enabled_modules)',
    )
    .eq('user_id', userId ?? '')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!empBiz) return null
  return (empBiz as unknown as { businesses: DashboardBusiness }).businesses
}

function applyLocationFilter<T>(query: T, location: string | null): T {
  if (!location) return query
  return (query as unknown as { eq: (c: string, v: string) => T }).eq('location_id', location) as T
}

async function fetchDashboardData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bizId: string,
  todayStr: string,
  sevenDaysAgo: string,
  selectedLocation: string | null,
) {
  const clientCountQuery = applyLocationFilter(
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', bizId),
    selectedLocation,
  )
  const apptTodayQuery = applyLocationFilter(
    supabase
      .from('appointments')
      .select('id, status')
      .eq('business_id', bizId)
      .gte('starts_at', todayStr)
      .lt('starts_at', new Date(Date.now() + 86400000).toISOString().slice(0, 10)),
    selectedLocation,
  )
  const recentTxQuery = applyLocationFilter(
    supabase
      .from('transactions')
      .select('id, amount, payment_method, created_at, clients(name), employee_id, location_id')
      .eq('business_id', bizId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
    selectedLocation,
  )
  const upcomingQuery = applyLocationFilter(
    supabase
      .from('appointments')
      .select('id, starts_at, status, clients(name), services(name)')
      .eq('business_id', bizId)
      .gte('starts_at', new Date().toISOString())
      .in('status', ['pending', 'confirmed'])
      .order('starts_at', { ascending: true })
      .limit(5),
    selectedLocation,
  )
  const todayRevenueQuery = applyLocationFilter(
    supabase
      .from('transactions')
      .select('amount, employee_id')
      .eq('business_id', bizId)
      .eq('status', 'completed')
      .gte('created_at', todayStr),
    selectedLocation,
  )
  const inventoryQuery = applyLocationFilter(
    supabase
      .from('inventory_items')
      .select('quantity, low_stock_threshold, location_id')
      .eq('business_id', bizId),
    selectedLocation,
  )
  const sparklineQuery = applyLocationFilter(
    supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('business_id', bizId)
      .eq('status', 'completed')
      .gte('created_at', sevenDaysAgo),
    selectedLocation,
  )
  const clientStatsQuery = applyLocationFilter(
    supabase
      .from('transactions')
      .select('client_id, location_id')
      .eq('business_id', bizId)
      .eq('status', 'completed')
      .limit(1000),
    selectedLocation,
  )

  const [
    clientCountRes,
    apptTodayRes,
    recentTxRes,
    upcomingRes,
    todayRevenueRes,
    inventoryRes,
    sparklineRes,
    locationsRes,
    clientStatsRes,
  ] = await Promise.all([
    clientCountQuery as unknown as Promise<{ count: number | null }>,
    apptTodayQuery as unknown as Promise<{ data: { id: string; status: string }[] | null }>,
    recentTxQuery as unknown as Promise<{ data: unknown }>,
    upcomingQuery as unknown as Promise<{ data: unknown }>,
    todayRevenueQuery as unknown as Promise<{
      data: { amount: number; employee_id: string | null }[] | null
    }>,
    inventoryQuery as unknown as Promise<{
      data: { quantity: number; low_stock_threshold: number }[] | null
    }>,
    sparklineQuery as unknown as Promise<{ data: { amount: number; created_at: string }[] | null }>,
    supabase
      .from('locations')
      .select('id, name')
      .eq('business_id', bizId)
      .order('name') as unknown as Promise<{
      data: { id: string; name: string }[] | null
    }>,
    clientStatsQuery as unknown as Promise<{ data: { client_id: string | null }[] | null }>,
  ])

  return {
    clientCount: clientCountRes.count ?? 0,
    apptToday: apptTodayRes.data,
    recentTransactions: recentTxRes.data,
    upcomingAppointments: upcomingRes.data,
    todayRevenue: todayRevenueRes.data,
    inventoryItems: inventoryRes.data,
    sparklineRaw: sparklineRes.data,
    locations: locationsRes.data,
    clientStatsRaw: clientStatsRes.data,
  }
}

function computeRevenueStats(
  todayRevenue: { amount: number; employee_id: string | null }[] | null,
) {
  const revenueToday = (todayRevenue ?? []).reduce((sum, tx) => sum + Number(tx.amount), 0) ?? 0
  const avgTicket =
    todayRevenue && todayRevenue.length > 0
      ? Math.round((revenueToday / todayRevenue.length) * 100) / 100
      : 0
  return { revenueToday, avgTicket }
}

function computeLowStock(
  inventoryItems: { quantity: number; low_stock_threshold: number }[] | null,
) {
  return (
    (inventoryItems as Array<{ quantity: number; low_stock_threshold: number }> | null) ?? []
  ).filter((item) => Number(item.quantity) <= Number(item.low_stock_threshold)).length
}

function computeVisits(clientStatsRaw: { client_id: string | null }[] | null) {
  const visitsByClient: Record<string, number> = {}
  for (const r of (clientStatsRaw ?? []) as Array<{ client_id: string | null }>) {
    if (r.client_id) visitsByClient[r.client_id] = (visitsByClient[r.client_id] ?? 0) + 1
  }
  return {
    newClients: Object.values(visitsByClient).filter((v) => v < 3).length,
    returningClients: Object.values(visitsByClient).filter((v) => v >= 3).length,
  }
}

function computeBarberSales(todayRevenue: { amount: number; employee_id: string | null }[] | null) {
  const barberSales: Record<string, number> = {}
  for (const tx of (todayRevenue ?? []) as Array<{ amount: number; employee_id: string | null }>) {
    if (tx.employee_id)
      barberSales[tx.employee_id] = (barberSales[tx.employee_id] ?? 0) + Number(tx.amount)
  }
  return Object.entries(barberSales)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
}

function computeSparkline(sparklineRaw: { amount: number; created_at: string }[] | null) {
  const sparklineDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000)
    return d.toISOString().slice(0, 10)
  })
  const sparklineByDay: Record<string, number> = {}
  for (const day of sparklineDays) sparklineByDay[day] = 0
  for (const tx of (sparklineRaw ?? []) as Array<{ amount: number; created_at: string }>) {
    const day = tx.created_at.slice(0, 10)
    if (day in sparklineByDay) sparklineByDay[day] = (sparklineByDay[day] ?? 0) + tx.amount
  }
  const sparklineValues = sparklineDays.map((d) => sparklineByDay[d] ?? 0)
  const sparklineMax = Math.max(...sparklineValues, 1)
  return { sparklineValues, sparklineMax }
}

function computeStatusBreakdown(apptToday: { id: string; status: string }[] | null) {
  const count = apptToday?.length ?? 0
  const breakdown: Record<string, number> = {}
  for (const a of apptToday ?? []) breakdown[a.status] = (breakdown[a.status] ?? 0) + 1
  const parts = (['confirmed', 'pending', 'completed'] as const)
    .filter((s) => (breakdown[s] ?? 0) > 0)
    .map((s) => `${breakdown[s]} ${s}`)
  return { count, breakdown, parts }
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ location?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const t = await getTranslations('dashboard')
  const user = await getAuthUser()

  const business = await resolveDashboardBusiness(supabase, user?.id)
  if (!business) return null
  const biz = business

  if (!biz.onboarding_completed)
    redirect(
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
        ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/onboarding`
        : '/onboarding',
    )

  const todayStr = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const selectedLocation = searchParams.location ?? null

  const dashboardData = await fetchDashboardData(
    supabase,
    biz.id,
    todayStr,
    sevenDaysAgo,
    selectedLocation,
  )
  const {
    clientCount,
    apptToday,
    recentTransactions,
    upcomingAppointments,
    todayRevenue,
    inventoryItems,
    sparklineRaw,
    locations,
    clientStatsRaw,
  } = dashboardData
  const { revenueToday, avgTicket } = computeRevenueStats(todayRevenue)
  const lowStock = computeLowStock(inventoryItems)
  const { newClients, returningClients } = computeVisits(clientStatsRaw)
  const topBarbers = computeBarberSales(todayRevenue)
  const { sparklineValues, sparklineMax } = computeSparkline(sparklineRaw)
  const { count: apptTodayCount, parts: breakdownParts } = computeStatusBreakdown(apptToday)

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    completed: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    no_show: 'bg-gray-100 text-gray-600',
  }

  return (
    <>
      <Header title={t('title')} />
      <main className="p-6 space-y-6">
        <OnboardingChecklist
          businessId={biz.id}
          enabledModules={
            biz.enabled_modules ?? ['bookings', 'pos', 'crm', 'inventory', 'notifications']
          }
        />
        {(locations?.length ?? 0) > 1 && (
          <div className="flex gap-2 text-xs">
            <Link
              href="/dashboard"
              className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              Todas sucursales
            </Link>
            {(locations as unknown as Array<{ id: string; name: string }>)?.map(
              (l: { id: string; name: string }) => (
                <Link
                  key={l.id}
                  href={`/dashboard?location=${l.id}`}
                  className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
                >
                  {l.name}
                </Link>
              ),
            )}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue card — custom render for sparkline */}
          <Link href="/pos/history">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-green-50">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(revenueToday, biz.currency)}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{t('stats.revenueToday')}</div>
                {/* Sparkline */}
                <div className="flex items-end gap-[2px] mt-2 h-6">
                  {sparklineValues.map((val: number | undefined, i: number) => {
                    const isToday = i === 6
                    const barH = Math.max(4, Math.round(((val ?? 0) / sparklineMax) * 24))
                    return (
                      <div
                        key={i}
                        style={{
                          width: 6,
                          height: barH,
                          backgroundColor: isToday ? '#16a34a' : '#86efac',
                          borderRadius: 2,
                          flexShrink: 0,
                        }}
                      />
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Bookings today card — custom render for breakdown */}
          <Link href="/booking">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-blue-50">
                    <CalendarDays className="w-4 h-4 text-blue-600" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{apptTodayCount}</div>
                <div className="text-sm text-gray-500 mt-0.5">{t('stats.appointmentsToday')}</div>
                {breakdownParts.length > 0 && (
                  <div className="mt-1 text-gray-400 truncate" style={{ fontSize: 11 }}>
                    {breakdownParts.join(' · ')}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* Clients card */}
          <Link href="/crm">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-purple-50">
                    <Users className="w-4 h-4 text-purple-600" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{String(clientCount ?? 0)}</div>
                <div className="text-sm text-gray-500 mt-0.5">{t('stats.totalClients')}</div>
              </CardContent>
            </Card>
          </Link>

          {/* Low stock card */}
          <Link href="/inventory">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`p-2 rounded-lg ${lowStock > 0 ? 'bg-orange-50' : 'bg-green-50'}`}
                  >
                    <Package
                      className={`w-4 h-4 ${lowStock > 0 ? 'text-orange-600' : 'text-green-600'}`}
                    />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {lowStock > 0 ? String(lowStock) : t('stats.lowStockOk')}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{t('stats.lowStock')}</div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-gray-500">Ticket promedio hoy</div>
              <div className="text-xl font-bold">{formatCurrency(avgTicket, biz.currency)}</div>
              <div className="text-xs text-gray-400 mt-1">{todayRevenue?.length ?? 0} ventas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-gray-500">Nuevos / Recurrentes</div>
              <div className="text-xl font-bold">
                {newClients} / {returningClients}
              </div>
              <div className="text-xs text-gray-400 mt-1">visitas &lt;3 / ≥3</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-gray-500">Top barbero hoy</div>
              {topBarbers.length === 0 ? (
                <div className="text-sm text-gray-400">Sin ventas</div>
              ) : (
                topBarbers.map(([id, total]) => (
                  <div key={id} className="text-sm font-medium">
                    {id.slice(0, 8)} · {formatCurrency(total as number, biz.currency)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Link href="/reportes">
            <Card className="hover:shadow-md cursor-pointer">
              <CardContent className="p-5">
                <div className="text-xs text-gray-500">Reportes</div>
                <div className="text-sm font-medium text-blue-600 mt-2">Ver reportes →</div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                {t('upcomingAppointments.heading')}
                <Link href="/booking" className="text-sm font-normal text-blue-600 hover:underline">
                  {t('upcomingAppointments.viewAll')}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(upcomingAppointments as unknown as Array<{ id: string }> | null)?.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center">
                  {t('upcomingAppointments.empty')}{' '}
                  <Link href="/booking" className="text-blue-600 hover:underline">
                    {t('upcomingAppointments.addOne')}
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {(
                    upcomingAppointments as unknown as Array<{
                      id: string
                      status: string
                      starts_at: string
                      clients: { name: string } | null
                      services: { name: string } | null
                    }> | null
                  )?.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 pl-3 relative"
                    >
                      {/* Status stripe */}
                      <span
                        className="absolute left-0 top-1 bottom-1"
                        style={{
                          width: 3,
                          borderRadius: 2,
                          backgroundColor: STATUS_STRIPE[a.status] ?? STATUS_STRIPE.pending,
                        }}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {(a.clients as { name: string } | null)?.name ??
                            t('upcomingAppointments.walkIn')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {(a.services as { name: string } | null)?.name} ·{' '}
                          {formatInBusinessTimezone(a.starts_at as string, biz.timezone)}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[a.status]}`}
                      >
                        {t(`appointmentStatus.${a.status}` as unknown as string)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                {t('recentSales.heading')}
                <Link
                  href="/pos/history"
                  className="text-sm font-normal text-blue-600 hover:underline"
                >
                  {t('recentSales.viewAll')}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(recentTransactions as unknown as Array<{ id: string }> | null)?.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center">
                  {t('recentSales.empty')}{' '}
                  <Link href="/pos" className="text-blue-600 hover:underline">
                    {t('recentSales.makeFirst')}
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {(
                    recentTransactions as unknown as Array<{
                      id: string
                      amount: number
                      payment_method: string
                      created_at: string
                      clients: { name: string } | null
                    }> | null
                  )?.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {(tx.clients as { name: string } | null)?.name ??
                            String(t('recentSales.walkIn' as unknown as string))}
                        </div>
                        <div className="text-xs text-gray-500 capitalize">
                          {tx.payment_method} ·{' '}
                          {formatInBusinessTimezone(tx.created_at as string, biz.timezone)}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(tx.amount, biz.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  )
}
