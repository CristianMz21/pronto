import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { MembresiasClient } from '@/components/membresias/membresias-client'
import { getAuthUser } from '@/lib/auth-user'
import { redirect } from 'next/navigation'

export default async function MembresiasPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  let businessId: string | null = null
  const { data: owned } = await supabase.from('businesses').select('id').eq('owner_id', user.id).maybeSingle()
  if (owned) businessId = (owned as { id: string }).id
  else {
    const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
    if (emp) businessId = (emp as { business_id: string }).business_id
  }
  if (!businessId) redirect('/onboarding')

  const [{ data: memberships }, { data: locations }, { data: clientMemberships }, { data: clients }] = await Promise.all([
    supabase.from('memberships').select('id, name, price, duration_days, benefits, is_active, location_id, created_at').eq('business_id', businessId).order('created_at', { ascending: false }),
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
    supabase.from('client_memberships').select('id, client_id, membership_id, starts_at, expires_at, remaining, status, clients(name)').eq('business_id', businessId).order('created_at', { ascending: false }).limit(100),
    supabase.from('clients').select('id, name').eq('business_id', businessId).order('name').limit(200),
  ])

  return (
    <>
      <Header title="Membresías" />
      <main className="p-4 md:p-6">
        <MembresiasClient
          memberships={(memberships as unknown as { id: string; name: string; price: number; duration_days: number; benefits: Record<string, unknown>; is_active: boolean; location_id: string | null; created_at: string }[] | null) ?? []}
          locations={(locations as unknown as { id: string; name: string }[] | null) ?? []}
          clientMemberships={(clientMemberships as unknown as { id: string; client_id: string; membership_id: string; starts_at: string; expires_at: string; remaining: number; status: string; clients: { name: string } | null }[] | null) ?? []}
          clients={(clients as unknown as { id: string; name: string }[] | null) ?? []}
        />
      </main>
    </>
  )
}
