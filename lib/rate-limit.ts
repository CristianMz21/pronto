/**
 * lib/rate-limit.ts
 * Lightweight in-memory rate limiter using a Map + sliding window.
 *
 * NOTE: Works per-process. On multi-instance deployments (many Node workers)
 * each process has its own counter — actual limit is N × workers.
 * For single-server Docker deployments this is fine.
 * // PROD: replace with Redis/Upstash if scaling beyond 1 replica
 *
 * Usage:
 *   const allowed = rateLimit(ip, { limit: 10, windowMs: 60 * 60 * 1000 })
 *   if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
 */

// PROD: replace with Redis/Upstash if scaling beyond 1 replica

const store = new Map<string, number[]>()

// Clean up stale entries every 10 minutes to avoid memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(
    () => {
      const now = Date.now()
      Array.from(store.entries()).forEach(([key, timestamps]) => {
        if (timestamps.every((t) => now - t > 60 * 60 * 1000)) {
          store.delete(key)
        }
      })
    },
    10 * 60 * 1000,
  )
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): boolean {
  const now = Date.now()
  const windowStart = now - windowMs
  const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= limit) return false

  timestamps.push(now)
  store.set(key, timestamps)
  return true
}

/** Extract IP from Next.js request headers (works behind proxies) */
export function getIp(req: Request): string {
  const forwarded = req instanceof Request ? req.headers.get('x-forwarded-for') : null
  return (forwarded?.split(',')[0] ?? '').trim() || 'unknown'
}
