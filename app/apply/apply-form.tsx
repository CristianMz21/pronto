'use client'
import { useEffect, useState } from 'react'

export function ApplyForm() {
  const [form, setForm] = useState({
    business_name: '',
    owner_name: '',
    email: '',
    phone: '',
    nit: '',
    city: '',
    requested_plan: 'starter',
    turnstile_token: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey) return
    // Load Turnstile script if not present
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) return
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    s.async = true
    document.head.appendChild(s)
    // Global callback for Turnstile
    ;(window as unknown as Record<string, unknown>).onTurnstile = (token: string) => {
      setForm((f) => ({ ...f, turnstile_token: token }))
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMsg('')
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message ?? j.error ?? 'Error')
      setStatus('success')
      setMsg('Solicitud enviada. Te contactaremos pronto.')
    } catch (err) {
      setStatus('error')
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
        {msg}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        placeholder="Nombre barbería *"
        value={form.business_name}
        onChange={(e) => setForm({ ...form, business_name: e.target.value })}
        required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      <input
        placeholder="Tu nombre *"
        value={form.owner_name}
        onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
        required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      <input
        type="email"
        placeholder="Email *"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      <input
        placeholder="Teléfono"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      <input
        placeholder="NIT"
        value={form.nit}
        onChange={(e) => setForm({ ...form, nit: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      <input
        placeholder="Ciudad"
        value={form.city}
        onChange={(e) => setForm({ ...form, city: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      <select
        value={form.requested_plan}
        onChange={(e) => setForm({ ...form, requested_plan: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="starter">Starter</option>
        <option value="pro">Pro</option>
        <option value="agency">Agency</option>
      </select>
      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
        <div
          className="cf-turnstile"
          data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          data-callback="onTurnstile"
        />
      ) : (
        <input type="hidden" value="" />
      )}
      {/* hidden token field for non-JS fallback */}
      <input type="hidden" value={form.turnstile_token} onChange={() => {}} />
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
          {msg}
        </div>
      )}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {status === 'loading' ? 'Enviando...' : 'Solicitar alta'}
      </button>
      <p className="text-xs text-gray-400 text-center">
        Al enviar aceptas verificación manual y licenciamiento.
      </p>
    </form>
  )
}
