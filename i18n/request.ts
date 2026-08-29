import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

const SUPPORTED = ['en', 'es', 'it', 'pt'] as const
type Locale = (typeof SUPPORTED)[number]

export default getRequestConfig(async () => {
  const raw = (await cookies()).get('dashboard_locale')?.value ?? 'en'
  const locale: Locale = (SUPPORTED as readonly string[]).includes(raw) ? (raw as Locale) : 'en'
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
