import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessRoute, getUserRole, isSuperAdmin } from '@/lib/auth/roles'

function getSupabaseUrlForProxy(): string {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (process.env.IS_DOCKER === 'true' && (url.includes('127.0.0.1') || url.includes('localhost'))) {
    return url.replace(/127\.0\.0\.1/g, 'host.docker.internal').replace(/localhost/g, 'host.docker.internal')
  }
  return url
}

function getCookieName(): string {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const hostname = new URL(url).hostname
    return `sb-${hostname.split('.')[0]}-auth-token`
  } catch {
    return 'sb-127-auth-token'
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // SaaS subdomain routing: rewrite openyoga.trypronto.app/book → /book/openyoga
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'saas' && pathname === '/book') {
    const hostname = request.headers.get('host') ?? ''
    const match = hostname.match(/^([a-z0-9-]+)\.trypronto\.app/)
    const tenantSlug = match?.[1]
    if (tenantSlug && tenantSlug !== 'www') {
      const rewriteUrl = request.nextUrl.clone()
      rewriteUrl.pathname = `/book/${tenantSlug}`
      return NextResponse.rewrite(rewriteUrl)
    }
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  // Multi-sede V1: propagate location filter via header for server components (nullable, single-sede default = no filter)
  // TODO V2: when my_location_ids() is enforced, validate x-location-id against getUserLocationIds() here and return 403 if forbidden
  const locationId = searchParams.get('location') ?? request.headers.get('x-location-id') ?? ''
  if (locationId) requestHeaders.set('x-location-id', locationId)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    getSupabaseUrlForProxy(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: getCookieName() },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Handle Supabase email confirmation code on root path
  const code = searchParams.get('code')
  if (code && pathname === '/') {
    const callbackUrl = request.nextUrl.clone()
    callbackUrl.pathname = '/auth/callback'
    return NextResponse.redirect(callbackUrl)
  }

  const { data: { user } } = await supabase.auth.getUser()

  // Admin invisibility: /admin/* is 404 unless super_admin (no redirect to reveal existence)
  if (pathname.startsWith('/admin')) {
    // Allow the login page itself without super_admin check, but still hide its existence via noindex
    const isAdminLogin = pathname === '/admin/login'
    if (!isAdminLogin) {
      if (!user || !isSuperAdmin(user as unknown as { email?: string | null; user_metadata?: Record<string, unknown> | null })) {
        return new Response('Not Found', { status: 404 })
      }
    }
    // Add noindex for all admin
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }

  // Public register closed -> redirect to /apply when ALLOW_PUBLIC_REGISTER=false
  if (pathname === '/register' && process.env.ALLOW_PUBLIC_REGISTER === 'false') {
    const applyUrl = request.nextUrl.clone()
    applyUrl.pathname = '/apply'
    return NextResponse.redirect(applyUrl)
  }

  // Forward the already-validated user to Server Components, same mechanism
  // as x-pathname, so dashboard pages don't each repeat this auth round-trip
  // (see lib/auth-user.ts). Must recreate supabaseResponse to pick up the
  // new header — NextResponse.next() snapshots requestHeaders at call time —
  // while preserving any cookies getUser() already set (e.g. a token refresh).
  requestHeaders.set('x-user-id', user?.id ?? '')
  requestHeaders.set('x-user-email', user?.email ?? '')
  let resolvedRole: string | null = null
  if (user) {
    try {
      resolvedRole = await getUserRole(supabase as unknown as { from: (t: string) => unknown }, user.id)
    } catch {
      resolvedRole = null
    }
  }
  requestHeaders.set('x-user-role', resolvedRole ?? '')
  const cookiesSoFar = supabaseResponse.cookies.getAll()
  supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
  cookiesSoFar.forEach((c) => supabaseResponse.cookies.set(c))

  // Authenticated user on root → dashboard
  if (user && pathname === '/') {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  // Protected routes — admin panel (single Escudería now, multi-sede ready via locations)
  // Public: /, /escuderia, /book/[slug], /login, /register, /privacy, /terms, /offline, /client/login, /client/register
  const protectedPaths = ['/dashboard', '/pos', '/caja', '/crm', '/inventory', '/booking', '/settings', '/barberos', '/servicios', '/reportes', '/sucursales', '/membresias', '/promociones']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // RBAC early guard: any role denied via canAccessRoute → 302 /dashboard (barbero blocked from caja/inventory/settings/crm/barberos/etc, staff blocked from reportes/settings)
  if (user && resolvedRole && isProtected && !canAccessRoute(resolvedRole as unknown as string, pathname)) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  // Client portal protected
  if (pathname.startsWith('/client/dashboard') && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/client/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  // Admin noindex
  if (pathname.startsWith('/admin')) {
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }

  // Auto-detect locale from Accept-Language on first visit (no cookie yet)
  if (!request.cookies.get('dashboard_locale')?.value) {
    const acceptLang = request.headers.get('accept-language') ?? ''
    const lang = acceptLang.toLowerCase()
    const detected = lang.startsWith('pt') ? 'pt' : lang.startsWith('es') ? 'es' : lang.startsWith('it') ? 'it' : null
    if (detected) {
      supabaseResponse.cookies.set('dashboard_locale', detected, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      })
    }
  }

  return supabaseResponse
}

// Next.js 16: proxy.ts must have default export (middleware.ts used named `middleware`)
// Keep both for backwards compat — `proxy` named for manual import, default for Next's loader.
export default proxy

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
