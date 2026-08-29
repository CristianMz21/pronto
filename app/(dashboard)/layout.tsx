import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/sidebar'
import { getAuthUser } from '@/lib/auth-user'
import { canAccessRoute, getUserRole, type CanonicalRole } from '@/lib/auth/roles'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = await getAuthUser()

  if (!user) redirect('/login')

  // Single barbería now (Escudería), multi-sede ready: business → locations (1 default)
  // Owner check first, then employee check via my_business_ids() (RLS helper) for future barber logins
  let business: { id: string; name: string; slug: string; plan: string } | null = null

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, name, slug, plan')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (owned) {
    business = owned
  } else {
    // Fallback: user is an employee (barbero) — find their business via my_business_ids()
    const { data: empBiz } = await supabase
      .from('employees')
      .select('business_id, businesses!inner(id, name, slug, plan)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (empBiz?.businesses) {
      const b = empBiz.businesses as unknown as { id: string; name: string; slug: string; plan: string }
      business = b
    }
  }

  if (!business) redirect('/onboarding')

  // Resolve canonical role (owner > employee) and validate x-user-role header (proxy overwrites, but we verify against DB)
  const headersListForRole = await headers()
  const headerRole = headersListForRole.get('x-user-role') as CanonicalRole | null
  let role: CanonicalRole | null = null
  try {
    role = await getUserRole(supabase as unknown as { from: (t: string) => unknown }, user.id, business.id)
  } catch {
    role = null
  }
  // If header mismatches DB, trust DB (proxy is early but layout is authoritative second gate)
  const effectiveRole: CanonicalRole | null = role ?? (headerRole as CanonicalRole | null)

  // Second gate: barbero cannot access denied prefixes even if proxy was bypassed
  const pathnameForGuard = headersListForRole.get('x-pathname') ?? ''
  if (effectiveRole === 'barbero' && pathnameForGuard && !canAccessRoute(effectiveRole, pathnameForGuard)) {
    redirect('/dashboard')
  }

  // Resolve employeeId for barbero scope (used by booking/pos filters downstream via header propagation)
  let employeeId: string | null = null
  if (effectiveRole === 'barbero') {
    try {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .eq('business_id', business.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      employeeId = (emp as { id: string } | null)?.id ?? null
    } catch {
      employeeId = null
    }
  }

  // SaaS: if user is on the main domain, redirect to their subdomain preserving the path.
  // Covers /dashboard, /settings, /pos, /crm, /inventory, /booking — any app route.
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (rootDomain && business?.slug) {
    const headersList = await headers()
    const host = headersList.get('host') ?? ''
    if (host === rootDomain || host === `www.${rootDomain}`) {
      // x-pathname is set by middleware on every request
      const pathname = headersList.get('x-pathname') ?? '/dashboard'
      redirect(`https://${business.slug}.${rootDomain}${pathname}`)
    }
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-gray-50">
      <Sidebar businessName={business.name} role={effectiveRole} employeeId={employeeId} />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pt-14 md:pt-0">
        {children}
      </div>
    </div>
  )
}
