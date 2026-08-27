import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Escudería — Barbería Contemporánea | Colombia',
  description:
    'Escudería Barbería en Colombia. Corte Clásico $30.000, Corte + Barba $45.000. Lun-Sáb 09:00-20:00. Reserva online sin registro.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
}

export default function EscuderiaLayout({ children }: { children: React.ReactNode }) {
  return children
}
