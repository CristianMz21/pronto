import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Header } from '@/components/layout/header'
import { PromocionesClient } from '@/components/promociones/promociones-client'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'

export default async function PromocionesPage(props: {
  searchParams: Promise<{ location?: string }>
}) {
  const searchParams = await props.searchParams
  const selectedLocation = searchParams.location ?? null
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  let businessId: string | null = null
  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) businessId = (owned as { id: string }).id
  else {
    const { data: emp } = await supabase
      .from('employees')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (emp) businessId = (emp as { business_id: string }).business_id
  }
  if (!businessId) redirect('/onboarding')

  let promoQuery = supabase
    .from('promotions')
    .select(
      'id, name, type, value, promo_code, valid_from, valid_to, rules, is_active, location_id, created_at',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (selectedLocation)
    promoQuery = (promoQuery as unknown as { eq: (c: string, v: string) => typeof promoQuery }).eq(
      'location_id',
      selectedLocation,
    ) as typeof promoQuery
  const [{ data: promotions }, { data: locations }, { data: services }] = await Promise.all([
    promoQuery as unknown as Promise<{ data: unknown }>,
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
    supabase
      .from('services')
      .select('id, name')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <>
      <Header title="Promociones" />
      {(locations?.length ?? 0) > 1 && (
        <div className="px-6 pt-3 flex gap-2 text-xs">
          <Link
            href="/promociones"
            className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}
          >
            Todas
          </Link>
          {locations?.map((l) => (
            <Link
              key={l.id}
              href={`/promociones?location=${l.id}`}
              className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}
      <main className="p-4 md:p-6">
        <PromocionesClient
          promotions={
            (promotions as unknown as
              | {
                  id: string
                  name: string
                  type: string
                  value: number
                  promo_code: string | null
                  valid_from: string
                  valid_to: string | null
                  rules: Record<string, unknown>
                  is_active: boolean
                  location_id: string | null
                  created_at: string
                }[]
              | null) ?? []
          }
          locations={(locations as unknown as { id: string; name: string }[] | null) ?? []}
          services={(services as unknown as { id: string; name: string }[] | null) ?? []}
        />
      </main>
    </>
  )
}
