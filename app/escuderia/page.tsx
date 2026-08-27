import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { Playfair_Display, Montserrat } from 'next/font/google'

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-playfair' })
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400','500','600'], variable: '--font-montserrat' })

export const metadata: Metadata = {
  title: 'Escudería — Barbería Contemporánea | Colombia',
  description: 'Escudería Barbería en Colombia. Corte Clásico $30.000, Corte + Barba $45.000. Lun-Sáb 09:00-20:00. Reserva online sin registro. +57 300 123 4567',
  openGraph: {
    title: 'Escudería — Barbería Contemporánea',
    description: 'Tu estilo. Nuestra precisión. Barbería en Colombia.',
    images: [{ url: '/og-image.png' }],
  },
}

export default async function EscuderiaLandingPremium() {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name, slug, phone, address, timezone, currency, brand_color').eq('slug', 'escuderia').maybeSingle()
  const bizId = business?.id ?? '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
  const currency = business?.currency ?? 'COP'

  const [{ data: services }, { data: employees }] = await Promise.all([
    supabase.from('services').select('id, name, description, price, duration_min, category').eq('business_id', bizId).eq('is_active', true).order('price'),
    supabase.from('employees').select('id, name, specialties, color').eq('business_id', bizId).eq('is_active', true).order('name'),
  ])

  const svc = services ?? []
  const emps = employees ?? []

  return (
    <div className={`${playfair.variable} ${montserrat.variable} min-h-screen bg-[#0A0A0A] text-[#e5e2e1] selection:bg-[#C5A059] selection:text-black antialiased`}>
      <style>{`
        .nav-link{position:relative}
        .nav-link::after{content:'';position:absolute;width:0;height:1px;bottom:-2px;left:50%;background:#C5A059;transition:all .3s ease;transform:translateX(-50%)}
        .nav-link:hover::after{width:100%}
        .btn-gold{position:relative;overflow:hidden;transition:all .4s ease}
        .btn-gold::before{content:'';position:absolute;inset:0;background:#C5A059;transform:scaleX(0);transform-origin:left;transition:transform .4s ease;z-index:-1}
        .btn-gold:hover::before{transform:scaleX(1)}
        .btn-gold:hover{color:#000}
        .gold-dashed{border-bottom:1px dashed rgba(142,121,94,.2)}
        .fade-up{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .7s ease}
        .fade-up.visible{opacity:1;transform:none}
      `}</style>

      {/* Nav — glass, mobile hamburger */}
      <nav className="fixed top-0 w-full z-50 bg-[#0A0A0A]/40 backdrop-blur-xl border-b border-[#8E795E]/20">
        <div className="flex justify-between items-center px-5 md:px-16 h-20 w-full mx-auto max-w-[1280px]">
          <Link href="/escuderia" className="font-[var(--font-playfair)] text-[22px] font-bold tracking-tight text-[#C5A059] flex items-center gap-3">
            <img src="/escuderia-icon.svg" alt="Escudería" className="w-8 h-8 object-contain" />
            ESCUDERÍA
          </Link>
          <ul className="hidden md:flex gap-8 items-center">
            <li><a className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[#C5A059] nav-link" href="#experience">EXPERIENCIA</a></li>
            <li><a className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[#C5A059] nav-link" href="#services">SERVICIOS</a></li>
            <li><a className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[#C5A059] nav-link" href="#barberos">BARBEROS</a></li>
            <li><a className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[#C5A059] nav-link" href="#location">UBICACIÓN</a></li>
          </ul>
          <div className="flex items-center gap-3">
            <Link href="/book/escuderia" className="hidden md:inline-flex border border-[#C5A059] text-[#C5A059] px-6 py-2.5 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium hover:bg-[#C5A059] hover:text-black transition-colors">
              RESERVAR
            </Link>
            <Link href="/book/escuderia" className="md:hidden border border-[#C5A059] text-[#C5A059] px-4 py-2 font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] font-medium">RESERVAR</Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero — mobile h-[80vh] bottom, desktop h-screen centered */}
        <section className="relative h-[80vh] md:h-screen w-full flex flex-col justify-end md:items-center md:justify-center overflow-hidden pb-12 md:pb-0">
          <div className="absolute inset-0">
            <div className="w-full h-full bg-cover bg-center opacity-60" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDlfxhfBbn3c67fptZ2goGECpVDSVGmZVBAEHpW_wQ0YL05RFsyAW7nFxSHen_plRL4KuQQlrPHCQWkgiRTADV9aB3WLMjAN0sPO6dgoqqSsTjyZ0OVovrjq_3pYYM7A8ubr_DqepwbdwxQD1gcXKS3pqY8qWL-EquupcIKWTM916zLoHxCS3fuKsB1kt-PRzR-9WzV4Q7xrJCyK-CGr5Rr79Ab0ySQdJlLtOE0WOMs4cLY2wTMbiKI')" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/50 to-transparent" />
          </div>
          {/* Mobile: bottom aligned, desktop: centered */}
          <div className="relative z-10 w-full max-w-[1280px] mx-auto px-5 md:px-16">
            <div className="md:hidden w-full max-w-[350px]">
              <h1 className="font-[var(--font-playfair)] text-[36px] font-bold leading-[44px] tracking-[-0.02em] text-white">
                Tu estilo.<br />Nuestra precisión.
              </h1>
              <p className="font-[var(--font-montserrat)] text-[16px] leading-6 text-[#d0c5b9] mt-4 w-4/5">
                Barbería contemporánea para hombres que entienden que los detalles hacen la diferencia.
              </p>
              <Link href="/book/escuderia" className="btn-gold mt-8 border border-[#C5A059] text-[#C5A059] w-full py-4 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center justify-center gap-2 bg-transparent">
                RESERVAR CITA <span>→</span>
              </Link>
            </div>
            <div className="hidden md:flex flex-col items-center text-center mx-auto">
              <h1 className="font-[var(--font-playfair)] text-[72px] font-bold leading-[80px] tracking-[-0.02em] text-white max-w-3xl">
                Tu estilo.<br />Nuestra precisión.
              </h1>
              <p className="font-[var(--font-montserrat)] text-[18px] leading-7 text-[#d0c5b9] mt-6 max-w-xl">
                Barbería contemporánea para hombres que entienden que los detalles hacen la diferencia.
              </p>
              <Link href="/book/escuderia" className="btn-gold mt-10 border border-[#C5A059] text-[#C5A059] px-10 py-4 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center gap-3 bg-transparent">
                RESERVAR CITA <span>→</span>
              </Link>
              <div className="mt-6 flex items-center gap-3 text-[11px] tracking-[0.2em] font-[var(--font-montserrat)] font-semibold text-[#d0c5b9]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] animate-pulse" /> 7.863 CITAS AÑO • 4 BARBEROS • COP
              </div>
            </div>
          </div>
        </section>

        {/* Experience */}
        <section id="experience" className="py-[80px] md:py-[120px] px-5 md:px-16 max-w-[1280px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-5">
              <span className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#C5A059] block mb-4">EL ENTORNO</span>
              <h2 className="font-[var(--font-playfair)] text-[36px] md:text-[48px] font-semibold leading-[44px] md:leading-[56px] text-white">Mucho más que una barbería.</h2>
              <p className="font-[var(--font-montserrat)] text-[16px] leading-6 text-[#d0c5b9] mt-6">
                Diseñado como un santuario para el caballero moderno. Texturas crudas —cuero envejecido, acero oscuro y maderas nobles— con absoluta privacidad. Un ritual donde el tiempo se detiene.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-4 text-center border-t border-[#8E795E]/20 pt-6">
                <div><div className="font-[var(--font-playfair)] text-xl text-white">09-20</div><div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#d0c5b9]">LUN-SÁB</div></div>
                <div><div className="font-[var(--font-playfair)] text-xl text-white">COP</div><div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#d0c5b9]">BOGOTÁ</div></div>
                <div><div className="font-[var(--font-playfair)] text-xl text-white">+57</div><div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#d0c5b9]">COLOMBIA</div></div>
              </div>
            </div>
            <div className="md:col-span-7 grid grid-cols-2 gap-4 h-[420px] md:h-[600px]">
              <div className="pt-8 md:pt-12 h-full">
                <img alt="Cuero barbería" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700 border border-[#8E795E]/20" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCqeO3EyUizlwpKSi_5JIH9ulTJbPJu9DI057Qbx3QQLobzzbYlIBYB5FksyPAZ7pnunOqf4xsAGVB9pFmqEICXipvxrrY7hFVCuepZsFUt1G7B80JNt5GLBxMvX01aNouSoimcF5yxQHohNNFfM1j1nG4TKwLFJC1cvR_mmw898R9tfEQkXkc8NBptHDc9ayiWPvbP4qw0N5pMW_J0LtSLQNcu55X3p7JcL0Tts7ekOTPLg7rnkCfd" />
              </div>
              <div className="pb-8 md:pb-12 h-full">
                <img alt="Tijeras acero" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700 border border-[#8E795E]/20" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCgwhr313IXfNN8OoljJnvJSYBPXwF7JnV7wSQaz75okGoK60DeEu1WoGq3czq2GNv-8XA2ppbOomEFviISyCqFKTD4jZ40uDQD_Aic9DaZmW-GKo9oKjPgQd1AZNKQWoy1xIGA1dQPiTF1wtF7vRW8CY60-yFV_yKzc9Z4OkiC1ad3Stpum-m85msLFFyh-lksLmLAY8pXpn8evPnbAqGcTLVO73NTCWHG5rnhwZgP5flhLhoEX5Zs8a" />
              </div>
            </div>
          </div>
        </section>

        {/* Services - restaurant menu */}
        <section id="services" className="py-[80px] md:py-[120px] px-5 md:px-16 bg-[#0e0e0e] border-y border-[#8E795E]/10">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#C5A059] block mb-4">MENÚ DE SERVICIOS</span>
              <h2 className="font-[var(--font-playfair)] text-[36px] md:text-[48px] font-semibold leading-tight text-white">El ritual comienza aquí.</h2>
              <p className="font-[var(--font-montserrat)] text-[14px] text-[#d0c5b9] mt-3">Precios en COP • America/Bogota</p>
            </div>
            <div className="flex flex-col">
              {svc.length === 0 ? (
                <p className="font-[var(--font-montserrat)] text-sm text-[#d0c5b9] text-center py-8">Pronto: servicios Escudería</p>
              ) : (
                svc.map((s) => (
                  <Link key={s.id} href={`/book/escuderia?service=${s.id}`} className="gold-dashed py-6 flex justify-between items-baseline group hover:pl-2 transition-all">
                    <div className="pr-8">
                      <h3 className="font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium text-white group-hover:text-[#C5A059] transition-colors">{s.name.toUpperCase()}</h3>
                      <p className="font-[var(--font-montserrat)] text-[14px] text-[#d0c5b9] mt-1 line-clamp-2">{s.description}</p>
                      <span className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#8E795E]">{s.duration_min} MIN • {s.category}</span>
                    </div>
                    <div className="font-[var(--font-playfair)] text-[20px] text-[#C5A059] shrink-0">
                      {formatCurrency(Number(s.price), currency)}
                    </div>
                  </Link>
                ))
              )}
            </div>
            <div className="mt-10 text-center">
              <Link href="/book/escuderia" className="btn-gold border border-[#C5A059] text-[#C5A059] px-8 py-3 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-block">
                RESERVAR AHORA
              </Link>
            </div>
          </div>
        </section>

        {/* Barberos */}
        <section id="barberos" className="py-[80px] md:py-[120px] px-5 md:px-16 max-w-[1280px] mx-auto">
          <div className="text-center mb-10">
            <span className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#C5A059]">EL EQUIPO</span>
            <h2 className="font-[var(--font-playfair)] text-[32px] md:text-[48px] font-semibold text-white mt-3">Barberos Escudería</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {emps.map((e) => (
              <div key={e.id} className="border border-[#8E795E]/20 p-6 text-center bg-[#121212] hover:bg-[#201f1f] transition-colors">
                <div className="w-16 h-16 mx-auto flex items-center justify-center text-white font-bold border border-[#C5A059]/30" style={{ background: (e.color as string) || '#1a1a1a' }}>
                  {e.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                </div>
                <div className="mt-4 font-[var(--font-montserrat)] text-[13px] tracking-[0.1em] font-semibold text-white">{e.name.toUpperCase()}</div>
                <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#8E795E] mt-1">{(e.specialties as string[] | null)?.join(' • ') || 'BARBERO'}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Signature */}
        <section className="py-[80px] md:py-[120px] relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="w-full h-full bg-cover bg-center opacity-30" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDzm19bnJ5J5Iby1ns8UX_-SCZzAsqPBPl0l8aNFwjqgeRaIFXHrpz-bTLnx6Kov-DvBCv9nTLmCA9sI_cGh38zYTthUKzk8Un0rFx2tJxWg3DLcKZCtpQVRb_qxqIQANh7gbiNfDC62I289uylwhGutGaC-yIAMjNERQUDdxvVCwxDurg4aZ2ia5GxF4lp_67ycR9zJszbGGEtyMx4HYDUKelNF2RpfHmhAMqf_-x6YGuE8eqC9s8a')" }} />
            <div className="absolute inset-0 bg-[#0A0A0A]/80" />
          </div>
          <div className="relative z-10 max-w-[1280px] mx-auto px-5 md:px-16 text-center">
            <div className="inline-block border border-[#C5A059]/30 px-6 py-2 mb-8">
              <span className="font-[var(--font-montserrat)] text-[12px] tracking-[0.3em] font-semibold text-[#C5A059]">LA EXPERIENCIA INSIGNIA</span>
            </div>
            <h2 className="font-[var(--font-playfair)] text-[32px] md:text-[48px] font-semibold text-white max-w-2xl mx-auto leading-tight">El máximo nivel de cuidado personal.</h2>
            <p className="font-[var(--font-montserrat)] text-[16px] leading-6 text-[#d0c5b9] mt-6 max-w-xl mx-auto">
              90 minutos: corte impecable, afeitado con navaja, toallas calientes, tratamiento facial y masaje capilar. Bebida premium incluida.
            </p>
            <Link href="/book/escuderia" className="btn-gold mt-10 border border-[#C5A059] text-[#C5A059] px-8 py-3 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-block bg-[#121212]">
              RESERVAR EXPERIENCIA | {svc.find(s=>s.category==='combo') ? formatCurrency(Number(svc.find(s=>s.category==='combo')!.price), currency) : '$45.000'}
            </Link>
          </div>
        </section>

        {/* Ubicación */}
        <section id="location" className="py-[80px] px-5 md:px-16 max-w-[1280px] mx-auto grid md:grid-cols-3 gap-6">
          {[
            { k: 'Horario', v: 'Lun-Sáb 09:00-20:00', sub: 'Domingo cerrado • America/Bogota' },
            { k: 'Ubicación', v: 'Colombia', sub: 'Escudería • Barbería' },
            { k: 'Reserva', v: '+57 300 123 4567', sub: 'Sin registro • En línea 24/7' },
          ].map((c) => (
            <div key={c.k} className="border border-[#8E795E]/20 p-6 bg-[#121212]">
              <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.2em] font-semibold text-[#C5A059]">{c.k.toUpperCase()}</div>
              <div className="font-[var(--font-playfair)] text-lg text-white mt-2">{c.v}</div>
              <div className="font-[var(--font-montserrat)] text-[12px] text-[#d0c5b9] mt-1">{c.sub}</div>
            </div>
          ))}
        </section>
      </main>

      <footer className="w-full py-12 bg-[#0e0e0e] border-t border-[#8E795E]/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-5 md:px-16 gap-8 w-full max-w-[1280px] mx-auto">
          <div className="font-[var(--font-playfair)] text-xl font-bold text-[#C5A059]">ESCUDERÍA</div>
          <div className="flex gap-8 font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9]">
            <Link href="/book/escuderia" className="hover:text-[#C5A059]">RESERVAR</Link>
            <Link href="/login" className="hover:text-[#C5A059]">STAFF</Link>
            <a href="https://wa.me/573001234567" target="_blank" className="hover:text-[#C5A059]">WHATSAPP</a>
          </div>
          <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#8E795E]">© 2026 ESCUDERÍA • COLOMBIA • COP</div>
        </div>
      </footer>
    </div>
  )
}
