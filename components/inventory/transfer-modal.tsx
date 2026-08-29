'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function TransferModal({ items, locations, onClose }: { items: { id: string; name: string; quantity: number }[]; locations: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({ item_id: items[0]?.id ?? '', from_location_id: '', to_location_id: '', quantity: '1', note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const res = await fetch('/api/inventory/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: form.item_id, from_location_id: form.from_location_id || null, to_location_id: form.to_location_id || null, quantity: Number(form.quantity), note: form.note || null }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.message ?? j.error ?? 'Error'); setSaving(false); return }
    setSaving(false); router.refresh(); onClose()
  }
  if (items.length === 0) return (<div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"><Card className="w-full max-w-sm"><CardContent className="py-8 text-center text-sm text-gray-500">Sin items para transferir</CardContent></Card></div>)
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle className="text-base">Transferir inventario</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><label className="text-xs text-gray-500">Producto</label><select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">{items.map((it) => <option key={it.id} value={it.id}>{it.name} (stock {it.quantity})</option>)}</select></div>
            {locations.length > 1 && (<div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-gray-500">Desde sede</label><select value={form.from_location_id} onChange={(e) => setForm({ ...form, from_location_id: e.target.value })} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div><div><label className="text-xs text-gray-500">Hacia sede</label><select value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div></div>)}
            <div><label className="text-xs text-gray-500">Cantidad</label><input type="number" min={0.1} step={0.1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs text-gray-500">Nota</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" placeholder="Motivo traslado" /></div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
            <div className="flex gap-2 pt-2"><Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving} className="flex-1">{saving ? 'Transfiriendo...' : 'Transferir'}</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
