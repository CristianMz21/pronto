import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { Clock, MapPin, Phone, Star, Scissors, Award, Users } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Escudería — Barbería en Colombia | Corte, Barba y Estilo',
  description: 'Escudería Barbería en Colombia. Corte Clásico $30.000, Corte + Barba $45.000. Lun-Sáb 09:00-20:00. Reserva online sin registro. +57 300 123 4567',
  openGraph: {
    title: 'Escudería — Barbería',
    description: 'Corte, Barba y Estilo en Colombia. Reserva online.',
    images: [{ url: '/og-image.png' }],
  },
}

export default async function EscuderiaLanding() {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name, slug, phone, address, timezone, currency, brand_color').eq('slug', 'escuderia').maybeSingle()
  const bizId = business?.id ?? '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
  const currency = business?.currency ?? 'COP'

  const [{ data: services }, { data: employees }] = await Promise.all([
    supabase.from('services').select('id, name, description, price, duration_min, category').eq('business_id', bizId).eq('is_active', true).order('price'),
    supabase.from('employees').select('id, name, specialties, color, bio').eq('business_id', bizId).eq('is_active', true).order('name'),
  ])

  const brand = business?.brand_color || '#1a1a1a'

  return (
    <div className="min-h-screen bg-[#FBF8F5]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-[#E8E0D8]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: brand }}>E</div>
            <span className="font-bold text-[#2D2926]">Escudería</span>
            <span className="hidden sm:inline text-xs bg-[#1a1a1a] text-white px-2 py-0.5 rounded-full">Barbería</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="tel:+573001234567" className="hidden sm:flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#1a1a1a]">
              <Phone className="w-4 h-4" /> +57 300 123 4567
            </a>
            <Link href="/book/escuderia" className="px-4 py-2 rounded-full text-white text-sm font-medium" style={{ background: brand }}>
              Reservar
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white border border-[#E8E0D8] rounded-full px-3 py-1 text-xs text-[#6b7280] mb-4">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Abierto hoy • 09:00-20:00
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#2D2926] leading-[1.05]">
              Corte, <span style={{ color: brand }}>Barba</span><br />y Estilo
            </h1>
            <p className="mt-4 text-[#6b7280] leading-relaxed max-w-xl">
              Barbería en Colombia. Técnica clásica, acabado moderno. Reserva online sin registro, paga en efectivo, tarjeta o transferencia. Lun-Sáb 09:00-20:00.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/book/escuderia" className="px-6 py-3 rounded-full text-white font-medium shadow" style={{ background: brand }}>
                Reservar ahora — sin registro
              </Link>
              <a href="#servicios" className="px-6 py-3 rounded-full bg-white border border-[#E8E0D8] text-[#2D2926] font-medium">
                Ver servicios
              </a>
            </div>
            <div className="mt-6 flex items-center gap-4 text-sm text-[#6b7280]">
              <span className="flex items-center gap-1"><Star className="w-4 h-4 text-amber-500" /> 4.9 (120+)</span>
              <span className="flex items-center gap-1"><Scissors className="w-4 h-4" /> 7.863 citas año</span>
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> 4 barberos</span>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1a1a] to-[#333] p-1">
              <div className="w-full h-full rounded-xl bg-[#111] flex items-center justify-center text-white/60">
                <div className="text-center p-8">
                  <Scissors className="w-12 h-12 mx-auto mb-3 text-white/80" />
                  <p className="text-sm text-white/70">Escudería — Barbería</p>
                  <p className="text-xs text-white/50 mt-1">Colombia • COP • America/Bogota</p>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg border border-[#E8E0D8] p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center"><Award className="w-5 h-5 text-green-600" /></div>
              <div>
                <div className="text-sm font-bold text-[#2D2926]">$187M</div>
                <div className="text-xs text-[#6b7280]">revenue año • 7.169 ventas</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#2D2926]">Servicios</h2>
          <span className="text-sm text-[#6b7280]">Precios en COP</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(services ?? []).map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-[#E8E0D8] p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start gap-3">
                <h3 className="font-semibold text-[#2D2926]">{s.name}</h3>
                <span className="text-sm font-bold" style={{ color: brand }}>{formatCurrency(Number(s.price), currency)}</span>
              </div>
              <p className="text-sm text-[#6b7280] mt-1 line-clamp-2">{s.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-[#9A8E85]">
                <Clock className="w-3.5 h-3.5" /> {s.duration_min} min
                {s.category && <span className="px-2 py-0.5 bg-[#FBF8F5] border border-[#E8E0D8] rounded-full">{s.category}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/book/escuderia" className="inline-flex px-6 py-3 rounded-full text-white font-medium" style={{ background: brand }}>
            Reservar {services?.[0]?.name ?? 'ahora'}
          </Link>
        </div>
      </section>

      {/* Barberos */}
      <section className="bg-white border-y border-[#E8E0D8]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-2xl font-bold text-[#2D2926] mb-6">Barberos</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(employees ?? []).map((e) => (
              <div key={e.id} className="rounded-xl border border-[#E8E0D8] p-5 text-center">
                <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white font-bold" style={{ background: (e.color as string) || brand }}>
                  {e.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                </div>
                <div className="mt-3 font-semibold text-[#2D2926]">{e.name}</div>
                <div className="text-xs text-[#6b7280] mt-1">{(e.specialties as string[] | null)?.join(' • ') || 'Barbero'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Info */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-[#E8E0D8] p-6">
          <h3 className="font-semibold text-[#2D2926] flex items-center gap-2"><Clock className="w-4 h-4" /> Horario</h3>
          <p className="text-sm text-[#6b7280] mt-2">Lun-Sáb 09:00-20:00<br/>Domingo cerrado</p>
          <p className="text-xs text-[#9A8E85] mt-2">America/Bogota • Sin break — atención continua</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E8E0D8] p-6">
          <h3 className="font-semibold text-[#2D2926] flex items-center gap-2"><MapPin className="w-4 h-4" /> Ubicación</h3>
          <p className="text-sm text-[#6b7280] mt-2">Colombia<br/>Barbería Escudería</p>
          <a href="tel:+573001234567" className="inline-flex mt-3 text-sm text-white px-4 py-2 rounded-full" style={{ background: brand }}><Phone className="w-4 h-4 mr-2" /> +57 300 123 4567</a>
        </div>
        <div className="bg-white rounded-xl border border-[#E8E0D8] p-6">
          <h3 className="font-semibold text-[#2D2926] flex items-center gap-2"><Star className="w-4 h-4" /> Reserva</h3>
          <p className="text-sm text-[#6b7280] mt-2">Sin registro. Eliges servicio → barbero → fecha → hora → nombre + cel → confirmar.</p>
          <Link href="/book/escuderia" className="inline-flex mt-3 text-sm border border-[#E8E0D8] px-4 py-2 rounded-full hover:bg-[#FBF8F5]">Ir a reservas →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E0D8] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row justify-between gap-3 text-sm text-[#6b7280]">
          <span>© 2026 Escudería • Barbería • Colombia • COP</span>
          <span className="flex gap-4">
            <Link href="/book/escuderia" className="hover:text-[#1a1a1a]">Reservar</Link>
            <Link href="/login" className="hover:text-[#1a1a1a]">Staff</Link>
            <a href="https://wa.me/573001234567" target="_blank" className="hover:text-green-600">WhatsApp</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
