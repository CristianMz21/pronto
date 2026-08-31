import Link from 'next/link'

import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

type PortalClient = { id: string; name: string; phone: string | null; business_id: string }
type PortalMembership = {
  id: string
  remaining: number
  expires_at: string
  status: string
  memberships: { name: string } | null
}

async function resolveBusinessForPortal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: Awaited<ReturnType<typeof getAuthUser>>,
): Promise<{ businessId: string | null; currency: string }> {
  if (!user) return { businessId: null, currency: 'COP' }
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned)
    return {
      businessId: (owned as { id: string }).id,
      currency: (owned as { currency: string }).currency ?? 'COP',
    }
  const { data: emp } = await supabase
    .from('employees')
    .select('business_id, businesses!inner(currency)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!emp) return { businessId: null, currency: 'COP' }
  return {
    businessId: (emp as { business_id: string }).business_id,
    currency:
      (emp as unknown as { businesses: { currency: string } }).businesses?.currency ?? 'COP',
  }
}

async function findLinkedClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: Awaited<ReturnType<typeof getAuthUser>>,
  businessId: string | null,
): Promise<PortalClient | null> {
  if (!user || !businessId) return null
  const { data: linked } = await supabase
    .from('clients')
    .select('id, name, phone, business_id')
    .eq('user_id', user.id)
    .eq('business_id', businessId)
    .limit(1)
    .maybeSingle()
  return linked as unknown as PortalClient | null
}

async function findClientByPhone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  phone: string,
): Promise<{ client: PortalClient | null; businessId: string | null; currency: string | null }> {
  const { data: found } = await supabase
    .from('clients')
    .select('id, name, phone, business_id')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle()
  if (!found) return { client: null, businessId: null, currency: null }
  const client = found as unknown as PortalClient
  const businessId = (found as { business_id: string }).business_id
  const { data: biz } = await supabase
    .from('businesses')
    .select('currency')
    .eq('id', businessId)
    .maybeSingle()
  const currency = biz ? ((biz as { currency: string }).currency ?? 'COP') : null
  return { client, businessId, currency }
}

async function findClientById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
): Promise<PortalClient | null> {
  const { data: c } = await supabase
    .from('clients')
    .select('id, name, phone, business_id')
    .eq('id', clientId)
    .maybeSingle()
  return c as unknown as PortalClient | null
}

async function resolvePortalClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: Awaited<ReturnType<typeof getAuthUser>>,
  searchParams: { phone?: string; client_id?: string },
  initialBusinessId: string | null,
): Promise<{ client: PortalClient | null; businessId: string | null; currency: string | null }> {
  let businessId = initialBusinessId
  const linked = await findLinkedClient(supabase, user, businessId)
  if (linked) return { client: linked, businessId, currency: null }

  if (searchParams.phone) {
    const byPhone = await findClientByPhone(supabase, searchParams.phone)
    if (byPhone.client) return byPhone
  }

  if (searchParams.client_id && businessId) {
    const byId = await findClientById(supabase, searchParams.client_id)
    if (byId) return { client: byId, businessId, currency: null }
  }

  return { client: null, businessId, currency: null }
}

async function fetchLoyaltyAndMemberships(
  supabase: Awaited<ReturnType<typeof createClient>>,
  client: PortalClient | null,
): Promise<{ loyaltyPoints: number; memberships: PortalMembership[] }> {
  if (!client) return { loyaltyPoints: 0, memberships: [] }
  const [{ data: loyalty }, { data: cms }] = await Promise.all([
    supabase.from('loyalty_accounts').select('points').eq('client_id', client.id).maybeSingle(),
    supabase
      .from('client_memberships')
      .select('id, remaining, expires_at, status, memberships(name)')
      .eq('client_id', client.id)
      .order('expires_at', { ascending: true })
      .limit(10),
  ])
  return {
    loyaltyPoints: (loyalty as { points: number } | null)?.points ?? 0,
    memberships: (cms as unknown as PortalMembership[]) ?? [],
  }
}

