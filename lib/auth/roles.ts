/**
 * Single source of truth for RBAC — canonical roles, permission matrix, helpers.
 * Proxy, layout and sidebar all consume this module; no duplication allowed.
 */

export type CanonicalRole = 'owner' | 'admin' | 'staff' | 'barbero'

/**
 * Declarative role → route permissions.
 * true = ALLOW, false = DENY. Used for introspection/tests;
 * runtime prefix check lives in canAccessRoute (so /caja/* is denied without enumerating every subpath).
 */
export const ROLE_PERMISSIONS: Record<CanonicalRole, Record<string, boolean>> = {
  owner: {
    '/dashboard': true,
    '/booking': true,
    '/pos': true,
    '/caja': true,
    '/crm': true,
    '/crm-campaigns': true,
    '/inventory': true,
    '/settings': true,
    '/barberos': true,
    '/servicios': true,
    '/reportes': true,
    '/membresias': true,
    '/promociones': true,
    '/combos': true,
    '/sucursales': true,
  },
  admin: {
    '/dashboard': true,
    '/booking': true,
    '/pos': true,
    '/caja': true,
    '/crm': true,
    '/crm-campaigns': true,
    '/inventory': true,
    '/settings': true,
    '/barberos': true,
    '/servicios': true,
    '/reportes': true,
    '/membresias': true,
    '/promociones': true,
    '/combos': true,
    '/sucursales': true,
  },
  staff: {
    '/dashboard': true,
    '/booking': true,
    '/pos': true,
    '/caja': true,
    '/crm': true,
    '/crm-campaigns': true,
    '/inventory': true,
    '/settings': false,
    '/barberos': true,
    '/servicios': true,
    '/reportes': false,
    '/membresias': false,
    '/promociones': false,
    '/combos': false,
    '/sucursales': false,
  },
  barbero: {
    '/dashboard': true,
    '/booking': true,
    '/pos': true,
    '/caja': false,
    '/crm': false,
    '/inventory': false,
    '/settings': false,
    '/barberos': false,
    '/servicios': false,
    '/reportes': false,
    '/membresias': false,
    '/promociones': false,
    '/combos': false,
    '/sucursales': false,
  },
}

const BARBERO_ALLOWED_PREFIXES = ['/dashboard', '/booking', '/pos'] as const

export function isBarbero(role: CanonicalRole | string | null | undefined): boolean {
  return role === 'barbero'
}

export function isPrivileged(role: CanonicalRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function isSuperAdmin(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!user) return false
  const metaRole = (user.user_metadata as Record<string, unknown> | undefined)?.['role'] as string | undefined
  if (metaRole && metaRole.toLowerCase() === 'super_admin') return true
  const superAdmins = (process.env.SUPER_ADMINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (user.email && superAdmins.includes(user.email.toLowerCase())) return true
  return false
}

/**
 * Fail-closed: unknown role or unknown route for barbero → DENY.
 * Prefix matching: /caja matches /caja, /caja/reports, /caja/123.
 * Public routes (/ , /book/* , /client/*) are not dashboard RBAC — return true to keep proxy pass-through.
 */
export function canAccessRoute(
  role: CanonicalRole | string | null | undefined,
  pathname: string
): boolean {
  if (!role) return false

  // Public /book and /client are outside dashboard RBAC
  if (pathname === '/' || pathname.startsWith('/book') || pathname.startsWith('/client')) {
    return true
  }

  if (role === 'barbero') {
    // Only explicitly allowed prefixes for barbero
    return BARBERO_ALLOWED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    )
  }

  if (role === 'staff') {
    // Receptionist: no reportes, no settings, no sucursales/membresias/promociones
    if (
      pathname.startsWith('/reportes') ||
      pathname.startsWith('/sucursales') ||
      pathname.startsWith('/membresias') ||
      pathname.startsWith('/promociones') ||
      pathname.startsWith('/settings')
    ) return false
    return true
  }

  // owner, admin: allow all dashboard routes
  if (role === 'owner' || role === 'admin') {
    return true
  }

  // Unknown canonical value → deny
  return false
}

