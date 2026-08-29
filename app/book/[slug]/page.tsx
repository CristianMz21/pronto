export const dynamic = 'force-dynamic'

import { Playfair_Display, Montserrat } from 'next/font/google'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createServiceClient } from '@/lib/supabase/service'
import { getTelegramBotInfo } from '@/lib/telegram'
import { getViberBotInfo } from '@/lib/viber'

import { PublicBookingForm } from './booking-form'

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500', '600', '700'] })
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600'] })

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('businesses')
    .select('name')
    .eq('slug', params.slug)
    .maybeSingle()

  return {
    title: data ? `Reservar en ${data.name}` : 'Reservar cita',
  }
}

export default async function PublicBookingPage(props: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ service?: string; employee?: string }>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const supabase = createServiceClient()

  const { data: business } = await supabase
    .from('businesses')
    .select(
      'id, name, type, phone, logo_url, currency, slug, timezone, address, brand_color, min_advance_minutes, booking_lead_time_enabled, allow_guest_bookings',
    )
    .eq('slug', params.slug)
    .maybeSingle()

  if (!business) notFound()

  const isEscuderia =
    business.slug === 'escuderia' ||
    business.brand_color === '#0A0A0A' ||
    business.brand_color === '#1a1a1a'

  const { data: bizTokens } = await supabase
    .from('businesses')
    .select('telegram_bot_token, viber_bot_token')
    .eq('id', business.id)
    .maybeSingle()

  const [
    { data: services },
    { data: employees },
    { data: businessHours },
    { data: locations },
    telegramInfo,
    viberInfo,
  ] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, price, duration_min, category, capacity, location_id')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('employees')
      .select('id, name, location_id')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('business_hours')
      .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
      .eq('business_id', business.id)
      .order('day_of_week'),
    supabase
      .from('locations')
      .select('id, name, slug')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name'),
    bizTokens?.telegram_bot_token
      ? getTelegramBotInfo(bizTokens.telegram_bot_token)
      : Promise.resolve({ ok: false as const }),
    bizTokens?.viber_bot_token
      ? getViberBotInfo(bizTokens.viber_bot_token)
      : Promise.resolve({ ok: false as const }),
  ])

  const telegramBotUsername = telegramInfo.ok
    ? ((telegramInfo as { ok: true; result: { username: string } }).result?.username ?? null)
    : null
  const viberBotUri = viberInfo.ok ? ((viberInfo as { ok: true; uri?: string }).uri ?? null) : null

  const brand = business.brand_color || '#1a1a1a'
  const gold = '#C5A059'

  // Escudería premium dark theme
  if (isEscuderia) {
    return (
      <div
        className={`${playfair.className} ${montserrat.className} min-h-screen bg-[#0A0A0A]`}
        style={{ '--brand': brand, '--gold': gold } as React.CSSProperties}
      >
        <style>{`
          :root{--brand:${brand};--gold:${gold}}
          .btn-gold{position:relative;overflow:hidden;transition:all .4s ease}
          .btn-gold::before{content:'';position:absolute;inset:0;background:${gold};transform:scaleX(0);transform-origin:left;transition:transform .4s ease;z-index:-1}
          .btn-gold:hover::before{transform:scaleX(1)}
          .btn-gold:hover{color:#000}
        `}</style>
        {/* Header Escudería */}
        <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-[#8E795E]/20">
          <div className="max-w-[448px] mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/escuderia" className="flex items-center gap-2.5">
              <img src="/escuderia-icon.svg" alt="Escudería" className="w-7 h-7 object-contain" />
              <span className="font-bold tracking-tight text-[#C5A059] text-[15px]">ESCUDERÍA</span>
            </Link>
            <Link
              href="/escuderia"
              className="text-[11px] tracking-[0.15em] font-semibold text-[#d0c5b9] hover:text-[#C5A059]"
            >
              ← VOLVER
            </Link>
          </div>
        </header>

        <div className="max-w-[448px] mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <p className="font-[Montserrat] text-[11px] tracking-[0.2em] font-semibold text-[#C5A059]">
              RESERVA ONLINE
            </p>
            <h1 className="font-[Playfair_Display] text-[22px] font-semibold text-white mt-1">
              Reserva en {business.name}
            </h1>
            <p className="font-[Montserrat] text-[12px] text-[#d0c5b9] mt-1">
              Sin registro • Confirma en segundos • COP
            </p>
          </div>

          <div className="bg-[#121212] border border-[#8E795E]/20 p-4 sm:p-6">
            <PublicBookingForm
              business={business}
              services={services ?? []}
              employees={employees ?? []}
              workingHours={businessHours ?? []}
              locations={(locations ?? []) as { id: string; name: string; slug: string }[]}
              telegramBotUsername={telegramBotUsername}
              viberBotUri={viberBotUri}
              initialServiceId={searchParams?.service ?? null}
              initialEmployeeId={searchParams?.employee ?? null}
              theme="escuderia"
            />
          </div>

          <p className="text-center font-[Montserrat] text-[11px] text-[#8E795E] mt-6">
            Lun-Sáb 09:00-20:00 • Dom cerrado • +57 300 123 4567
          </p>
        </div>
      </div>
    )
  }

  // Fallback light theme for other businesses
  const brandColor = business.brand_color || '#2D2926'
  return (
    <div
      style={
        {
          '--brand': brandColor,
          '--brand-light': `${brandColor}18`,
        } as React.CSSProperties
      }
    >
      <header
        style={{ background: 'white', borderBottom: '0.5px solid #E8E0D8', padding: '14px 16px' }}
      >
        <div
          style={{
            maxWidth: 448,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt={business.name}
              style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 500,
                fontSize: 16,
              }}
            >
              {business.name[0]}
            </div>
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#2D2926' }}>{business.name}</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Reserva una cita</div>
          </div>
        </div>
      </header>

      <div style={{ background: '#FBF8F5', minHeight: 'calc(100vh - 67px)', padding: '20px 16px' }}>
        <div style={{ maxWidth: 448, margin: '0 auto' }}>
          <PublicBookingForm
            business={business}
            services={services ?? []}
            employees={employees ?? []}
            workingHours={businessHours ?? []}
            locations={(locations ?? []) as { id: string; name: string; slug: string }[]}
            telegramBotUsername={telegramBotUsername}
            viberBotUri={viberBotUri}
            initialServiceId={searchParams?.service ?? null}
            initialEmployeeId={searchParams?.employee ?? null}
          />
        </div>
      </div>
    </div>
  )
}
