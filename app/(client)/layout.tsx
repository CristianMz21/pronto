import Link from 'next/link'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/client/dashboard" className="text-lg font-bold" style={{ letterSpacing: '-0.5px' }}>
            Pronto<span style={{ color: '#16a34a' }}>.</span> <span className="text-sm font-normal text-gray-500">Cliente</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">Inicio</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
