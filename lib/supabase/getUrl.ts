/**
 * Translate Supabase URLs for Docker bridge without host network.
 * When running inside Docker (IS_DOCKER=true or /.dockerenv exists),
 * 127.0.0.1 / localhost must become host.docker.internal to reach the host's Supabase.
 * Cloud URLs (db.<ref>.supabase.co) are unaffected.
 * Browser (client) should keep 127.0.0.1, so this helper is for server-side only.
 * NOTE: fs is imported lazily to avoid pulling node:fs into client bundles via isRecord re-export.
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!url) return url
  try {
    const isDocker = process.env.IS_DOCKER === 'true'
    if (isDocker && (url.includes('127.0.0.1') || url.includes('localhost'))) {
      return url
        .replace(/127\.0\.0\.1/g, 'host.docker.internal')
        .replace(/localhost/g, 'host.docker.internal')
    }
  } catch {
    // ignore
  }
  return url
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? ''
  if (!url) return url
  try {
    const isDocker = process.env.IS_DOCKER === 'true' || process.env.MIGRATE_SSL === 'false' // local dev always needs translation when MIGRATE_SSL=false
    if (isDocker && (url.includes('127.0.0.1') || url.includes('localhost'))) {
      return url
        .replace(/127\.0\.0\.1/g, 'host.docker.internal')
        .replace(/localhost/g, 'host.docker.internal')
    }
  } catch {}
  return url
}
