import { createClient } from '@/lib/supabase/server'

export default async function ApplicationsPage() {
  const supabase = await createClient()
  const { data: apps } = await supabase.from('barbershop_applications').select('*').order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Solicitudes pendientes</h2>
      {(!apps || apps.length === 0) ? (
        <p className="text-sm text-gray-500">No hay solicitudes.</p>
      ) : (
        <div className="space-y-3">
          {apps.map((app: { id: string; business_name: string; owner_name: string; email: string; status: string; license_key: string | null }) => (
            <div key={app.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{app.business_name} — {app.owner_name}</div>
                <div className="text-xs text-gray-500">{app.email} · {app.status} {app.license_key ? `· ${app.license_key}` : ''}</div>
              </div>
              {app.status === 'pending' && (
                <form action={`/api/admin/applications/${app.id}/approve`} method="POST">
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Aprobar y generar licencia</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
