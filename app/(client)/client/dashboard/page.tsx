import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './dashboard-client'

export const dynamic = 'force-dynamic'

export default async function ClientDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/client/login?redirect=/client/dashboard')

  // Fetch all client profiles linked to this auth user (one per business)
  const { data: clients } = await supabase
    .from('clients')
    .select('id, business_id, name, phone, email, whatsapp_number, birthday, total_visits, total_spent, last_visit_at, created_at, businesses!inner(name, slug)')
    .eq('user_id', user.id)

  if (!clients || clients.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Bienvenido!</h2>
        <p className="text-sm text-gray-500 mb-4">Aún no tenés reservas vinculadas a tu cuenta.</p>
        <a href="/" className="inline-block bg-blue-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-blue-700">
          Reservá por primera vez
        </a>
      </div>
    )
  }

  const clientIds = clients.map((c) => c.id)

  // Próxima cita: pending/confirmed/scheduled + starts_at > now order asc limit 1
  const nowIso = new Date().toISOString()
  const { data: upcomingRows } = await supabase
    .from('appointments')
    .select('id, starts_at, ends_at, status, price, business_id, service_id, employee_id, services(name), businesses(name, slug)')
    .in('client_id', clientIds)
    .in('status', ['pending', 'confirmed', 'scheduled'])
    .gt('starts_at', nowIso)
    .order('starts_at', { ascending: true })
    .limit(1)

  // Historial: últimas 20 citas — incluye service_id/employee_id para 1-click rebook US1
  const { data: historyRows } = await supabase
    .from('appointments')
    .select('id, starts_at, ends_at, status, price, service_id, employee_id, business_id, businesses(name, slug), services(name)')
    .in('client_id', clientIds)
    .order('starts_at', { ascending: false })
    .limit(20)

  // Transacciones completed for gasto total fallback
  const { data: txRows } = await supabase
    .from('transactions')
    .select('id, amount, created_at, status, businesses(name)')
    .in('client_id', clientIds)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(20)

  // Stats aggregated
  const totalVisits = clients.reduce((sum, c) => sum + (c.total_visits ?? 0), 0)
  const totalSpentClients = clients.reduce((sum, c) => sum + Number(c.total_spent ?? 0), 0)
  const totalSpentTx = txRows ? txRows.reduce((sum, t) => sum + Number(t.amount ?? 0), 0) : 0
  const totalSpent = totalSpentClients > 0 ? totalSpentClients : totalSpentTx
  const lastVisitAt = clients.reduce((latest: string | null, c) => {
    if (!c.last_visit_at) return latest
    if (!latest) return c.last_visit_at
    return c.last_visit_at > latest ? c.last_visit_at : latest
  }, null as string | null)

  // For profile editing we use the first client as primary (multi-business user edits per-business; MVP edits first)
  const primary = clients[0]

  return (
    <DashboardClient
      userEmail={user.email ?? ''}
      clients={clients as unknown as Array<{ id: string; business_id: string; name: string; phone: string | null; email: string | null; whatsapp_number: string | null; birthday: string | null; total_visits: number; total_spent: number; last_visit_at: string | null; businesses: { name: string; slug: string } }>}
      primaryClient={primary as unknown as { id: string; name: string; phone: string | null; email: string | null; whatsapp_number: string | null; birthday: string | null }}
      upcoming={upcomingRows?.[0] ?? null}
      history={historyRows ?? []}
      transactions={txRows ?? []}
      stats={{ total_visits: totalVisits, total_spent: totalSpent, last_visit_at: lastVisitAt }}
    />
  )
}
