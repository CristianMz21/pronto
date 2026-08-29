import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BarberosClient } from '@/components/barberos/barberos-client'
import { Header } from '@/components/layout/header'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'

export default async function BarberosPage(props: {
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

  let empQuery = supabase
    .from('employees')
    .select(
      'id, name, phone, email, role, color, specialties, commission_rate, commission_fixed, is_active, location_id, created_at',
    )
    .eq('business_id', businessId)
    .order('name')
  if (selectedLocation)
    empQuery = (empQuery as unknown as { eq: (c: string, v: string) => typeof empQuery }).eq(
      'location_id',
      selectedLocation,
    ) as typeof empQuery
  const [{ data: employees }, { data: services }, { data: locations }] = await Promise.all([
    empQuery as unknown as Promise<{ data: unknown }>,
    supabase
      .from('services')
      .select('id, name')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name'),
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
  ])

  return (
    <>
      <Header title="Barberos" />
      {(locations?.length ?? 0) > 1 && (
        <div className="px-6 pt-3 flex gap-2 text-xs">
          <Link
            href="/barberos"
            className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}
          >
            Todas
          </Link>
          {locations!.map((l) => (
            <Link
              key={l.id}
              href={`/barberos?location=${l.id}`}
              className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}
      <main className="p-6">
        <BarberosClient
          employees={
            (employees as unknown as
              | {
                  id: string
                  name: string
                  phone?: string | null
                  email?: string | null
                  role: string
                  color?: string | null
                  specialties?: string[] | null
                  commission_rate?: number | null
                  commission_fixed?: number | null
                  is_active: boolean
                  location_id?: string | null
                  created_at?: string
                }[]
              | null) ?? []
          }
          services={services ?? []}
          locations={locations ?? []}
        />
      </main>
    </>
  )
}
