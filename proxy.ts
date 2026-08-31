import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import { getAdminSecretPath, isAdminSecretPath, stripAdminSecretPrefix } from '@/lib/admin-secret'
import { canAccessRoute, getUserLocationIds, getUserRole, isSuperAdmin } from '@/lib/auth/roles'
import type { Database } from '@/lib/supabase/database.types'
import { isRecord } from '@/lib/supabase/typed'
import type { TypedSupabaseClient } from '@/lib/supabase/typed'

function getSupabaseUrlForProxy(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (
    process.env.IS_DOCKER === 'true' &&
    (url.includes('127.0.0.1') || url.includes('localhost'))
  ) {
    return url
      .replace(/127\.0\.0\.1/g, 'host.docker.internal')
      .replace(/localhost/g, 'host.docker.internal')
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

// ── Secret rewrite helpers ─────────────────────────────────────────────────

type SecretRewrite = {
  isSelfhosted: boolean
  adminSecret: string
  isSecret: boolean
  internalPath: string
}

function resolveSecretRewrite(pathname: string): SecretRewrite {
  const isSelfhosted = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
  const adminSecret = getAdminSecretPath()
  const isSecret = isSelfhosted && isAdminSecretPath(pathname, adminSecret)
  const internalPath = isSecret ? stripAdminSecretPrefix(pathname, adminSecret) : pathname
  return { isSelfhosted, adminSecret, isSecret, internalPath }
}

function handleSaaSSubdomainRewrite(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas') return null
  if (pathname !== '/book') return null
  const hostname = request.headers.get('host') ?? ''
  const match = hostname.match(/^([a-z0-9-]+)\.trypronto\.app/)
  const tenantSlug = match?.[1]
  if (tenantSlug && tenantSlug !== 'www') {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/book/${tenantSlug}`
    return NextResponse.rewrite(rewriteUrl)
  }
  return null
}

function validateLocationFormat(locationId: string): NextResponse | null {
  if (!locationId) return null
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(locationId)) {
    return NextResponse.json(
      { error: 'invalid_location', message: 'location must be a valid UUID' },
      { status: 400 },
    )
  }
  return null
}

async function validateLocationAccess(
  supabase: TypedSupabaseClient,
  locationId: string,
  user: { id: string } | null,
): Promise<NextResponse | null> {
  if (!locationId) return null
  if (!user) return null
  try {
    let businessId: string | null = null
    const { data: owned } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (isRecord(owned) && typeof owned['id'] === 'string') {
      businessId = owned['id']
    } else {
      const { data: emp } = await supabase
        .from('employees')
        .select('business_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (isRecord(emp) && typeof emp['business_id'] === 'string') {
        businessId = emp['business_id']
      }
    }
    if (!businessId) return null
    const allowed = await getUserLocationIds(supabase, user.id, businessId)
    if (allowed !== null && allowed.length > 0 && !allowed.includes(locationId)) {
      return NextResponse.json(
        { error: 'forbidden_location', message: 'Location not allowed for this user' },
        { status: 403 },
      )
    }
    if (allowed === null) {
      const { data: loc } = await supabase
        .from('locations')
        .select('id')
        .eq('id', locationId)
        .eq('business_id', businessId)
        .maybeSingle()
      if (!isRecord(loc) || typeof loc['id'] !== 'string') {
        return NextResponse.json(
          { error: 'forbidden_location', message: 'Location not found in this business' },
          { status: 403 },
        )
      }
    }
  } catch {
    // fail open – log but do not block on DB errors
  }
  return null
}

function handleAdminInvisibility(
  pathname: string,
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null,
  supabaseResponse: NextResponse,
): Response | null {
  if (!pathname.startsWith('/admin')) return null
  const isAdminLogin = pathname === '/admin/login'
  if (!isAdminLogin) {
    const superCheck = isSuperAdmin(
      user as unknown as { email?: string | null; user_metadata?: Record<string, unknown> | null },
    )
    if (!user || !superCheck) {
      return new Response('Not Found', { status: 404 })
    }
  }
  supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  return null
}

function handleRegisterRedirect(
  request: NextRequest,
  secretCtx: SecretRewrite,
): NextResponse | null {
  const effectiveRegisterPath = secretCtx.isSecret
    ? secretCtx.internalPath
    : request.nextUrl.pathname
  if (effectiveRegisterPath !== '/register') return null
  if (process.env.ALLOW_PUBLIC_REGISTER !== 'false') return null
  if (secretCtx.isSecret) {
    const applyUrl = request.nextUrl.clone()
    applyUrl.pathname = `${secretCtx.adminSecret}/apply`
    return NextResponse.redirect(applyUrl)
  }
  const applyUrl = request.nextUrl.clone()
  applyUrl.pathname = '/apply'
  return NextResponse.redirect(applyUrl)
}

async function attachUserContext(
  supabase: TypedSupabaseClient,
  requestHeaders: Headers,
  supabaseResponse: NextResponse,
  user: { id: string; email?: string | null } | null,
  secretCtx: SecretRewrite,
): Promise<{ resolvedRole: string | null; supabaseResponse: NextResponse }> {
  requestHeaders.set('x-user-id', user?.id ?? '')
  requestHeaders.set('x-user-email', user?.email ?? '')
  let resolvedRole: string | null = null
  if (user) {
    try {
      resolvedRole = await getUserRole(supabase, user.id)
    } catch {
      resolvedRole = null
    }
  }
  requestHeaders.set('x-user-role', resolvedRole ?? '')
  const cookiesSoFar = supabaseResponse.cookies.getAll()
  let nextResponse = NextResponse.next({ request: { headers: requestHeaders } })
  cookiesSoFar.forEach((c) => nextResponse.cookies.set(c))
  if (secretCtx.isSecret) {
    requestHeaders.set('x-pathname', secretCtx.internalPath)
    const updated = NextResponse.next({ request: { headers: requestHeaders } })
    nextResponse.cookies.getAll().forEach((c) => updated.cookies.set(c))
    nextResponse = updated
  }
  return { resolvedRole, supabaseResponse: nextResponse }
}

// ── Secret panel helpers ───────────────────────────────────────────────────

const SECRET_AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'] as const
const SECRET_PROTECTED_PREFIXES = [
  '/dashboard',
  '/pos',
  '/caja',
  '/crm',
  '/inventory',
  '/booking',
  '/settings',
  '/barberos',
  '/servicios',
  '/reportes',
  '/sucursales',
  '/membresias',
  '/promociones',
  '/onboarding',
] as const

function handleSecretAuth(
  request: NextRequest,
  secretCtx: SecretRewrite,
  user: { id: string } | null,
  resolvedRole: string | null,
  requestHeaders: Headers,
  supabaseResponse: NextResponse,
): NextResponse | Response | null {
  const internalPath = secretCtx.internalPath
  const isSecretAuth = SECRET_AUTH_PATHS.some(
    (p) => internalPath === p || internalPath.startsWith(`${p}/`),
  )
  if (!isSecretAuth) return null
  if (user) {
    if (resolvedRole) {
      const dashUrl = request.nextUrl.clone()
      dashUrl.pathname = `${secretCtx.adminSecret}/dashboard`
      dashUrl.search = ''
      return NextResponse.redirect(dashUrl)
    }
    return new Response('Not Found', { status: 404 })
  }
  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = internalPath
  const res = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
  supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  return res
}

function handleSecretProtected(
  request: NextRequest,
  secretCtx: SecretRewrite,
  user: { id: string } | null,
  resolvedRole: string | null,
  requestHeaders: Headers,
  supabaseResponse: NextResponse,
): NextResponse | Response | null {
  const internalPath = secretCtx.internalPath
  const isProtected = SECRET_PROTECTED_PREFIXES.some(
    (p) => internalPath === p || internalPath.startsWith(`${p}/`),
  )
  const effectiveIsProtected = isProtected || internalPath === '/dashboard'
  if (!effectiveIsProtected) return null
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = `${secretCtx.adminSecret}/login`
    loginUrl.searchParams.set('redirectTo', internalPath)
    return NextResponse.redirect(loginUrl)
  }
  if (!resolvedRole) {
    return new Response('Not Found', { status: 404 })
  }
  if (!canAccessRoute(resolvedRole, internalPath)) {
    return new Response('Not Found', { status: 404 })
  }
  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = internalPath
  const res = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
  supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  return res
}

function handleSecretFallback(
  request: NextRequest,
  secretCtx: SecretRewrite,
  requestHeaders: Headers,
  supabaseResponse: NextResponse,
): NextResponse {
  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = secretCtx.internalPath
  const res = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
  supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  return res
}

function handleSecretPanel(
  request: NextRequest,
  secretCtx: SecretRewrite,
  user: { id: string } | null,
  resolvedRole: string | null,
  requestHeaders: Headers,
  supabaseResponse: NextResponse,
): NextResponse | Response | null {
  if (!secretCtx.isSecret) return null
  supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  const authRes = handleSecretAuth(
    request,
    secretCtx,
    user,
    resolvedRole,
    requestHeaders,
    supabaseResponse,
  )
  if (authRes) return authRes
  const protectedRes = handleSecretProtected(
    request,
    secretCtx,
    user,
    resolvedRole,
    requestHeaders,
    supabaseResponse,
  )
  if (protectedRes) return protectedRes
  return handleSecretFallback(request, secretCtx, requestHeaders, supabaseResponse)
}

// ── Selfhosted stealth helpers ─────────────────────────────────────────────

const LEGACY_ADMIN_PREFIXES = [
  '/dashboard',
  '/pos',
  '/caja',
  '/crm',
  '/inventory',
  '/booking',
  '/settings',
  '/barberos',
  '/servicios',
  '/reportes',
  '/sucursales',
  '/membresias',
  '/promociones',
  '/login',
  '/register',
  '/onboarding',
] as const

const SELFHOSTED_PROTECTED = [
  '/dashboard',
  '/pos',
  '/caja',
  '/crm',
  '/inventory',
  '/booking',
  '/settings',
  '/barberos',
  '/servicios',
  '/reportes',
  '/sucursales',
  '/membresias',
  '/promociones',
] as const

function handleSelfhostedLegacy(
  request: NextRequest,
  pathname: string,
  secretCtx: SecretRewrite,
  user: { id: string } | null,
  resolvedRole: string | null,
): NextResponse | Response | null {
  const isLegacyAdmin = LEGACY_ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  if (!isLegacyAdmin) return null
  if (user && resolvedRole) {
    const secretUrl = request.nextUrl.clone()
    secretUrl.pathname = `${secretCtx.adminSecret}${pathname}`
    secretUrl.search = request.nextUrl.search
    return NextResponse.redirect(secretUrl)
  }
  return new Response('Not Found', { status: 404 })
}

function handleSelfhostedRoot(
  request: NextRequest,
  pathname: string,
  secretCtx: SecretRewrite,
  user: { id: string } | null,
  resolvedRole: string | null,
): NextResponse | null {
  if (pathname !== '/') return null
  if (user && resolvedRole) {
    const secretUrl = request.nextUrl.clone()
    secretUrl.pathname = secretCtx.adminSecret
    return NextResponse.redirect(secretUrl)
  }
  return null
}

function handleSelfhostedProtected(
  pathname: string,
  user: { id: string } | null,
  resolvedRole: string | null,
): Response | null {
  const isProtected = SELFHOSTED_PROTECTED.some((p) => pathname.startsWith(p))
  if (!isProtected) return null
  if (!user) {
    return new Response('Not Found', { status: 404 })
  }
  if (user && resolvedRole && !canAccessRoute(resolvedRole, pathname)) {
    return new Response('Not Found', { status: 404 })
  }
  return null
}

function handleSelfhostedStealth(
  request: NextRequest,
  pathname: string,
  secretCtx: SecretRewrite,
  user: { id: string } | null,
  resolvedRole: string | null,
): NextResponse | Response | null {
  const legacyRes = handleSelfhostedLegacy(request, pathname, secretCtx, user, resolvedRole)
  if (legacyRes) return legacyRes
  const rootRes = handleSelfhostedRoot(request, pathname, secretCtx, user, resolvedRole)
  if (rootRes) return rootRes
  return handleSelfhostedProtected(pathname, user, resolvedRole)
}

// ── SaaS helpers ───────────────────────────────────────────────────────────

const SAAS_PROTECTED = [
  '/dashboard',
  '/pos',
  '/caja',
  '/crm',
  '/inventory',
  '/booking',
  '/settings',
  '/barberos',
  '/servicios',
  '/reportes',
  '/sucursales',
  '/membresias',
  '/promociones',
] as const

function handleSaaSPublic(
  request: NextRequest,
  pathname: string,
  user: { id: string } | null,
  resolvedRole: string | null,
): NextResponse | Response | null {
  if (user && pathname === '/') {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }
  const isProtected = SAAS_PROTECTED.some((p) => pathname.startsWith(p))
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }
  if (user && resolvedRole && isProtected && !canAccessRoute(resolvedRole, pathname)) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }
  if (user && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }
  return null
}

function handleClientPortal(
  request: NextRequest,
  pathname: string,
  user: { id: string } | null,
): NextResponse | null {
  if (pathname.startsWith('/client/dashboard') && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/client/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }
  return null
}

function applyCommonSecurityHeaders(
  pathname: string,
  secretCtx: SecretRewrite,
  supabaseResponse: NextResponse,
): void {
  if (pathname.startsWith('/admin')) {
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }
  if (secretCtx.isSecret) {
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }
}

function applyLocaleCookie(request: NextRequest, supabaseResponse: NextResponse): void {
  if (request.cookies.get('dashboard_locale')?.value) return
  const acceptLang = request.headers.get('accept-language') ?? ''
  const lang = acceptLang.toLowerCase()
  const detected = lang.startsWith('pt')
    ? 'pt'
    : lang.startsWith('es')
      ? 'es'
      : lang.startsWith('it')
        ? 'it'
        : null
  if (!detected) return
  supabaseResponse.cookies.set('dashboard_locale', detected, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}

// ── Main proxy ─────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest): Promise<NextResponse | Response> {
  const { pathname, searchParams } = request.nextUrl
  const secretCtx = resolveSecretRewrite(pathname)

  const subdomainRewrite = handleSaaSSubdomainRewrite(request)
  if (subdomainRewrite) return subdomainRewrite

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', secretCtx.isSecret ? secretCtx.internalPath : pathname)

  const locationId = searchParams.get('location') ?? request.headers.get('x-location-id') ?? ''
  const formatError = validateLocationFormat(locationId)
  if (formatError) return formatError
  if (locationId) {
    requestHeaders.set('x-location-id', locationId)
  }

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient<Database>(
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
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const code = searchParams.get('code')
  if (code && pathname === '/') {
    const callbackUrl = request.nextUrl.clone()
    callbackUrl.pathname = '/auth/callback'
    return NextResponse.redirect(callbackUrl)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const typedUser = user as unknown as { id: string; email?: string | null } | null

  const locationAccessError = await validateLocationAccess(supabase, locationId, typedUser)
  if (locationAccessError) return locationAccessError

  const adminBlocked = handleAdminInvisibility(
    pathname,
    user as unknown as {
      email?: string | null
      user_metadata?: Record<string, unknown> | null
    } | null,
    supabaseResponse,
  )
  if (adminBlocked) return adminBlocked

  const registerRedirect = handleRegisterRedirect(request, secretCtx)
  if (registerRedirect) return registerRedirect

  const attached = await attachUserContext(
    supabase,
    requestHeaders,
    supabaseResponse,
    typedUser,
    secretCtx,
  )
  const resolvedRole = attached.resolvedRole
  supabaseResponse = attached.supabaseResponse

  const secretRes = handleSecretPanel(
    request,
    secretCtx,
    typedUser,
    resolvedRole,
    requestHeaders,
    supabaseResponse,
  )
  if (secretRes) return secretRes

  if (secretCtx.isSelfhosted) {
    const stealthRes = handleSelfhostedStealth(
      request,
      pathname,
      secretCtx,
      typedUser,
      resolvedRole,
    )
    if (stealthRes) return stealthRes
  } else {
    const saasRes = handleSaaSPublic(request, pathname, typedUser, resolvedRole)
    if (saasRes) return saasRes
  }

  const clientRes = handleClientPortal(request, pathname, typedUser)
  if (clientRes) return clientRes

  applyCommonSecurityHeaders(pathname, secretCtx, supabaseResponse)
  applyLocaleCookie(request, supabaseResponse)

  return supabaseResponse
}

// Next.js 16: proxy.ts must have default export (middleware.ts used named `middleware`)
// Keep both for backwards compat — `proxy` named for manual import, default for Next's loader.
export default proxy

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
