import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatInBusinessTimezone } from '@/lib/utils'
import { Users, Package, CalendarDays, TrendingUp, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { getAuthUser } from '@/lib/auth-user'

const STATUS_STRIPE: Record<string, string> = {
  pending:   '#94a3b8',
  confirmed: '#16a34a',
  completed: '#3b82f6',
  paid:      '#eab308',
  cancelled: '#ef4444',
  no_show:   '#f97316',
}

export default async function DashboardPage(props: { searchParams: Promise<{ location?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const t = await getTranslations('dashboard')
  const user = await getAuthUser()

  let business: { id: string; name: string; currency: string; timezone: string; onboarding_completed: boolean | null; enabled_modules: string[] | null } | null = null
  const { data: ownedBiz } = await supabase
    .from('businesses')
    .select('id, name, currency, timezone, onboarding_completed, enabled_modules')
    .eq('owner_id', user!.id)
    .maybeSingle()
  if (ownedBiz) business = ownedBiz as typeof business
  else {
    const { data: empBiz } = await supabase.from('employees').select('business_id, businesses!inner(id, name, currency, timezone, onboarding_completed, enabled_modules)').eq('user_id', user!.id).eq('is_active', true).limit(1).maybeSingle()
    if (empBiz) business = (empBiz as unknown as { businesses: typeof business }).businesses
  }

  if (!business) return null

  if (!business.onboarding_completed) redirect('/onboarding')

  const todayStr = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const selectedLocation = searchParams.location ?? null

  const [
    { count: clientCount },
    { data: apptToday },
    { data: recentTransactions },
    { data: upcomingAppointments },
    { data: todayRevenue },
    { data: inventoryItems },
    { data: sparklineRaw },
    { data: locations },
    { data: clientStatsRaw },
  ] = await Promise.all([
    (() => { let q = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', business.id); if (selectedLocation) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('location_id', selectedLocation) as typeof q; return q })(),
    (() => { let q = supabase.from('appointments').select('id, status').eq('business_id', business.id).gte('starts_at', todayStr).lt('starts_at', new Date(Date.now() + 86400000).toISOString().slice(0, 10)); if (selectedLocation) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('location_id', selectedLocation) as typeof q; return q })() as Promise<{ data: { id: string; status: string }[] | null }>,
    supabase.from('transactions').select('id, amount, payment_method, created_at, clients(name), employee_id').eq('business_id', business.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(5) as Promise<{ data: unknown }>,
    (() => { let q = supabase.from('appointments').select('id, starts_at, status, clients(name), services(name)').eq('business_id', business.id).gte('starts_at', new Date().toISOString()).in('status', ['pending', 'confirmed']).order('starts_at', { ascending: true }).limit(5); if (selectedLocation) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('location_id', selectedLocation) as typeof q; return q })() as Promise<{ data: unknown }>,
    (() => { let q = supabase.from('transactions').select('amount, employee_id').eq('business_id', business.id).eq('status', 'completed').gte('created_at', todayStr); if (selectedLocation) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('location_id', selectedLocation) as typeof q; return q })() as Promise<{ data: { amount: number; employee_id: string | null }[] | null }>,
    (() => { let q = supabase.from('inventory_items').select('quantity, low_stock_threshold, location_id').eq('business_id', business.id); if (selectedLocation) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('location_id', selectedLocation) as typeof q; return q })() as Promise<{ data: { quantity: number; low_stock_threshold: number }[] | null }>,
    (() => { let q = supabase.from('transactions').select('amount, created_at').eq('business_id', business.id).eq('status', 'completed').gte('created_at', sevenDaysAgo); if (selectedLocation) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('location_id', selectedLocation) as typeof q; return q })() as Promise<{ data: { amount: number; created_at: string }[] | null }>,
    supabase.from('locations').select('id, name').eq('business_id', business.id).order('name'),
    // lightweight new vs returning: count transactions per client in last 90d
    supabase.from('transactions').select('client_id').eq('business_id', business.id).eq('status', 'completed').limit(1000),
  ])

  const revenueToday = (todayRevenue ?? []).reduce((sum, tx) => sum + Number(tx.amount), 0) ?? 0
  const avgTicket = (todayRevenue && todayRevenue.length > 0) ? Math.round((revenueToday / todayRevenue.length) * 100) / 100 : 0
  const lowStock = (inventoryItems ?? []).filter(
    (item) => Number(item.quantity) <= Number(item.low_stock_threshold)
  ).length
  // New vs returning approximation: clients with <3 visits vs >=3 using transaction counts
  const visitsByClient: Record<string, number> = {}
  for (const r of (clientStatsRaw ?? []) as { client_id: string | null }[]) { if (r.client_id) visitsByClient[r.client_id] = (visitsByClient[r.client_id] ?? 0) + 1 }
  const newClients = Object.values(visitsByClient).filter((v) => v < 3).length
  const returningClients = Object.values(visitsByClient).filter((v) => v >= 3).length
  // Top barbers from today's transactions
  const barberSales: Record<string, number> = {}
  for (const tx of (todayRevenue ?? []) as { amount: number; employee_id: string | null }[]) { if (tx.employee_id) barberSales[tx.employee_id] = (barberSales[tx.employee_id] ?? 0) + Number(tx.amount) }
  const topBarbers = Object.entries(barberSales).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // Sparkline: sum revenue per day for last 7 days
  const sparklineDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000)
    return d.toISOString().slice(0, 10)
  })
  const sparklineByDay: Record<string, number> = {}
  for (const day of sparklineDays) sparklineByDay[day] = 0
  for (const tx of sparklineRaw ?? []) {
    const day = tx.created_at.slice(0, 10)
    if (day in sparklineByDay) sparklineByDay[day] += tx.amount
  }
  const sparklineValues = sparklineDays.map((d) => sparklineByDay[d])
  const sparklineMax = Math.max(...sparklineValues, 1)

  // Bookings today breakdown by status
  const apptTodayCount = apptToday?.length ?? 0
  const statusBreakdown: Record<string, number> = {}
  for (const a of apptToday ?? []) {
    statusBreakdown[a.status] = (statusBreakdown[a.status] ?? 0) + 1
  }
  const breakdownParts = (['confirmed', 'pending', 'completed'] as const)
    .filter((s) => (statusBreakdown[s] ?? 0) > 0)
    .map((s) => `${statusBreakdown[s]} ${s}`)

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
        <OnboardingChecklist businessId={business.id} enabledModules={business.enabled_modules ?? ['bookings', 'pos', 'crm', 'inventory', 'notifications']} />
        {(locations?.length ?? 0) > 1 && (
          <div className="flex gap-2 text-xs">
            <Link href="/dashboard" className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}>Todas sucursales</Link>
            {locations!.map((l) => (
              <Link key={l.id} href={`/dashboard?location=${l.id}`} className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}>{l.name}</Link>
            ))}
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
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(revenueToday, business.currency)}</div>
                <div className="text-sm text-gray-500 mt-0.5">{t('stats.revenueToday')}</div>
                {/* Sparkline */}
                <div className="flex items-end gap-[2px] mt-2 h-6">
                  {sparklineValues.map((val, i) => {
                    const isToday = i === 6
                    const barH = Math.max(4, Math.round((val / sparklineMax) * 24))
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
                  <div className={`p-2 rounded-lg ${lowStock > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                    <Package className={`w-4 h-4 ${lowStock > 0 ? 'text-orange-600' : 'text-green-600'}`} />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{lowStock > 0 ? String(lowStock) : t('stats.lowStockOk')}</div>
                <div className="text-sm text-gray-500 mt-0.5">{t('stats.lowStock')}</div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-5"><div className="text-xs text-gray-500">Ticket promedio hoy</div><div className="text-xl font-bold">{formatCurrency(avgTicket, business.currency)}</div><div className="text-xs text-gray-400 mt-1">{todayRevenue?.length ?? 0} ventas</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-xs text-gray-500">Nuevos / Recurrentes</div><div className="text-xl font-bold">{newClients} / {returningClients}</div><div className="text-xs text-gray-400 mt-1">visitas &lt;3 / ≥3</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-xs text-gray-500">Top barbero hoy</div>{topBarbers.length === 0 ? <div className="text-sm text-gray-400">Sin ventas</div> : topBarbers.map(([id, total]) => <div key={id} className="text-sm font-medium">{id.slice(0, 8)} · {formatCurrency(total as number, business.currency)}</div>)}</CardContent></Card>
          <Link href="/reportes"><Card className="hover:shadow-md cursor-pointer"><CardContent className="p-5"><div className="text-xs text-gray-500">Reportes</div><div className="text-sm font-medium text-blue-600 mt-2">Ver reportes →</div></CardContent></Card></Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                {t('upcomingAppointments.heading')}
                <Link href="/booking" className="text-sm font-normal text-blue-600 hover:underline">{t('upcomingAppointments.viewAll')}</Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingAppointments?.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center">
                  {t('upcomingAppointments.empty')}{' '}
                  <Link href="/booking" className="text-blue-600 hover:underline">{t('upcomingAppointments.addOne')}</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingAppointments?.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 pl-3 relative">
                      {/* Status stripe */}
                      <span
                        className="absolute left-0 top-1 bottom-1"
                        style={{ width: 3, borderRadius: 2, backgroundColor: STATUS_STRIPE[a.status] ?? STATUS_STRIPE.pending }}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {(a.clients as { name: string } | null)?.name ?? t('upcomingAppointments.walkIn')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {(a.services as { name: string } | null)?.name} · {formatInBusinessTimezone(a.starts_at, business.timezone)}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[a.status]}`}>
                        {t(`appointmentStatus.${a.status}` as any)}
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
                <Link href="/pos/history" className="text-sm font-normal text-blue-600 hover:underline">{t('recentSales.viewAll')}</Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentTransactions?.length === 0 ? (
                <div className="text-sm text-gray-500 py-4 text-center">
                  {t('recentSales.empty')}{' '}
                  <Link href="/pos" className="text-blue-600 hover:underline">{t('recentSales.makeFirst')}</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentTransactions?.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {(tx.clients as { name: string } | null)?.name ?? t('recentSales.walkIn')}
                        </div>
                        <div className="text-xs text-gray-500 capitalize">
                          {tx.payment_method} · {formatInBusinessTimezone(tx.created_at, business.timezone)}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(tx.amount, business.currency)}
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
