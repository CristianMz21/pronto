import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Pronto — Business Management for Service SMBs',
  description:
    'Self-hosted POS, CRM, Inventory & Omnichannel Notifications. Your data, your server. Zero commission. One command install.',
  keywords: [
    'open source POS',
    'self-hosted CRM',
    'appointment booking',
    'Telegram notifications',
    'salon management software',
    'small business management',
  ],
  // PWA
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pronto',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    images: [{ url: 'https://trypronto.app/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['https://trypronto.app/og-image.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    // suppressHydrationWarning is required here:
    // - <html lang> is set from next-intl's getLocale() on the server, but browser extensions
    //   (e.g. translators) may mutate <html> attributes before React hydrates, causing a mismatch.
    // - next-intl docs explicitly recommend suppressHydrationWarning on <html> for this reason.
    // - <body> may also be mutated by theme/dark-mode scripts before hydration.
    // All other suppressHydrationWarning usages were removed in favor of hydration-safe rendering
    // (useState+useEffect with deterministic fallback or explicit 'en-US'/'es-CO' locale).
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
