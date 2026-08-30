/**
 * Seed helpers for E2E — ephemeral business per test run.
 * Uses service_role via direct fetch to Supabase REST when E2E_SUPABASE=1,
 * otherwise no-op. Tests must handle both modes (mock vs real).
 */
export const TEST_SLUG_PREFIX = 'e2e-'

export function uniqueSlug(base = 'test'): string {
  return `${TEST_SLUG_PREFIX}${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Attempt to create an ephemeral business via service client.
 * Returns slug or null if not configured / fails — caller should skip gracefully.
 */
export async function tryCreateEphemeralBusiness(): Promise<string | null> {
  if (!process.env.E2E_SUPABASE) return null
  // Lazy import to avoid loading supabase when not needed
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const supabase = createServiceClient() as unknown as {
      from: (t: string) => {
        insert: (v: unknown) => {
          select: (c: string) => {
            single: () => Promise<{ data: { id: string; slug: string } | null; error: unknown }>
          }
        }
        select: (c: string) => {
          eq: (a: string, b: unknown) => { maybeSingle: () => Promise<{ data: unknown }> }
        }
      }
    }
    const slug = uniqueSlug('biz')
    const ownerId = process.env.E2E_TEST_USER_ID ?? 'b8f773b2-11e7-40d0-8f52-929b480d42b8'
    const { data, error } = await supabase
      .from('businesses')
      .insert({
        name: `E2E ${slug}`,
        slug,
        owner_id: ownerId,
        timezone: 'America/Bogota',
      } as never)
      .select('id, slug')
      .single()
    if (error || !data) return null
    return (data as { slug: string }).slug
  } catch {
    return null
  }
}

export async function cleanupBusinessBySlug(slug: string): Promise<void> {
  if (!process.env.E2E_SUPABASE) return
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const supabase = createServiceClient() as unknown as {
      from: (t: string) => {
        delete: () => { eq: (a: string, b: unknown) => Promise<unknown> }
      }
    }
    await supabase.from('businesses').delete().eq('slug', slug)
  } catch {
    // best effort
  }
}
