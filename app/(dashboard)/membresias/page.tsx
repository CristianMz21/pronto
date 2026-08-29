import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Header } from '@/components/layout/header'
import { MembresiasClient } from '@/components/membresias/membresias-client'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'

export default async function MembresiasPage(props: {
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

  let memQuery = supabase
    .from('memberships')
    .select('id, name, price, duration_days, benefits, is_active, location_id, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (selectedLocation)
    memQuery = (memQuery as unknown as { eq: (c: string, v: string) => typeof memQuery }).eq(
      'location_id',
      selectedLocation,
    ) as typeof memQuery
  let clientMemQuery = supabase
    .from('client_memberships')
    .select('id, client_id, membership_id, starts_at, expires_at, remaining, status, clients(name)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100)
  // client_memberships location filter via join would need RPC; for now filter client-side if location selected via membership location_id match (nullable = all)
  const [
    { data: memberships },
    { data: locations },
    { data: clientMemberships },
    { data: clients },
  ] = await Promise.all([
    memQuery as unknown as Promise<{ data: unknown }>,
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
    clientMemQuery as unknown as Promise<{ data: unknown }>,
    supabase
      .from('clients')
      .select('id, name')
      .eq('business_id', businessId)
      .order('name')
      .limit(200),
  ])

  return (
    <>
      <Header title="Membresías" />
      {(locations?.length ?? 0) > 1 && (
        <div className="px-6 pt-3 flex gap-2 text-xs">
          <Link
            href="/membresias"
            className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}
          >
            Todas
          </Link>
          {locations!.map((l) => (
            <Link
              key={l.id}
              href={`/membresias?location=${l.id}`}
              className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}
      <main className="p-4 md:p-6">
        <MembresiasClient
          memberships={
            (memberships as unknown as
              | {
                  id: string
                  name: string
                  price: number
                  duration_days: number
                  benefits: Record<string, unknown>
                  is_active: boolean
                  location_id: string | null
                  created_at: string
                }[]
              | null) ?? []
          }
          locations={(locations as unknown as { id: string; name: string }[] | null) ?? []}
          clientMemberships={
            (clientMemberships as unknown as
              | {
                  id: string
                  client_id: string
                  membership_id: string
                  starts_at: string
                  expires_at: string
                  remaining: number
                  status: string
                  clients: { name: string } | null
                }[]
              | null) ?? []
          }
          clients={(clients as unknown as { id: string; name: string }[] | null) ?? []}
        />
      </main>
    </>
  )
}
