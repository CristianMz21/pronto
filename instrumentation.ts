/**
 * Instrumentation hook — runs once when Next.js server starts.
 * Translates Docker bridge URLs when running without host network.
 * When IS_DOCKER=true (set in docker-compose.yml), 127.0.0.1 / localhost must become
 * host.docker.internal to reach host's Supabase. Cloud URLs are unaffected.
 */
export async function register() {
  try {
    const isDocker = process.env.IS_DOCKER === 'true'
    if (!isDocker) return

    const translate = (url: string): string => {
      if (!url) return url
      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        return url
          .replace(/127\.0\.0\.1/g, 'host.docker.internal')
          .replace(/localhost/g, 'host.docker.internal')
      }
      return url
    }

    const beforeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const afterUrl = translate(beforeUrl ?? '')
    if (beforeUrl && afterUrl !== beforeUrl) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = afterUrl
      // console.log(`[instrumentation] Translated NEXT_PUBLIC_SUPABASE_URL for Docker bridge: ${beforeUrl} → ${afterUrl}`)
    }

    const beforeDb = process.env.DATABASE_URL
    const afterDb = translate(beforeDb ?? '')
    if (beforeDb && afterDb !== beforeDb) {
      process.env.DATABASE_URL = afterDb
      // console.log(`[instrumentation] Translated DATABASE_URL for Docker bridge: ${beforeDb} → ${afterDb}`)
    }

    const beforeApp = process.env.NEXT_PUBLIC_APP_URL
    const afterApp = translate(beforeApp ?? '')
    if (beforeApp && afterApp !== beforeApp) {
      process.env.NEXT_PUBLIC_APP_URL = afterApp
      // console.log(`[instrumentation] Translated NEXT_PUBLIC_APP_URL for Docker bridge: ${beforeApp} → ${afterApp}`)
    }
  } catch (_e) {
    // console.error('[instrumentation] translate failed', e)
  }
}
