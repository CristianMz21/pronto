import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { BarberosClient } from '@/components/barberos/barberos-client'
import { getAuthUser } from '@/lib/auth-user'
import { redirect } from 'next/navigation'

export default async function BarberosPage() {
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

  const [{ data: employees }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from('employees').select('id, name, phone, email, role, color, specialties, commission_rate, commission_fixed, is_active, location_id, created_at').eq('business_id', businessId).order('name'),
    supabase.from('services').select('id, name').eq('business_id', businessId).eq('is_active', true).order('name'),
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
  ])

  return (
    <>
      <Header title="Barberos" />
      <main className="p-6">
        <BarberosClient employees={employees ?? []} services={services ?? []} locations={locations ?? []} />
      </main>
    </>
  )
}
