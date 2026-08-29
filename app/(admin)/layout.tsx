import { notFound } from 'next/navigation'

import { isSuperAdmin } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (
    !user ||
    !isSuperAdmin(
      user as unknown as { email?: string | null; user_metadata?: Record<string, unknown> | null },
    )
  ) {
    notFound()
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Super Admin — Barberías</h1>
        <p className="text-xs text-gray-500">Máxima seguridad — licenciamiento controlado</p>
      </header>
      <main className="p-6 max-w-5xl mx-auto">{children}</main>
    </div>
  )
}
