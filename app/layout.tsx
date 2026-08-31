import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Escudero — Barbería Premium | Bogotá',
    template: '%s | Escudero',
  },
  description:
    'Barbería contemporánea en Bogotá. Reserva online sin registro — solo nombre y teléfono. Corte fade, barba premium, color y rituales. 15 servicios, 10 barberos.',
  keywords: [
    'barbería Bogotá',
    'barbería premium',
    'corte fade Bogotá',
    'barba premium',
    'barbería contemporánea',
    'reserva online barbería',
    'Escudero barbería',
    'corte cabello Bogotá',
  ],
  // PWA
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Escudero',
  },
  formatDetection: {
    telephone: true,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    siteName: 'Escudero',
    images: [
      {
        url: '/og-escudero.jpg',
        width: 1200,
        height: 630,
        alt: 'Escudero — Barbería Premium Bogotá',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-escudero.jpg'],
    creator: '@escudero',
  },
  alternates: {
    canonical: '/',
    languages: {
      'es-CO': '/',
      es: '/es',
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    // Add when available: google: 'your-google-verification', yandex: '...', other: '...'
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  colorScheme: 'dark',
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
