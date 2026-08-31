import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Header } from '@/components/layout/header'
import { ReportExportButton } from '@/components/reportes/report-export-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

const TABS = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'barberos', label: 'Barberos' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'cancelaciones', label: 'Cancelaciones' },
]

function rangeToSince(range?: string): string {
  const now = Date.now()
  if (range === 'day') return new Date(now - 24 * 3600 * 1000).toISOString()
  if (range === 'month') return new Date(now - 30 * 86400000).toISOString()
  return new Date(now - 7 * 86400000).toISOString()
}

type ReportTx = {
  id: string
  amount: number
  created_at: string
  employee_id: string | null
  client_id: string | null
  items: unknown
}
type ReportAppt = {
  id: string
  status: string
  service_id: string | null
  employee_id: string | null
  starts_at: string
  services: { name: string } | null
}

async function resolveReportesBusiness(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ businessId: string; currency: string } | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('owner_id', userId)
    .maybeSingle()
  if (owned)
    return {
      businessId: (owned as { id: string }).id,
      currency: (owned as { currency: string }).currency ?? 'COP',
    }
  const { data: emp } = await supabase
    .from('employees')
    .select('business_id, businesses!inner(id, currency)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!emp) return null
  return {
    businessId: (emp as { business_id: string }).business_id,
    currency:
      (emp as unknown as { businesses: { currency: string } }).businesses?.currency ?? 'COP',
  }
}

async function fetchReportesData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  since: string,
  location: string | null,
) {
  let txQuery = supabase
    .from('transactions')
    .select('id, amount, created_at, employee_id, client_id, items')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)
  if (location)
    txQuery = (txQuery as unknown as { eq: (c: string, v: string) => typeof txQuery }).eq(
      'location_id',
      location,
    ) as typeof txQuery
  let apptQuery = supabase
    .from('appointments')
    .select('id, status, service_id, employee_id, starts_at, services(name)')
    .eq('business_id', businessId)
    .gte('starts_at', since)
  if (location)
    apptQuery = (apptQuery as unknown as { eq: (c: string, v: string) => typeof apptQuery }).eq(
      'location_id',
      location,
    ) as typeof apptQuery

  const [locationsRes, txRes, apptRes, empRes] = await Promise.all([
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
    txQuery as unknown as Promise<{ data: ReportTx[] | null }>,
    apptQuery as unknown as Promise<{ data: ReportAppt[] | null }>,
    supabase.from('employees').select('id, name').eq('business_id', businessId),
  ])

  const employeeMap = new Map((empRes.data ?? []).map((e) => [e.id, e.name]))
  return { locations: locationsRes.data, txs: txRes.data, appts: apptRes.data, employeeMap }
}

