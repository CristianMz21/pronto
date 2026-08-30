export interface LocationRow {
  id: string
  business_id: string
  name: string
  slug: string
  address?: string | null
  phone?: string | null
  is_active: boolean
}

export function formatLocationSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getLocationOrDefault(
  locations: LocationRow[],
  slugOrId: string | null | undefined,
  fallbackId?: string | null,
): LocationRow | null {
  if (!locations || locations.length === 0) return null
  if (!slugOrId) {
    if (fallbackId) {
      const byFallback = locations.find((l) => l.id === fallbackId)
      if (byFallback) return byFallback
    }
    return locations.find((l) => l.is_active) ?? locations[0] ?? null
  }
  const byId = locations.find((l) => l.id === slugOrId)
  if (byId) return byId
  const bySlug = locations.find((l) => l.slug === slugOrId)
  if (bySlug) return bySlug
  return locations.find((l) => l.is_active) ?? locations[0] ?? null
}

export function assertLocationAccess(
  userLocationIds: string[] | null | undefined,
  locationId: string | null | undefined,
): { ok: true } | { ok: false; reason: 'forbidden' } {
  if (!locationId) return { ok: true }
  if (!userLocationIds || userLocationIds.length === 0) return { ok: true }
  if (userLocationIds.includes(locationId)) return { ok: true }
  return { ok: false, reason: 'forbidden' }
}

/**
 * Parses a `?location=` query param into a validated location id.
 * Returns null if missing/empty, otherwise the trimmed string.
 * Caller should verify existence via getLocationOrDefault or DB check.
 */

/**
 * Filters a list of rows that have `location_id` nullable by a selected location.
 * Single-sede: when selectedLocation is null, returns all (no filter) — this keeps
 * existing installs with location_id=null rows visible.
 * Multi-sede: when selected, filters to matching location_id.
 * Use this for client-side filtering; server queries should use eq(location_id) similarly.
 */

/**
 * Returns true if a row's location matches the filter or if filter is null (show all).
 * Useful for inline server query guards where we build Supabase queries conditionally.
 */
