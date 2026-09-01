import Link from 'next/link'
import { Suspense } from 'react'

import { BottomTabClient } from '@/components/layout/bottom-tab-client'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/client/me" className="text-lg font-bold" style={{ letterSpacing: '-0.5px' }}>
            Escudería<span style={{ color: '#C5A059' }}>.</span>{' '}
            <span className="text-sm font-normal text-gray-500">Cliente 360</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/book/escuderia"
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-900 text-white hover:bg-black"
            >
              Reservar
            </Link>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 hidden sm:inline">
              Inicio
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6" style={{ maxWidth: 375 }}>
        {children}
      </main>
      <Suspense fallback={null}>
        <BottomTabClient />
      </Suspense>
    </div>
  )
}