function buildVentasTab(
  txs: ReportTx[] | null,
  employeeMap: Map<string, string>,
  currency: string,
): { exportData: Record<string, unknown>[]; content: React.ReactNode } {
  const total = (txs ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const count = txs?.length ?? 0
  const avg = count ? Math.round((total / count) * 100) / 100 : 0
  const exportData = (txs ?? []).map((t) => ({
    id: t.id,
    amount: t.amount,
    date: t.created_at.slice(0, 10),
    employee: t.employee_id ? (employeeMap.get(t.employee_id) ?? t.employee_id) : '—',
  }))
  const content = (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-gray-500">Total ventas</div>
          <div className="font-bold">{formatCurrency(total, currency)}</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-gray-500">Transacciones</div>
          <div className="font-bold">{count}</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-gray-500">Ticket promedio</div>
          <div className="font-bold">{formatCurrency(avg, currency)}</div>
        </div>
      </div>
      <div className="overflow-auto border rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Empleado</th>
              <th className="px-3 py-2 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {(txs ?? []).slice(0, 50).map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-1">{t.created_at.slice(0, 10)}</td>
                <td className="px-3 py-1">
                  {t.employee_id
                    ? (employeeMap.get(t.employee_id) ?? t.employee_id.slice(0, 8))
                    : '—'}
                </td>
                <td className="px-3 py-1 text-right">
                  {formatCurrency(Number(t.amount), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
  return { exportData, content }
}

function buildServiciosTab(
  appts: ReportAppt[] | null,
  txs: ReportTx[] | null,
  currency: string,
): { exportData: Record<string, unknown>[]; content: React.ReactNode } {
  const byService: Record<string, { count: number; total: number }> = {}
  for (const a of (appts ?? []) as unknown as {
    services: { name: string } | null
    service_id: string | null
  }[]) {
    const name = a.services?.name ?? '—'
    if (!byService[name]) byService[name] = { count: 0, total: 0 }
    byService[name].count++
  }
  for (const t of (txs ?? []) as unknown as { items: unknown[] }[]) {
    const items = Array.isArray(t.items) ? (t.items as { name?: string; price?: number }[]) : []
    for (const it of items) {
      const n = it.name ?? '—'
      if (!byService[n]) byService[n] = { count: 0, total: 0 }
      byService[n].total += Number(it.price ?? 0)
    }
  }
  const exportData = Object.entries(byService).map(([name, v]) => ({
    servicio: name,
    citas: v.count,
    ingresos: v.total,
  }))
  const content = (
    <div className="overflow-auto border rounded-lg">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2 text-left">Servicio</th>
            <th className="px-3 py-2 text-right">Citas</th>
            <th className="px-3 py-2 text-right">Ingresos</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byService).map(([name, v]) => (
            <tr key={name} className="border-t">
              <td className="px-3 py-1">{name}</td>
              <td className="px-3 py-1 text-right">{v.count}</td>
              <td className="px-3 py-1 text-right">{formatCurrency(v.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  return { exportData, content }
}

function buildBarberosTab(
  txs: ReportTx[] | null,
  employeeMap: Map<string, string>,
  currency: string,
): { exportData: Record<string, unknown>[]; content: React.ReactNode } {
  const byBarber: Record<string, { sales: number; count: number }> = {}
  for (const t of (txs ?? []) as unknown as { employee_id: string | null; amount: number }[]) {
    if (!t.employee_id) continue
    if (!byBarber[t.employee_id]) byBarber[t.employee_id] = { sales: 0, count: 0 }
    // @ts-expect-error - tsc strict fix
    byBarber[t.employee_id].sales += Number(t.amount)
    // @ts-expect-error - tsc strict fix
    byBarber[t.employee_id].count++
  }
  const exportData = Object.entries(byBarber).map(([id, v]) => ({
    barbero: employeeMap.get(id) ?? id.slice(0, 8),
    ventas: v.sales,
    citas: v.count,
  }))
  const content = (
    <div className="overflow-auto border rounded-lg">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2 text-left">Barbero</th>
            <th className="px-3 py-2 text-right">Ventas</th>
            <th className="px-3 py-2 text-right">Transacciones</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byBarber)
            .sort((a, b) => b[1].sales - a[1].sales)
            .map(([id, v]) => (
              <tr key={id} className="border-t">
                <td className="px-3 py-1">{employeeMap.get(id) ?? id.slice(0, 8)}</td>
                <td className="px-3 py-1 text-right">{formatCurrency(v.sales, currency)}</td>
                <td className="px-3 py-1 text-right">{v.count}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
  return { exportData, content }
}

function buildClientesTab(txs: ReportTx[] | null): {
  exportData: Record<string, unknown>[]
  content: React.ReactNode
} {
  const byClient: Record<string, number> = {}
  for (const t of (txs ?? []) as unknown as { client_id: string | null }[]) {
    if (!t.client_id) continue
    byClient[t.client_id] = (byClient[t.client_id] ?? 0) + 1
  }
  const newC = Object.values(byClient).filter((v) => v < 3).length
  const ret = Object.values(byClient).filter((v) => v >= 3).length
  const exportData = [
    { nuevos: newC, recurrentes: ret, total_clientes: Object.keys(byClient).length },
  ]
  const content = (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <div className="bg-blue-50 p-3 rounded-lg">
        <div className="text-gray-500">Nuevos (&lt;3)</div>
        <div className="font-bold">{newC}</div>
      </div>
      <div className="bg-green-50 p-3 rounded-lg">
        <div className="text-gray-500">Recurrentes</div>
        <div className="font-bold">{ret}</div>
      </div>
      <div className="bg-gray-50 p-3 rounded-lg">
        <div className="text-gray-500">Total activos</div>
        <div className="font-bold">{Object.keys(byClient).length}</div>
      </div>
    </div>
  )
  return { exportData, content }
}

function buildCancelacionesTab(
  appts: ReportAppt[] | null,
  employeeMap: Map<string, string>,
): { exportData: Record<string, unknown>[]; content: React.ReactNode } {
  const cancelled = (appts ?? []).filter(
    (a) => a.status === 'cancelled' || a.status === 'cancelled_late' || a.status === 'no_show',
  )
  const exportData = cancelled.map((a) => ({
    id: a.id,
    status: a.status,
    fecha: a.starts_at.slice(0, 10),
    barbero: a.employee_id ? (employeeMap.get(a.employee_id) ?? a.employee_id.slice(0, 8)) : '—',
  }))
  const content = (
    <div className="overflow-auto border rounded-lg">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Barbero</th>
            <th className="px-3 py-2 text-left">Estado</th>
          </tr>
        </thead>
        <tbody>
          {cancelled.slice(0, 50).map((a) => (
            <tr key={a.id} className="border-t">
              <td className="px-3 py-1">{a.starts_at.slice(0, 10)}</td>
              <td className="px-3 py-1">
                {a.employee_id
                  ? (employeeMap.get(a.employee_id) ?? a.employee_id.slice(0, 8))
                  : '—'}
              </td>
              <td className="px-3 py-1">{a.status}</td>
            </tr>
          ))}
          {cancelled.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                Sin cancelaciones en rango
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
  return { exportData, content }
}

function buildReportesTabContent(
  tab: string,
  txs: ReportTx[] | null,
  appts: ReportAppt[] | null,
  employeeMap: Map<string, string>,
  currency: string,
) {
  if (tab === 'ventas') return buildVentasTab(txs, employeeMap, currency)
  if (tab === 'servicios') return buildServiciosTab(appts, txs, currency)
  if (tab === 'barberos') return buildBarberosTab(txs, employeeMap, currency)
  if (tab === 'clientes') return buildClientesTab(txs)
  if (tab === 'cancelaciones') return buildCancelacionesTab(appts, employeeMap)
  return buildVentasTab(txs, employeeMap, currency)
}

export default async function ReportesPage(props: {
  searchParams: Promise<{ tab?: string; range?: string; location?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const resolved = await resolveReportesBusiness(supabase, user.id)
  if (!resolved) redirect('/onboarding')
  const { businessId, currency } = resolved

  const tab = searchParams.tab ?? 'ventas'
  const range = searchParams.range ?? 'week'
  const location = searchParams.location ?? null
  const since = rangeToSince(range)

  const { locations, txs, appts, employeeMap } = await fetchReportesData(
    supabase,
    businessId,
    since,
    location,
  )

  const built = buildReportesTabContent(tab, txs, appts, employeeMap, currency)
  const exportData = built.exportData
  const content = built.content

  return (
    <>
      <Header title="Reportes" />
      <main className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-1">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/reportes?tab=${t.key}&range=${range}${location ? `&location=${location}` : ''}`}
                className={`text-xs px-3 py-1.5 rounded-full border ${tab === t.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-50'}`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <div className="flex gap-1">
            {(['day', 'week', 'month'] as const).map((r) => (
              <Link
                key={r}
                href={`/reportes?tab=${tab}&range=${r}${location ? `&location=${location}` : ''}`}
                className={`text-xs px-2 py-1 rounded border ${range === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
              >
                {r}
              </Link>
            ))}
          </div>
        </div>
        {(locations?.length ?? 0) > 1 && (
          <div className="flex gap-2 text-xs">
            <Link
              href={`/reportes?tab=${tab}&range=${range}`}
              className={`px-3 py-1 rounded-full border ${!location ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              Todas
            </Link>
            {locations?.map((l) => (
              <Link
                key={l.id}
                href={`/reportes?tab=${tab}&range=${range}&location=${l.id}`}
                className={`px-3 py-1 rounded-full border ${location === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
              >
                {l.name}
              </Link>
            ))}
          </div>
        )}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm capitalize">
              {tab} · {range}
            </CardTitle>
            <ReportExportButton data={exportData} filename={`reporte-${tab}-${range}.xlsx`} />
          </CardHeader>
          <CardContent>{content}</CardContent>
        </Card>
      </main>
    </>
  )
}
