/**
 * Admin secret path — single source of truth for hidden panel URL.
 * Clients never see this path; only owner/admin with knowledge of it can access.
 * Configure via ADMIN_SECRET_PATH env (e.g. /x-escuderito-9f3a) — rotatable without code change.
 */

export function getAdminSecretPath(): string {
  // Client components can only read NEXT_PUBLIC_ vars; server prefers ADMIN_SECRET_PATH
  const raw = (
    process.env.ADMIN_SECRET_PATH ||
    process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH ||
    ''
  ).trim()
  if (!raw) return '/escuderito-admin'
  // Normalize: ensure leading slash, no trailing slash, no query
  let p = (raw.split('?')[0] ?? raw).split('#')[0]!.trim()
  if (!p.startsWith('/')) p = `/${p}`
  // Remove trailing slash unless it's just "/"
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export function isAdminSecretPath(pathname: string, secret?: string): boolean {
  const s = secret ?? getAdminSecretPath()
  return pathname === s || pathname.startsWith(`${s}/`)
}

export function stripAdminSecretPrefix(pathname: string, secret?: string): string {
  const s = secret ?? getAdminSecretPath()
  if (pathname === s) return '/dashboard'
  if (pathname.startsWith(`${s}/`)) {
    const rest = pathname.slice(s.length)
    return rest || '/dashboard'
  }
  return pathname
}