async function resolveBookHref(
  supabase: Awaited<ReturnType<typeof createClient>>,
  client: PortalClient | null,
  businessId: string | null,
): Promise<string> {
  let slug: string | null = null
  const targetId = (client as { business_id?: string } | null)?.business_id ?? businessId
  if (!targetId) return '/book'
  const { data: biz } = await supabase
    .from('businesses')
    .select('slug')
    .eq('id', targetId)
    .maybeSingle()
  slug = (biz as { slug: string } | null)?.slug ?? null
  return slug ? `/book/${slug}` : '/book'
}

export default async function ClientPortalPage(props: {
  searchParams: Promise<{ phone?: string; client_id?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()

  const businessInit = await resolveBusinessForPortal(supabase, user)
  let businessId = businessInit.businessId
  let currency = businessInit.currency

  const resolved = await resolvePortalClient(supabase, user, searchParams, businessId)
  let client: PortalClient | null = resolved.client
  if (resolved.businessId) businessId = resolved.businessId
  if (resolved.currency) currency = resolved.currency

  const { loyaltyPoints, memberships } = await fetchLoyaltyAndMemberships(supabase, client)
  const renderClient = client
  const nowMs = Date.now()
  const bookHref = await resolveBookHref(supabase, client, businessId)
  return (
    <div className="min-h-screen bg-[#FBF8F5] p-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center py-6">
          <h1 className="text-2xl font-bold text-gray-900">Mi cuenta</h1>
          <p className="text-sm text-gray-500 mt-1">Consulta tus membresías y puntos</p>
        </div>

        {!renderClient ? (
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Ingresa tu teléfono registrado para ver tu saldo.
            </p>
            <form className="space-y-3">
              <input
                name="phone"
                defaultValue={searchParams.phone ?? ''}
                placeholder="300 123 4567"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm"
              >
                Consultar
              </button>
            </form>
            {user && (
              <p className="text-xs text-gray-400">
                O inicia sesión como cliente para ver automáticamente.
              </p>
            )}
            {!user && (
              <Link href="/login" className="text-xs text-blue-600 underline">
                Iniciar sesión
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-medium text-gray-900">{renderClient?.name}</h2>
              <p className="text-sm text-gray-500">{renderClient?.phone ?? '—'}</p>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-medium text-sm flex items-center gap-2">
                ⭐ Puntos fidelización
              </h3>
              <p className="text-2xl font-bold text-amber-700 mt-2">{loyaltyPoints} pts</p>
              <p className="text-sm text-gray-500">
                Valor {formatCurrency(loyaltyPoints * 100, currency)} (100 pts = $10.000)
              </p>
              <p className="text-xs text-gray-400 mt-1">Ganas 1 pt por cada $1.000 COP</p>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-medium text-sm">👑 Membresías</h3>
              {memberships.length === 0 ? (
                <p className="text-sm text-gray-400 mt-2">
                  Sin membresías activas. Pregunta en recepción por “4 cortes/mes $99k”.
                </p>
              ) : (
                <div className="space-y-2 mt-3">
                  {memberships.map((m) => {
                    const exp = new Date(m.expires_at)
                    const isActive =
                      m.status === 'active' && m.remaining > 0 && exp.getTime() > nowMs
                    // @ts-expect-error - tsc strict fix
                    const _renderClient = client as {
                      id: string
                      name: string
                      phone: string | null
                      business_id: string
                    } | null
                    return (
                      <div
                        key={m.id}
                        className={`p-3 rounded-lg border ${isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <div className="font-medium text-sm">
                          {m.memberships?.name ?? m.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-gray-600">
                          Usos restantes: <span className="font-bold">{m.remaining}</span> · Vence{' '}
                          {exp.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
                        </div>
                        <div
                          className={`text-xs mt-1 ${isActive ? 'text-green-700' : 'text-gray-500'}`}
                        >
                          {isActive ? 'Activa' : m.status === 'expired' ? 'Expirada' : m.status}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <Link
              href={bookHref}
              className="block w-full text-center bg-gray-900 text-white rounded-lg py-3 text-sm"
            >
              Reservar con beneficios →
            </Link>
            <a
              href={`/client?phone=${encodeURIComponent(renderClient?.phone ?? '')}`}
              className="block text-center text-xs text-gray-500 underline"
            >
              Actualizar
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
