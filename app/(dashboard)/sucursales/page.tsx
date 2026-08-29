import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Header } from '@/components/layout/header'
import { SucursalesClient } from '@/components/sucursales/sucursales-client'
import { getAuthUser } from '@/lib/auth-user'
import { redirect } from 'next/navigation'

export default async function SucursalesPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // Resolve business: owner > employee
  let business: { id: string; slug: string } | null = null
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, slug, address, phone')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) {
    business = owned as { id: string; slug: string }
  } else {
    const { data: emp } = await supabase
      .from('employees')
      .select('business_id, businesses!inner(id, slug)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (emp) {
      const b = (emp as unknown as { businesses: { id: string; slug: string } }).businesses
      business = b
    }
  }
  if (!business) redirect('/onboarding')

  // Fetch locations
  let { data: locations } = await supabase
    .from('locations')
    .select('id, name, slug, address, phone, is_active, created_at')
    .eq('business_id', business.id)
    .order('name')

  // Seed check: ensure Escudería Centro exists (11111111-1111-1111-1111-111111111111)
  // This keeps single-sede default without breaking existing installs.
  // Uses service client to bypass RLS if needed, idempotent.
  const ESCUDERIA_DEFAULT_ID = '11111111-1111-1111-1111-111111111111'
  const hasCentro = (locations ?? []).some(
    (l) => l.id === ESCUDERIA_DEFAULT_ID || l.slug === 'centro'
  )
  if (!hasCentro && business.slug === 'escuderia') {
    try {
      const svc = createServiceClient()
      // Try to fetch business address/phone for seeding
      const { data: bizFull } = await svc
        .from('businesses')
        .select('address, phone')
        .eq('id', business.id)
        .maybeSingle()
      const addr = (bizFull as { address?: string | null } | null)?.address ?? null
      const phone = (bizFull as { phone?: string | null } | null)?.phone ?? null

      // Attempt to insert default location; on conflict (slug unique) it will be ignored
      const { error: insErr } = await svc.from('locations').insert({
        id: ESCUDERIA_DEFAULT_ID,
        business_id: business.id,
        name: 'Escudería Centro',
        slug: 'centro',
        address: addr,
        phone: phone,
        is_active: true,
      } as unknown as never)
      // If insert failed due to existing slug but different id, just refetch
      if (insErr) {
        // Check if error is not duplicate key on primary but slug conflict — still ok to ignore
        const msg = String(insErr.message ?? '')
        if (!msg.includes('duplicate') && !msg.includes('unique')) {
          // For other errors, try without explicit id (let DB generate)
          await svc
            .from('locations')
            .insert({
              business_id: business.id,
              name: 'Escudería Centro',
              slug: 'centro',
              address: addr,
              phone: phone,
              is_active: true,
            } as unknown as never)
        }
      }
      // Re-fetch after seed
      const { data: after } = await supabase
        .from('locations')
        .select('id, name, slug, address, phone, is_active, created_at')
        .eq('business_id', business.id)
        .order('name')
      if (after) locations = after
    } catch {
      // Seed failure is non-fatal; page still renders with whatever locations exist
    }
  }

  return (
    <>
      <Header title="Sucursales" />
      <main className="p-4 md:p-6">
        <SucursalesClient
          locations={
            (locations as unknown as
              | { id: string; name: string; slug: string; address?: string | null; phone?: string | null; is_active: boolean; created_at?: string }[]
              | null) ?? []
          }
        />
      </main>
    </>
  )
}