function normalizeRole(raw: string | null | undefined): CanonicalRole | null {
  if (!raw) return null
  const v = raw.toLowerCase().trim()
  if (v === 'owner') return 'owner'
  if (v === 'admin' || v === 'manager') return 'admin'
  if (v === 'staff' || v === 'employee' || v === 'receptionist') return 'staff'
  if (v === 'barbero' || v === 'barber') return 'barbero'
  return null
}

/**
 * Resolve canonical role for a user in a business context.
 * Precedence: owner (businesses.owner_id) > active employees row (user_id + is_active) > null.
 * When businessId is omitted, first owned business wins, then first active employee row.
 */
export async function getUserRole(
  supabase: { from: (table: string) => any },
  userId: string,
  businessId?: string | null
): Promise<CanonicalRole | null> {
  if (!userId) return null

  // 1) Owner check
  if (businessId) {
    try {
      const { data: owned } = await supabase
        .from('businesses')
        .select('id')
        .eq('id', businessId)
        .eq('owner_id', userId)
        .maybeSingle()
      if (owned) return 'owner'
    } catch {
      // fall through to employee check
    }
  } else {
    try {
      const { data: ownedAny } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle()
      if (ownedAny) return 'owner'
    } catch {
      // fall through
    }
  }

  // 2) Employee check
  try {
    let q = supabase.from('employees').select('role').eq('user_id', userId).eq('is_active', true)
    if (businessId) q = q.eq('business_id', businessId)
    q = q.limit(1).maybeSingle()
    const { data: emp } = await q
    if (!emp) return null
    const normalized = normalizeRole((emp as { role: string }).role)
    return normalized
  } catch {
    return null
  }
}

/**
 * Helper to fetch the active employee_id for a barber (used to scope booking/pos queries).
 * Returns null if not a barber or no active employee row.
 */
export async function getBarberEmployeeId(
  supabase: { from: (table: string) => any },
  userId: string,
  businessId: string
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('employees')
      .select('id, role')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!data) return null
    const normalized = normalizeRole((data as { role: string }).role)
    if (normalized !== 'barbero') return null
    return (data as { id: string }).id
  } catch {
    return null
  }
}

/**
 * V1 stub for per-user location access.
 * In V1, location scoping is by business_id only (my_business_ids()), so this returns
 * all active location ids for owner/admin and for staff/barbero as well (no restriction yet).
 *
 * TODO (V2): Replace with DB function `my_location_ids()` that returns only the
 * locations a manager is assigned to (via employees.location_id or a join table).
 * For V2, manager with single-sede restriction should only see their assigned location,
 * while owner/admin sees all. Barbero currently sees only self via employee_id but not location.
 *
 * Implementation note: returns `null` to mean "no restriction" (allow all) for callers that
 * interpret empty array as no access. For explicit allow-all we return full list.
 */
export async function getUserLocationIds(
  supabase: { from: (table: string) => unknown },
  userId: string,
  businessId: string
): Promise<string[] | null> {
  if (!userId || !businessId) return null
  try {
    const role = await getUserRole(supabase as unknown as { from: (t: string) => unknown }, userId, businessId)
    // V1: owner/admin/staff/barbero all get full list (no per-location restriction)
    // Future: if role === 'manager' (mapped to admin), check employees.location_id single vs all
    // TODO V2: SELECT id FROM locations WHERE business_id = $1 AND (role in ('owner','admin') OR id IN (SELECT my_location_ids()))
    const { data } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (a: string, b: unknown) => { eq: (c: string, d: unknown) => Promise<{ data: { id: string }[] | null }> } } }
    })
      .from('locations')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true) as unknown as Promise<{ data: { id: string }[] | null }>

    if (!data || data.length === 0) return null
    return data.map((r) => r.id)
  } catch {
    return null
  }
}
