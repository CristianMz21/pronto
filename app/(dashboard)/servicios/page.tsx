import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ServiciosClient } from '@/components/servicios/servicios-client'
import { getAuthUser } from '@/lib/auth-user'
import { redirect } from 'next/navigation'

export default async function ServiciosPage() {
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

  const [{ data: services }, { data: locations }] = await Promise.all([
    supabase.from('services').select('id, name, description, price, duration_min, category, is_active, is_featured, color, cost, location_id').eq('business_id', businessId).order('name'),
    supabase.from('locations').select('id, name').eq('business_id', businessId).order('name'),
  ])

  return (
    <>
      <Header title="Servicios" />
      <main className="p-6">
        <ServiciosClient services={services as unknown as { id: string; name: string; description?: string | null; price: number; duration_min: number; category?: string | null; is_active: boolean; is_featured?: boolean; color?: string | null; cost?: number | null; location_id?: string | null }[] ?? []} locations={locations ?? []} />
      </main>
    </>
  )
}
