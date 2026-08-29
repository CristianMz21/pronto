import { describe, it, expect, vi } from 'vitest'

import {
  canAccessRoute,
  isBarbero,
  isPrivileged,
  getUserRole,
  ROLE_PERMISSIONS,
  type CanonicalRole,
} from '@/lib/auth/roles'

describe('roles — barbero reducido', () => {
  it('ROLE_PERMISSIONS matrix defines barbero denies for caja/inventory/settings/crm', () => {
    expect(ROLE_PERMISSIONS.barbero['/caja']).toBe(false)
    expect(ROLE_PERMISSIONS.barbero['/inventory']).toBe(false)
    expect(ROLE_PERMISSIONS.barbero['/settings']).toBe(false)
    expect(ROLE_PERMISSIONS.barbero['/crm']).toBe(false)
    expect(ROLE_PERMISSIONS.barbero['/dashboard']).toBe(true)
    expect(ROLE_PERMISSIONS.barbero['/booking']).toBe(true)
    expect(ROLE_PERMISSIONS.barbero['/pos']).toBe(true)
  })

  it('canAccessRoute allow for barbero on /booking, /pos, /dashboard', () => {
    expect(canAccessRoute('barbero', '/booking')).toBe(true)
    expect(canAccessRoute('barbero', '/pos')).toBe(true)
    expect(canAccessRoute('barbero', '/dashboard')).toBe(true)
    expect(canAccessRoute('barbero', '/booking/')).toBe(true)
    expect(canAccessRoute('barbero', '/pos/history')).toBe(true)
  })

  it('canAccessRoute deny for barbero on caja/inventory/settings/crm + prefix', () => {
    expect(canAccessRoute('barbero', '/caja')).toBe(false)
    expect(canAccessRoute('barbero', '/caja/reports')).toBe(false)
    expect(canAccessRoute('barbero', '/inventory')).toBe(false)
    expect(canAccessRoute('barbero', '/inventory/movements/123')).toBe(false)
    expect(canAccessRoute('barbero', '/settings')).toBe(false)
    expect(canAccessRoute('barbero', '/settings/members')).toBe(false)
    expect(canAccessRoute('barbero', '/crm')).toBe(false)
    expect(canAccessRoute('barbero', '/crm/segments')).toBe(false)
  })

  it('unknown route defaults to DENY for barbero, ALLOW for privileged', () => {
    expect(canAccessRoute('barbero', '/reports')).toBe(false)
    expect(canAccessRoute('barbero', '/unknown')).toBe(false)
    expect(canAccessRoute('owner', '/reports')).toBe(true)
    expect(canAccessRoute('admin', '/reports')).toBe(true)
    expect(canAccessRoute('staff', '/reports')).toBe(true)
  })

  it('null/undefined role denies everything', () => {
    expect(canAccessRoute(null as unknown as CanonicalRole, '/dashboard')).toBe(false)
    expect(canAccessRoute(undefined as unknown as CanonicalRole, '/booking')).toBe(false)
    expect(canAccessRoute('barbero' as CanonicalRole, '/book/escuderia')).toBe(true) // public bypass still true even for barbero
  })

  it('owner always allowed', () => {
    expect(canAccessRoute('owner', '/settings/members')).toBe(true)
    expect(canAccessRoute('owner', '/caja')).toBe(true)
    expect(canAccessRoute('owner', '/inventory')).toBe(true)
  })

  it('isBarbero / isPrivileged helpers', () => {
    expect(isBarbero('barbero')).toBe(true)
    expect(isBarbero('staff')).toBe(false)
    expect(isBarbero(null as any)).toBe(false)
    expect(isPrivileged('owner')).toBe(true)
    expect(isPrivileged('admin')).toBe(true)
    expect(isPrivileged('staff')).toBe(false)
    expect(isPrivileged('barbero')).toBe(false)
  })

  describe('getUserRole', () => {
    function mockSupabase(overrides: {
      businessesOwner?: any
      businessesOwnerAny?: any
      employees?: any
    }) {
      return {
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            const isOwnerQuery = {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi
                .fn()
                .mockResolvedValue({
                  data: overrides.businessesOwnerAny ?? overrides.businessesOwner,
                }),
            }
            // For businessId-scoped query, we need eq().eq().maybeSingle chain
            // Simplify: if businessId provided, businessesOwner is used
            // We'll return a chain that resolves to businessesOwner if called with .eq('id')
            return isOwnerQuery as any
          }
          if (table === 'employees') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: overrides.employees }),
            } as any
          }
          return { select: vi.fn().mockReturnThis() } as any
        }),
      } as any
    }

    it('returns owner when businesses.owner_id matches', async () => {
      const supabase = mockSupabase({ businessesOwnerAny: { id: 'b1' } })
      const role = await getUserRole(supabase, 'uid-owner')
      expect(role).toBe('owner')
    })

    it('returns barbero from employees when not owner', async () => {
      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            } as any
          }
          if (table === 'employees') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'barbero' } }),
            } as any
          }
          return {} as any
        }),
      } as any
      const role = await getUserRole(supabase as any, 'uid-barber')
      expect(role).toBe('barbero')
    })

    it('null when inactive employee (no row)', async () => {
      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            } as any
          }
          if (table === 'employees') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            } as any
          }
          return {} as any
        }),
      } as any
      const role = await getUserRole(supabase as any, 'uid-inactive')
      expect(role).toBeNull()
    })

    it('owner precedence over employee row', async () => {
      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'businesses') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'b1' } }),
            } as any
          }
          return { select: vi.fn().mockReturnThis() } as any
        }),
      } as any
      const role = await getUserRole(supabase as any, 'uid-both')
      expect(role).toBe('owner')
    })

    it('normalizes legacy employee -> staff and barber -> barbero', async () => {
      const mk = (roleRaw: string, expected: CanonicalRole) => async () => {
        const supabase = {
          from: vi.fn((table: string) => {
            if (table === 'businesses') {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              } as any
            }
            if (table === 'employees') {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: { role: roleRaw } }),
              } as any
            }
            return {} as any
          }),
        } as any
        const r = await getUserRole(supabase as any, 'uid')
        expect(r).toBe(expected)
      }
      await mk('employee', 'staff')()
      await mk('barber', 'barbero')()
      await mk('manager', 'admin')()
    })
  })
})
