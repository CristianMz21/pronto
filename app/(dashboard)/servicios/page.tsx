import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Header } from '@/components/layout/header'
import { ServiciosClient } from '@/components/servicios/servicios-client'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'

export default async function ServiciosPage(props: {
  searchParams: Promise<{ location?: string }>
}) {
  const searchParams = await props.searchParams
  const selectedLocation = searchParams.location ?? null
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user)
    redirect(
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
        ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/login`
        : '/login',
    )

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
  if (!businessId)
    redirect(
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
        ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/onboarding`
        : '/onboarding',
    )

  let svcQuery = supabase
    .from('services')
    .select(
      'id, name, description, price, duration_min, category, is_active, is_featured, color, cost, location_id',
    )
    .eq('business_id', businessId)
    .order('name')
  if (selectedLocation)
    svcQuery = (svcQuery as unknown as { eq: (c: string, v: string) => typeof svcQuery }).eq(
      'location_id',
      selectedLocation,
    ) as typeof svcQuery
  // Also include services with null location_id when filtering? For T060 we keep strict filter; change to or if needed: location_id eq selected OR null. For now strict.
  const [{ data: services }, { data: locations }] = await Promise.all([
    svcQuery as unknown as Promise<{ data: unknown }>,
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
  ])

  return (
    <>
      <Header title="Servicios" />
      {(locations?.length ?? 0) > 1 && (
        <div className="px-6 pt-3 flex gap-2 text-xs">
          <Link
            href="/servicios"
            className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}
          >
            Todos
          </Link>
          {locations?.map((l) => (
            <Link
              key={l.id}
              href={`/servicios?location=${l.id}`}
              className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}
      <main className="p-6">
        <ServiciosClient
          services={
            (services as unknown as {
              id: string
              name: string
              description?: string | null
              price: number
              duration_min: number
              category?: string | null
              is_active: boolean
              is_featured?: boolean
              color?: string | null
              cost?: number | null
              location_id?: string | null
            }[]) ?? []
          }
          locations={locations ?? []}
        />
      </main>
    </>
  )
}
