import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth-user'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

export default async function ClientPortalPage(props: { searchParams: Promise<{ phone?: string; client_id?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()

  // Try to resolve business via owner or employee
  let businessId: string | null = null
  let currency = 'COP'
  if (user) {
    const { data: owned } = await supabase.from('businesses').select('id, currency').eq('owner_id', user.id).maybeSingle()
    if (owned) { businessId = (owned as { id: string }).id; currency = (owned as { currency: string }).currency ?? 'COP' }
    else {
      const { data: emp } = await supabase.from('employees').select('business_id, businesses!inner(currency)').eq('user_id', user.id).limit(1).maybeSingle()
      if (emp) { businessId = (emp as { business_id: string }).business_id; currency = (emp as unknown as { businesses: { currency: string } }).businesses?.currency ?? 'COP' }
    }
  }
  // Fallback: if not logged in, try to find business via first client matching phone (service query)
  let client: { id: string; name: string; phone: string | null; business_id: string } | null = null
  let loyaltyPoints = 0
  let memberships: { id: string; remaining: number; expires_at: string; status: string; memberships: { name: string } | null }[] = []

  // If authenticated, try linked client
  if (user && businessId) {
    const { data: linked } = await supabase.from('clients').select('id, name, phone, business_id').eq('user_id', user.id).eq('business_id', businessId).limit(1).maybeSingle()
    if (linked) client = linked as typeof client
  }

  // If phone search provided, try to find client (works for public without auth via service? we use anon with RLS maybe limited, try service fallback)
  if (!client && searchParams.phone) {
    // Use supabase with RLS - try to find by phone (may require business context)
    // First try to find any business matching phone (inefficient but ok for demo)
    // We'll try to query clients where phone = searchParams.phone (needs business_id, so we search across all businesses visible)
    const { data: found } = await supabase.from('clients').select('id, name, phone, business_id').eq('phone', searchParams.phone).limit(1).maybeSingle()
    if (found) {
      client = found as typeof client
      businessId = (found as { business_id: string }).business_id
      // Try to get currency for that business
      const { data: biz } = await supabase.from('businesses').select('currency').eq('id', businessId).maybeSingle()
      if (biz) currency = (biz as { currency: string }).currency ?? 'COP'
    }
  }

  if (!client && searchParams.client_id && businessId) {
    const { data: c } = await supabase.from('clients').select('id, name, phone, business_id').eq('id', searchParams.client_id).maybeSingle()
    if (c) client = c as typeof client
  }

  if (client) {
    const [{ data: loyalty }, { data: cms }] = await Promise.all([
      supabase.from('loyalty_accounts').select('points').eq('client_id', client.id).maybeSingle(),
      supabase.from('client_memberships').select('id, remaining, expires_at, status, memberships(name)').eq('client_id', client.id).order('expires_at', { ascending: true }).limit(10),
    ])
    loyaltyPoints = (loyalty as { points: number } | null)?.points ?? 0
    memberships = (cms as unknown as typeof memberships) ?? []
  }

  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center py-6">
          <h1 className="text-2xl font-bold text-gray-900">Mi cuenta Escudería</h1>
          <p className="text-sm text-gray-500 mt-1">Consulta tus membresías y puntos</p>
        </div>

        {!client ? (
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <p className="text-sm text-gray-600">Ingresa tu teléfono registrado para ver tu saldo.</p>
            <form className="space-y-3">
              <input name="phone" defaultValue={searchParams.phone ?? ''} placeholder="300 123 4567" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <button type="submit" className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm">Consultar</button>
            </form>
            {user && <p className="text-xs text-gray-400">O inicia sesión como cliente para ver automáticamente.</p>}
            {!user && <Link href="/login" className="text-xs text-blue-600 underline">Iniciar sesión</Link>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-medium text-gray-900">{client.name}</h2>
              <p className="text-sm text-gray-500">{client.phone ?? '—'}</p>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-medium text-sm flex items-center gap-2">⭐ Puntos fidelización</h3>
              <p className="text-2xl font-bold text-amber-700 mt-2">{loyaltyPoints} pts</p>
              <p className="text-sm text-gray-500">Valor {formatCurrency(loyaltyPoints * 100, currency)} (100 pts = $10.000)</p>
              <p className="text-xs text-gray-400 mt-1">Ganas 1 pt por cada $1.000 COP</p>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-medium text-sm">👑 Membresías</h3>
              {memberships.length === 0 ? (
                <p className="text-sm text-gray-400 mt-2">Sin membresías activas. Pregunta en recepción por “4 cortes/mes $99k”.</p>
              ) : (
                <div className="space-y-2 mt-3">
                  {memberships.map((m) => {
                    const exp = new Date(m.expires_at)
                    const isActive = m.status === 'active' && m.remaining > 0 && exp.getTime() > Date.now()
                    return (
                      <div key={m.id} className={`p-3 rounded-lg border ${isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="font-medium text-sm">{m.memberships?.name ?? m.id.slice(0, 8)}</div>
                        <div className="text-xs text-gray-600">Usos restantes: <span className="font-bold">{m.remaining}</span> · Vence {exp.toLocaleDateString('es-CO')}</div>
                        <div className={`text-xs mt-1 ${isActive ? 'text-green-700' : 'text-gray-500'}`}>{isActive ? 'Activa' : m.status === 'expired' ? 'Expirada' : m.status}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <Link href={`/book/escuderia`} className="block w-full text-center bg-gray-900 text-white rounded-lg py-3 text-sm">Reservar con beneficios →</Link>
            <a href={`/client?phone=${encodeURIComponent(client.phone ?? '')}`} className="block text-center text-xs text-gray-500 underline">Actualizar</a>
          </div>
        )}
      </div>
    </div>
  )
}
