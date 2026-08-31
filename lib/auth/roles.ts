/**
 * Single source of truth for RBAC — canonical roles, permission matrix, helpers.
 * Proxy, layout and sidebar all consume this module; no duplication allowed.
 */

import { isRecord } from '@/lib/supabase/typed'
import type { TypedSupabaseClient } from '@/lib/supabase/typed'

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

export function isSuperAdmin(
  user:
    | { email?: string | null; user_metadata?: Record<string, unknown> | null }
    | null
    | undefined,
): boolean {
  if (!user) return false
  const meta: unknown = user.user_metadata
  if (isRecord(meta)) {
    const rawRole: unknown = meta['role']
    if (typeof rawRole === 'string' && rawRole.toLowerCase() === 'super_admin') return true
  }
  const superAdminsEnv: string = process.env.SUPER_ADMINS ?? ''
  const superAdmins: string[] = superAdminsEnv
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean)
  const email: string | null | undefined = user.email
  if (typeof email === 'string' && superAdmins.includes(email.toLowerCase())) return true
  return false
}

/**
 * Fail-closed: unknown role or unknown route for barbero → DENY.
 * Prefix matching: /caja matches /caja, /caja/reports, /caja/123.
 * Public routes (/ , /book/* , /client/*) are not dashboard RBAC — return true to keep proxy pass-through.
 */
export function canAccessRoute(
  role: CanonicalRole | string | null | undefined,
  pathname: string,
): boolean {
  if (!role) return false

  // Public /book and /client are outside dashboard RBAC
  if (pathname === '/' || pathname.startsWith('/book') || pathname.startsWith('/client')) {
    return true
  }

  if (role === 'barbero') {
    // Only explicitly allowed prefixes for barbero
    return BARBERO_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }

  if (role === 'staff') {
    // Receptionist: no reportes, no settings, no sucursales/membresias/promociones
    if (
      pathname.startsWith('/reportes') ||
      pathname.startsWith('/sucursales') ||
      pathname.startsWith('/membresias') ||
      pathname.startsWith('/promociones') ||
      pathname.startsWith('/settings')
    )
      return false
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
  const v: string = raw.toLowerCase().trim()
  if (v === 'owner') return 'owner'
  if (v === 'admin' || v === 'manager') return 'admin'
  if (v === 'staff' || v === 'employee' || v === 'receptionist') return 'staff'
  if (v === 'barbero' || v === 'barber') return 'barbero'
  return null
}

// ── Typed helpers for Supabase rows ───────────────────────────────────────────

interface BusinessOwnerRow {
  id: string
}

interface EmployeeRoleRow {
  role: string
}

interface LocationIdRow {
  id: string
}

/**
 * Resolve canonical role for a user in a business context.
 * Precedence: owner (businesses.owner_id) > active employees row (user_id + is_active) > null.
 * When businessId is omitted, first owned business wins, then first active employee row.
 */
export async function getUserRole(
  supabase: TypedSupabaseClient,
  userId: string,
  businessId?: string | null,
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
      const typedOwned: BusinessOwnerRow | null = owned as BusinessOwnerRow | null
      if (typedOwned) return 'owner'
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
      const typedOwnedAny: BusinessOwnerRow | null = ownedAny as BusinessOwnerRow | null
      if (typedOwnedAny) return 'owner'
    } catch {
      // fall through
    }
  }

  // 2) Employee check
  try {
    let query = supabase
      .from('employees')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)
    if (businessId) {
      query = query.eq('business_id', businessId)
    }
    const { data: emp } = await query.limit(1).maybeSingle()
    const typedEmp: EmployeeRoleRow | null = emp as EmployeeRoleRow | null
    if (!typedEmp) return null
    const rawRole: unknown = typedEmp.role
    const roleString: string | null = typeof rawRole === 'string' ? rawRole : null
    const normalized: CanonicalRole | null = normalizeRole(roleString)
    return normalized
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
  supabase: TypedSupabaseClient,
  userId: string,
  businessId: string,
): Promise<string[] | null> {
  if (!userId || !businessId) return null
  try {
    void (await getUserRole(supabase, userId, businessId))
    // V1: owner/admin/staff/barbero all get full list (no per-location restriction)
    const { data } = await supabase
      .from('locations')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)

    const typedData: LocationIdRow[] | null = data as LocationIdRow[] | null
    if (!typedData || typedData.length === 0) return null
    return typedData.map((r: LocationIdRow) => r.id)
  } catch {
    return null
  }
}
