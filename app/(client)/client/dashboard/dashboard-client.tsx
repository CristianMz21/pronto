'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface ClientRow {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  whatsapp_number: string | null
  birthday: string | null
  total_visits: number
  total_spent: number
  last_visit_at: string | null
  businesses: { name: string; slug: string }
}

interface UpcomingRow {
  id: string; starts_at: string; ends_at: string; status: string; price: number | null
  business_id?: string; service_id?: string | null; employee_id?: string | null
  businesses: { name: string; slug: string } | { name: string; slug: string }[] | null
  services: { name: string } | { name: string }[] | null
}
interface HistoryRow {
  id: string; starts_at: string; ends_at: string; status: string; price: number | null
  service_id?: string | null; employee_id?: string | null; business_id?: string | null
  businesses: { name: string; slug: string } | { name: string; slug: string }[] | null
  services: { name: string } | { name: string }[] | null
}
interface Props {
  userEmail: string
  clients: ClientRow[]
  primaryClient: { id: string; name: string; phone: string | null; email: string | null; whatsapp_number: string | null; birthday: string | null }
  upcoming: UpcomingRow | null
  history: HistoryRow[]
  transactions: Array<{ id: string; amount: number; created_at: string; status: string; businesses: { name: string } | { name: string }[] | null }>
  stats: { total_visits: number; total_spent: number; last_visit_at: string | null }
}

export function DashboardClient({ userEmail, clients, primaryClient, upcoming, history, transactions, stats }: Props) {
  const supabase = createClient()
  const [profile, setProfile] = useState({
    name: primaryClient.name ?? '',
    phone: primaryClient.phone ?? '',
    email: primaryClient.email ?? userEmail ?? '',
    whatsapp_number: primaryClient.whatsapp_number ?? '',
    birthday: primaryClient.birthday ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveProfile() {
    setSaving(true)
    setError(null)
    const { error: updErr } = await supabase.from('clients').update({
      name: profile.name.trim() || primaryClient.name,
      phone: profile.phone.trim() || null,
      email: profile.email.trim() || null,
      whatsapp_number: profile.whatsapp_number.trim() || null,
      birthday: profile.birthday || null,
    }).eq('id', primaryClient.id)
    setSaving(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleCancel(id: string) {
    const res = await fetch(`/api/client/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.message ?? j.error ?? 'No se pudo cancelar')
      return
    }
    location.reload()
  }

  async function handleReschedule(id: string) {
    const date = prompt('Nueva fecha (YYYY-MM-DD):')
    if (!date) return
    const time = prompt('Nueva hora (HH:MM 24h):')
    if (!time) return
    const res = await fetch(`/api/client/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.message ?? j.error ?? 'No se pudo reprogramar')
      return
    }
    location.reload()
  }

  function getBusinessName(row: { businesses: unknown }): string {
    const b = row.businesses as { name: string } | { name: string }[] | null
    if (!b) return ''
    if (Array.isArray(b)) return b[0]?.name ?? ''
    return b.name ?? ''
  }

  function getServiceName(row: { services?: unknown }): string {
    const s = (row as { services: unknown }).services as { name: string } | { name: string }[] | null
    if (!s) return ''
    if (Array.isArray(s)) return s[0]?.name ?? ''
    return s.name ?? ''
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.total_visits}</div>
          <div className="text-xs text-gray-500">Visitas totales</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">${Number(stats.total_spent).toFixed(2)}</div>
          <div className="text-xs text-gray-500">Gasto total</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs font-medium text-gray-900 truncate">{stats.last_visit_at ? new Date(stats.last_visit_at).toLocaleDateString() : '—'}</div>
          <div className="text-xs text-gray-500">Última visita</div>
        </div>
      </div>

      {/* Próxima cita - UX mejorado: header con acción principal a la derecha */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 className="font-semibold text-gray-900">Próxima cita</h2>
          {upcoming && (
            <a href="#historial" onClick={(e) => { e.preventDefault(); document.getElementById('historial')?.scrollIntoView({ behavior: 'smooth' }) }} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline shrink-0">Ver todas →</a>
          )}
        </div>
        {upcoming ? (
          <div className="border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-base font-semibold text-gray-900 truncate">{getServiceName(upcoming) || 'Cita'} — {getBusinessName(upcoming)}</div>
                <div className="text-sm text-gray-700 mt-1">{new Date(upcoming.starts_at).toLocaleString()} — {new Date(upcoming.ends_at).toLocaleTimeString()}</div>
                <div className="inline-flex items-center gap-2 text-xs mt-2">
                  <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium capitalize">{upcoming.status}</span>
                  {upcoming.price ? <span className="text-gray-600">· ${upcoming.price}</span> : null}
                </div>
              </div>
              <a href="#historial" onClick={(e) => { e.preventDefault(); document.getElementById('historial')?.scrollIntoView({ behavior: 'smooth' }) }} className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-50 shrink-0">
                Ver cita
              </a>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => handleReschedule(upcoming.id)} className="flex-1 sm:flex-none text-sm px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 font-medium">Reprogramar</button>
              <button onClick={() => handleCancel(upcoming.id)} className="flex-1 sm:flex-none text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium">Cancelar</button>
              <a href="#historial" onClick={(e) => { e.preventDefault(); document.getElementById('historial')?.scrollIntoView({ behavior: 'smooth' }) }} className="sm:hidden flex-1 text-center text-sm px-4 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 font-medium">Ver cita</a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No tenés próximas citas. <Link href="/book/escuderia" className="text-blue-600 hover:underline font-medium">Reservá ahora</Link></p>
        )}
      </div>

      {/* Historial + transacciones */}
      <div id="historial" className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Historial (últimas 20)</h2>
          <span className="text-xs text-gray-400">{history.length} citas</span>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay historial.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => {
              const businessSlug = (() => {
                const b = h.businesses as { slug: string } | { slug: string }[] | null
                if (!b) return 'escuderia'
                if (Array.isArray(b)) return b[0]?.slug ?? 'escuderia'
                return (b as { slug: string }).slug ?? 'escuderia'
              })()
              const rebookHref = h.service_id ? `/book/${businessSlug}?service=${h.service_id}${h.employee_id ? `&employee=${h.employee_id}` : ''}` : `/book/${businessSlug}`
              return (
                <div key={h.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{getServiceName(h) || 'Cita'} — {getBusinessName(h)}</div>
                    <div className="text-xs text-gray-500">{new Date(h.starts_at).toLocaleString()} · {h.status}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{h.price ? `$${h.price}` : '—'}</span>
                    <Link href={rebookHref} className="text-xs px-2 py-1 rounded-md bg-gray-900 text-white hover:bg-black">Rebook</Link>
                    {(h.status === 'pending' || h.status === 'confirmed' || h.status === 'scheduled') && new Date(h.starts_at) > new Date() && (
                      <button onClick={() => handleCancel(h.id)} className="text-xs text-red-600 hover:underline">Cancelar</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {transactions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Transacciones (gasto)</h3>
            <div className="space-y-1">
              {transactions.map((t) => (
                <div key={t.id} className="flex justify-between text-xs text-gray-600 border-b border-gray-50 py-1">
                  <span>{new Date(t.created_at).toLocaleDateString()} — {getBusinessName(t as unknown as { businesses: unknown })}</span>
                  <span className="font-medium">${Number(t.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Perfil editable */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Perfil</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Nombre</label>
            <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Teléfono</label>
            <input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Email</label>
            <input type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">WhatsApp</label>
            <input value={profile.whatsapp_number} onChange={(e) => setProfile((p) => ({ ...p, whatsapp_number: e.target.value }))} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Cumpleaños</label>
            <input type="date" value={profile.birthday} onChange={(e) => setProfile((p) => ({ ...p, birthday: e.target.value }))} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex items-center gap-3 mt-4">
          <button onClick={saveProfile} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar cambios'}
          </button>
          {clients.length > 1 && <span className="text-xs text-gray-500">Editando: {getBusinessName(primaryClient as unknown as { businesses: unknown }) || clients[0].businesses.name} (otros {clients.length - 1} negocios vinculados)</span>}
        </div>
      </div>
    </div>
  )
}
