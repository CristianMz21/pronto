import { Calendar, Clock, History } from 'lucide-react'
import type { Metadata } from 'next'
import { Montserrat, Playfair_Display } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-playfair',
})
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-montserrat',
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: business } = (await supabase
    .from('businesses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as unknown as {
    data: {
      name: string
      slug: string
      phone: string | null
      hero_title: string | null
      hero_subtitle: string | null
      brand_color: string | null
      accent_color: string | null
      locale: string | null
      currency: string | null
      hero_image_url: string | null
    } | null
  }
  if (!business) return {}
  const brand = (business as unknown as { brand_color?: string | null }).brand_color ?? '#0A0A0A'
  const accent = (business as unknown as { accent_color?: string | null }).accent_color ?? '#C5A059'
  void brand
  void accent
  const title = `${(business as unknown as { name: string }).name} — ${(business as unknown as { hero_title?: string | null }).hero_title ?? 'Barbería Premium'} | ${(business as unknown as { phone?: string | null }).phone ?? ''}`
  const description =
    (business as unknown as { hero_subtitle?: string | null }).hero_subtitle ??
    `Reserva online en ${(business as unknown as { name: string }).name}. Reserva sin registro. ${(business as unknown as { phone?: string | null }).phone ?? ''}`
  return {
    title,
    description,
    alternates: { canonical: `/b/${(business as unknown as { slug: string }).slug}` },
    openGraph: {
      title: (business as unknown as { name: string }).name,
      description,
      url: `/b/${(business as unknown as { slug: string }).slug}`,
      type: 'website',
      locale:
        (business as unknown as { locale?: string | null }).locale === 'en' ? 'en_US' : 'es_CO',
      images: [
        {
          url:
            (business as unknown as { hero_image_url?: string | null }).hero_image_url ??
            '/og-image.png',
          width: 1200,
          height: 630,
          alt: (business as unknown as { name: string }).name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: (business as unknown as { name: string }).name,
      description,
      images: [
        (business as unknown as { hero_image_url?: string | null }).hero_image_url ??
          '/og-image.png',
      ],
    },
  }
}

export default async function BusinessLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: businessRaw } = (await supabase
    .from('businesses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()) as unknown as {
    data: {
      id: string
      name: string
      slug: string
      phone: string | null
      address: string | null
      timezone: string
      currency: string
      brand_color: string | null
      accent_color: string | null
      hero_title: string | null
      hero_subtitle: string | null
      hero_image_url: string | null
      gallery_urls: string[] | null
      locale: string | null
      logo_url: string | null
    } | null
  }
  const business = businessRaw
  if (!business) notFound()
  const bizId = business.id
  const currency = business.currency
  const bizPhone = business.phone ?? ''
  const bizAddress = business.address ?? ''
  const bizName = business.name
  const brand = business.brand_color ?? '#0A0A0A'
  const accent = (business as unknown as { accent_color?: string | null }).accent_color ?? '#C5A059'
  const heroTitle =
    (business as unknown as { hero_title?: string | null }).hero_title ?? 'Tu estilo.'
  const heroSubtitle =
    (business as unknown as { hero_subtitle?: string | null }).hero_subtitle ??
    'Barbería contemporánea para hombres que entienden que los detalles hacen la diferencia.'
  const heroImage =
    (business as unknown as { hero_image_url?: string | null }).hero_image_url ??
    `/business-assets/${business.slug}/hero.webp`
  const gallery = (business as unknown as { gallery_urls?: string[] | null }).gallery_urls ?? []
  const logoUrl = business.logo_url ?? null
  const locale = (business as unknown as { locale?: string | null }).locale ?? 'es'
  const tz = business.timezone

  const [
    {
      data: { user },
    },
    { data: services },
    { data: employees },
    { data: hours },
    apptCountRes,
    empCountRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('services')
      .select('id, name, description, price, duration_min, category')
      .eq('business_id', bizId)
      .eq('is_active', true)
      .order('price'),
    supabase
      .from('employees')
      .select('id, name, specialties, color')
      .eq('business_id', bizId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('business_hours')
      .select('day_of_week, is_open, open_time, close_time')
      .eq('business_id', bizId)
      .order('day_of_week'),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', bizId),
    supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', bizId)
      .eq('is_active', true),
  ])

  const accountHref = user ? '/client/dashboard' : `/client/login?redirect=/b/${business.slug}`

  const svc = services ?? []
  const emps = employees ?? []
  const apptCount = apptCountRes.count ?? 0
  const empCount = empCountRes.count ?? emps.length
  const refDay =
    hours?.find((h) => h.day_of_week === 1 && h.is_open) ?? hours?.find((h) => h.is_open)
  const horario = refDay
    ? `${refDay.open_time.slice(0, 5)}-${refDay.close_time.slice(0, 5)}`
    : '09:00-20:00'
  const diasAbiertos = hours ? `${hours.filter((h) => h.is_open).length} días` : 'Lun-Sáb'
  const localeStr = locale === 'en' ? 'en-US' : 'es-CO'
  const heroStats = `${apptCount > 0 ? apptCount.toLocaleString(localeStr) : '7.863'} CITAS AÑO • ${empCount} BARBEROS • ${currency}`
  const minPrice = svc.length > 0 ? Math.min(...svc.map((s) => Number(s.price))) : 0
  const maxPrice = svc.length > 0 ? Math.max(...svc.map((s) => Number(s.price))) : 0
  const priceRange =
    svc.length > 0
      ? `${formatCurrency(minPrice, currency)} - ${formatCurrency(maxPrice, currency)}`
      : '$$'
  const city = bizAddress.split(',').pop()?.trim() ?? bizAddress
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BarberShop',
    name: bizName,
    address: {
      '@type': 'PostalAddress',
      addressLocality: city,
      streetAddress: bizAddress,
      addressCountry: locale === 'en' ? 'US' : 'CO',
    },
    telephone: bizPhone,
    priceRange,
    currenciesAccepted: currency,
    openingHours: hours
      ?.filter((h) => h.is_open)
      .map((h) => `Mo-Su ${h.open_time.slice(0, 5)}-${h.close_time.slice(0, 5)}`) ?? [
      'Mo-Sa 09:00-20:00',
    ],
    url: `/b/${business.slug}`,
  }

  const bookHref = `/book/${business.slug}`
  const phoneHref = bizPhone ? `tel:${bizPhone.replace(/\s/g, '')}` : '#'
  const waHref = bizPhone ? `https://wa.me/${bizPhone.replace(/\D/g, '')}` : '#'

  return (
    <div
      className={`${playfair.variable} ${montserrat.variable} min-h-screen text-[#e5e2e1] selection:text-black antialiased max-w-full overflow-hidden`}
      style={{ backgroundColor: brand } as React.CSSProperties}
    >
      <style>{`
        :root{--brand:${brand};--accent:${accent}}
        .selection\\:bg-accent::selection{background:var(--accent)}
        .nav-link{position:relative}
        .nav-link::after{content:'';position:absolute;width:0;height:1px;bottom:-2px;left:50%;background:var(--accent);transition:all .3s ease;transform:translateX(-50%)}
        .nav-link:hover::after{width:100%}
        .btn-gold{position:relative;overflow:hidden;transition:all .4s ease}
        .btn-gold::before{content:'';position:absolute;inset:0;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .4s ease;z-index:-1}
        .btn-gold:hover::before{transform:scaleX(1)}
        .btn-gold:hover{color:#000}
        .btn-outline-gold{border:1px solid color-mix(in srgb, var(--accent) 40%, transparent);color:var(--accent);transition:all .4s ease}
        .btn-outline-gold:hover{background:var(--accent);color:#000;border-color:var(--accent)}
        .gold-dashed{border-bottom:1px dashed color-mix(in srgb, var(--accent) 20%, transparent)}
      `}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav
        className="fixed top-0 w-full z-50 backdrop-blur-xl border-b"
        style={{
          backgroundColor: `${brand}66`,
          borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
        }}
      >
        <div className="flex justify-between items-center px-5 md:px-16 h-20 w-full mx-auto max-w-[1280px]">
          <Link
            href={`/b/${business.slug}`}
            className="font-[var(--font-playfair)] text-[22px] font-bold tracking-tight flex items-center gap-3"
            style={{ color: accent }}
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={bizName}
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
              />
            ) : null}
            {bizName.toUpperCase()}
          </Link>
          <ul className="hidden md:flex gap-8 items-center">
            <li>
              <a
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[var(--accent)] nav-link"
                href="#experience"
              >
                EXPERIENCIA
              </a>
            </li>
            <li>
              <a
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[var(--accent)] nav-link"
                href="#services"
              >
                SERVICIOS
              </a>
            </li>
            <li>
              <a
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[var(--accent)] nav-link"
                href="#barberos"
              >
                BARBEROS
              </a>
            </li>
            <li>
              <a
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[var(--accent)] nav-link"
                href="#location"
              >
                UBICACIÓN
              </a>
            </li>
            <li>
              <Link
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9] hover:text-[var(--accent)] nav-link"
                href={accountHref}
              >
                MI CUENTA
              </Link>
            </li>
          </ul>
          <div className="flex items-center gap-3">
            {bizPhone && (
              <a
                href={phoneHref}
                className="hidden md:flex items-center gap-1.5 text-sm text-[#d0c5b9] hover:text-[var(--accent)]"
              >
                {bizPhone}
              </a>
            )}
            <Link
              href={bookHref}
              className="hidden md:inline-flex border px-6 py-2.5 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium transition-colors"
              style={{ borderColor: accent, color: accent }}
            >
              RESERVAR
            </Link>
            <Link
              href={accountHref}
              className="md:hidden font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] font-medium text-[#d0c5b9]"
            >
              MI CUENTA
            </Link>
            <Link
              href={bookHref}
              className="md:hidden border px-4 py-2 font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] font-medium"
              style={{ borderColor: accent, color: accent }}
            >
              RESERVAR
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        <section className="relative h-[80vh] md:h-screen w-full flex flex-col justify-end md:items-center md:justify-center overflow-hidden pb-12 md:pb-0">
          <div className="absolute inset-0">
            <div
              className="w-full h-full bg-cover bg-center opacity-60"
              style={{
                backgroundImage: `image-set(url('/business-assets/${business.slug}/hero.avif') type('image/avif'), url('${heroImage}') type('image/webp'), url('/business-assets/${business.slug}/hero.jpg') type('image/jpeg'))`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(to top, ${brand}, ${brand}80, transparent)` }}
            />
          </div>
          <div className="relative z-10 w-full max-w-[1280px] mx-auto px-5 md:px-16">
            <div className="md:hidden w-full max-w-[350px]">
              <h1 className="font-[var(--font-playfair)] text-[36px] font-bold leading-[44px] tracking-[-0.02em] text-white">
                {heroTitle}
                <br />
                Nuestra precisión.
              </h1>
              <p className="font-[var(--font-montserrat)] text-[16px] leading-6 text-[#d0c5b9] mt-4 w-4/5">
                {heroSubtitle}
              </p>
              <div className="mt-8 flex flex-col gap-3">
                <Link
                  href={bookHref}
                  className="btn-gold border w-full py-4 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center justify-center gap-2 bg-transparent"
                  style={{ borderColor: accent, color: accent }}
                >
                  RESERVAR CITA <span>→</span>
                </Link>
                <Link
                  href={accountHref}
                  className="btn-outline-gold w-full py-4 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center justify-center gap-2"
                >
                  MIS CITAS <span>→</span>
                </Link>
              </div>
            </div>
            <div className="hidden md:flex flex-col items-center text-center mx-auto">
              <h1 className="font-[var(--font-playfair)] text-[72px] font-bold leading-[80px] tracking-[-0.02em] text-white max-w-3xl">
                {heroTitle}
                <br />
                Nuestra precisión.
              </h1>
              <p className="font-[var(--font-montserrat)] text-[18px] leading-7 text-[#d0c5b9] mt-6 max-w-xl">
                {heroSubtitle}
              </p>
              <div className="mt-10 flex flex-col items-center gap-3">
                <Link
                  href={bookHref}
                  className="btn-gold border px-10 py-4 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center gap-3 bg-transparent"
                  style={{ borderColor: accent, color: accent }}
                >
                  RESERVAR CITA <span>→</span>
                </Link>
                <Link
                  href={accountHref}
                  className="btn-outline-gold px-10 py-4 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center gap-3"
                >
                  MIS CITAS <span>→</span>
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-3 text-[11px] tracking-[0.2em] font-[var(--font-montserrat)] font-semibold text-[#d0c5b9]">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: accent }}
                />{' '}
                {heroStats}
              </div>
            </div>
          </div>
        </section>

        <section
          id="experience"
          className="py-[80px] md:py-[120px] px-5 md:px-16 max-w-[1280px] mx-auto"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-5">
              <span
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold block mb-4"
                style={{ color: accent }}
              >
                EL ENTORNO
              </span>
              <h2 className="font-[var(--font-playfair)] text-[36px] md:text-[48px] font-semibold leading-[44px] md:leading-[56px] text-white">
                Mucho más que una barbería.
              </h2>
              <p className="font-[var(--font-montserrat)] text-[16px] leading-6 text-[#d0c5b9] mt-6">
                Diseñado como un santuario para el caballero moderno. Texturas crudas —cuero
                envejecido, acero oscuro y maderas nobles— con absoluta privacidad.
              </p>
              <div
                className="mt-8 grid grid-cols-3 gap-4 text-center border-t pt-6"
                style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}
              >
                <div>
                  <div className="font-[var(--font-playfair)] text-xl text-white">{horario}</div>
                  <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#d0c5b9]">
                    {diasAbiertos.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="font-[var(--font-playfair)] text-xl text-white">{currency}</div>
                  <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#d0c5b9]">
                    {tz.split('/').pop()?.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="font-[var(--font-playfair)] text-xl text-white">
                    {bizPhone.slice(0, 3) || '---'}
                  </div>
                  <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#d0c5b9]">
                    {locale.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-7 grid grid-cols-2 gap-4 h-[420px] md:h-[600px]">
              <div className="pt-8 md:pt-12 h-full relative">
                <Image
                  alt={`${bizName} — cuero`}
                  className="object-cover grayscale hover:grayscale-0 transition-all duration-700 border"
                  style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}
                  src={gallery[0] ?? `/business-assets/${business.slug}/cuero.webp`}
                  fill
                  sizes="(max-width: 768px) 50vw, 35vw"
                />
              </div>
              <div className="pb-8 md:pb-12 h-full relative">
                <Image
                  alt={`${bizName} — tijeras`}
                  className="object-cover grayscale hover:grayscale-0 transition-all duration-700 border"
                  style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}
                  src={gallery[1] ?? `/business-assets/${business.slug}/tijeras.webp`}
                  fill
                  sizes="(max-width: 768px) 50vw, 35vw"
                />
              </div>
            </div>
          </div>
        </section>

        <section
          id="services"
          className="py-[80px] md:py-[120px] px-5 md:px-16 border-y"
          style={{
            backgroundColor: '#0e0e0e',
            borderColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
          }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold block mb-4"
                style={{ color: accent }}
              >
                MENÚ DE SERVICIOS
              </span>
              <h2 className="font-[var(--font-playfair)] text-[36px] md:text-[48px] font-semibold leading-tight text-white">
                El ritual comienza aquí.
              </h2>
              <p className="font-[var(--font-montserrat)] text-[14px] text-[#d0c5b9] mt-3">
                Precios en {currency} • {tz}
              </p>
            </div>
            <div className="flex flex-col">
              {svc.length === 0 ? (
                <p className="font-[var(--font-montserrat)] text-sm text-[#d0c5b9] text-center py-8">
                  Pronto: servicios {bizName}
                </p>
              ) : (
                svc.map((s) => (
                  <Link
                    key={s.id}
                    href={`/book/${business.slug}?service=${s.id}`}
                    className="gold-dashed py-6 flex justify-between items-baseline group hover:pl-2 transition-all"
                  >
                    <div className="pr-8">
                      <h3 className="font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium text-white group-hover:text-[var(--accent)] transition-colors">
                        {s.name.toUpperCase()}
                      </h3>
                      <p className="font-[var(--font-montserrat)] text-[14px] text-[#d0c5b9] mt-1 line-clamp-2">
                        {s.description}
                      </p>
                      <span className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#8E795E]">
                        {s.duration_min} MIN • {s.category}
                      </span>
                    </div>
                    <div
                      className="font-[var(--font-playfair)] text-[20px] shrink-0"
                      style={{ color: accent }}
                    >
                      {formatCurrency(Number(s.price), currency)}
                    </div>
                  </Link>
                ))
              )}
            </div>
            <div className="mt-10 text-center">
              <Link
                href={bookHref}
                className="btn-gold border px-8 py-3 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-block"
                style={{ borderColor: accent, color: accent }}
              >
                RESERVAR AHORA
              </Link>
            </div>
          </div>
        </section>

        <section
          id="barberos"
          className="py-[80px] md:py-[120px] px-5 md:px-16 max-w-[1280px] mx-auto"
        >
          <div className="text-center mb-10">
            <span
              className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold"
              style={{ color: accent }}
            >
              EL EQUIPO
            </span>
            <h2 className="font-[var(--font-playfair)] text-[32px] md:text-[48px] font-semibold text-white mt-3">
              Barberos {bizName}
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {emps.map((e) => (
              <div
                key={e.id}
                className="border p-6 text-center hover:bg-[#201f1f] transition-colors"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                  backgroundColor: '#121212',
                }}
              >
                <div
                  className="w-16 h-16 mx-auto flex items-center justify-center text-white font-bold border"
                  style={{
                    background: (e.color as string) || '#1a1a1a',
                    borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                  }}
                >
                  {e.name
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="mt-4 font-[var(--font-montserrat)] text-[13px] tracking-[0.1em] font-semibold text-white">
                  {e.name.toUpperCase()}
                </div>
                <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#8E795E] mt-1">
                  {(e.specialties as string[] | null)?.join(' • ') || 'BARBERO'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="area-cliente"
          className="py-[80px] md:py-[120px] px-5 md:px-16 max-w-[1280px] mx-auto border-y"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            backgroundColor: '#0e0e0e',
          }}
        >
          <div className="text-center mb-12">
            <span
              className="font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold block mb-4"
              style={{ color: accent }}
            >
              ÁREA CLIENTE
            </span>
            <h2 className="font-[var(--font-playfair)] text-[32px] md:text-[48px] font-semibold text-white leading-tight">
              Tu barbería, a un click.
            </h2>
            <p className="font-[var(--font-montserrat)] text-[16px] leading-6 text-[#d0c5b9] mt-4 max-w-2xl mx-auto">
              Reservá como siempre — invitado o con cuenta — y gestioná todo desde tu área privada.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className="border bg-[#121212] p-8 md:p-10 flex flex-col gap-4 hover:bg-[#1a1a1a] transition-colors"
              style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}
            >
              <div
                className="w-12 h-12 flex items-center justify-center border bg-[#1a1a1a]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                  color: accent,
                }}
              >
                <History className="w-6 h-6" />
              </div>
              <h3 className="font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-semibold text-white">
                HISTORIAL COMPLETO
              </h3>
              <p className="font-[var(--font-montserrat)] text-[14px] leading-6 text-[#d0c5b9]">
                Todas tus citas y compras en un solo lugar. Consultá fechas, barbero, servicio y
                estado.
              </p>
            </div>
            <div
              className="border bg-[#121212] p-8 md:p-10 flex flex-col gap-4 hover:bg-[#1a1a1a] transition-colors"
              style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}
            >
              <div
                className="w-12 h-12 flex items-center justify-center border bg-[#1a1a1a]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                  color: accent,
                }}
              >
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-semibold text-white">
                REPROGRAMÁ EN 1 CLICK
              </h3>
              <p className="font-[var(--font-montserrat)] text-[14px] leading-6 text-[#d0c5b9]">
                Cancelá o reprogramá con 30 min de antelación. Sin llamadas, sin fricción.
              </p>
            </div>
            <div
              className="border bg-[#121212] p-8 md:p-10 flex flex-col gap-4 hover:bg-[#1a1a1a] transition-colors"
              style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}
            >
              <div
                className="w-12 h-12 flex items-center justify-center border bg-[#1a1a1a]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                  color: accent,
                }}
              >
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-semibold text-white">
                SIN FRICCIÓN
              </h3>
              <p className="font-[var(--font-montserrat)] text-[14px] leading-6 text-[#d0c5b9]">
                ¿Ya reservaste como invitado? Al registrarte con el mismo email o teléfono reclamás
                tu historial automáticamente.
              </p>
            </div>
          </div>
          <div className="mt-12 flex flex-col md:flex-row items-center justify-center gap-4">
            <Link
              href="/client/login"
              className="btn-gold border px-8 py-3.5 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center justify-center w-full md:w-auto bg-transparent"
              style={{ borderColor: accent, color: accent }}
            >
              INGRESAR A MI CUENTA
            </Link>
            <Link
              href="/client/register"
              className="btn-outline-gold px-8 py-3.5 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-flex items-center justify-center w-full md:w-auto"
            >
              CREAR CUENTA
            </Link>
          </div>
          <p className="font-[var(--font-montserrat)] text-[12px] tracking-[0.05em] text-[#8E795E] text-center mt-6">
            El flujo público en{' '}
            <Link href={bookHref} className="hover:underline" style={{ color: accent }}>
              {bookHref}
            </Link>{' '}
            sigue funcionando para invitados si el dueño lo permite.
          </p>
        </section>

        <section className="py-[80px] md:py-[120px] relative overflow-hidden">
          <div className="absolute inset-0">
            <div
              className="w-full h-full bg-cover bg-center opacity-30"
              style={{
                backgroundImage: gallery[2]
                  ? `url('${gallery[2]}')`
                  : `image-set(url('/business-assets/${business.slug}/signature.avif') type('image/avif'), url('/business-assets/${business.slug}/signature.webp') type('image/webp'), url('/business-assets/${business.slug}/signature.jpg') type('image/jpeg'))`,
              }}
            />
            <div className="absolute inset-0" style={{ backgroundColor: `${brand}CC` }} />
          </div>
          <div className="relative z-10 max-w-[1280px] mx-auto px-5 md:px-16 text-center">
            <div
              className="inline-block border px-6 py-2 mb-8"
              style={{ borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
            >
              <span
                className="font-[var(--font-montserrat)] text-[12px] tracking-[0.3em] font-semibold"
                style={{ color: accent }}
              >
                LA EXPERIENCIA INSIGNIA
              </span>
            </div>
            <h2 className="font-[var(--font-playfair)] text-[32px] md:text-[48px] font-semibold text-white max-w-2xl mx-auto leading-tight">
              El máximo nivel de cuidado personal.
            </h2>
            <p className="font-[var(--font-montserrat)] text-[16px] leading-6 text-[#d0c5b9] mt-6 max-w-xl mx-auto">
              90 minutos: corte impecable, afeitado con navaja, toallas calientes, tratamiento
              facial y masaje capilar. Bebida premium incluida.
            </p>
            <Link
              href={bookHref}
              className="btn-gold mt-10 border px-8 py-3 font-[var(--font-montserrat)] text-[14px] tracking-[0.15em] font-medium inline-block"
              style={{ backgroundColor: '#121212', borderColor: accent, color: accent }}
            >
              RESERVAR EXPERIENCIA |{' '}
              {svc.find((s) => s.category === 'combo')
                ? formatCurrency(Number(svc.find((s) => s.category === 'combo')!.price), currency)
                : ''}
            </Link>
          </div>
        </section>

        <section
          id="location"
          className="py-[80px] px-5 md:px-16 max-w-[1280px] mx-auto grid md:grid-cols-3 gap-6"
        >
          {[
            { k: 'Horario', v: `${horario} • ${diasAbiertos}`, sub: `Cerrado domingos • ${tz}` },
            { k: 'Ubicación', v: bizAddress || bizName, sub: `${bizName} • ${tz}` },
            { k: 'Reserva', v: bizPhone || 'Online', sub: 'Sin registro • En línea 24/7' },
          ].map((c) => (
            <div
              key={c.k}
              className="border p-6"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                backgroundColor: '#121212',
              }}
            >
              <div
                className="font-[var(--font-montserrat)] text-[11px] tracking-[0.2em] font-semibold"
                style={{ color: accent }}
              >
                {c.k.toUpperCase()}
              </div>
              <div className="font-[var(--font-playfair)] text-lg text-white mt-2">{c.v}</div>
              <div className="font-[var(--font-montserrat)] text-[12px] text-[#d0c5b9] mt-1">
                {c.sub}
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer
        className="w-full py-12 border-t"
        style={{
          backgroundColor: '#0e0e0e',
          borderColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
        }}
      >
        <div className="flex flex-col md:flex-row justify-between items-center px-5 md:px-16 gap-8 w-full max-w-[1280px] mx-auto">
          <div className="font-[var(--font-playfair)] text-xl font-bold" style={{ color: accent }}>
            {bizName.toUpperCase()}
          </div>
          <div className="flex gap-8 font-[var(--font-montserrat)] text-[12px] tracking-[0.2em] font-semibold text-[#d0c5b9]">
            <Link href={bookHref} className="hover:text-[var(--accent)]">
              RESERVAR
            </Link>
            <Link href="/client/login" className="hover:text-[var(--accent)]">
              MI CUENTA
            </Link>
            {bizPhone && (
              <a
                href={waHref}
                target="_blank"
                className="hover:text-[var(--accent)]"
                rel="noopener"
              >
                WHATSAPP
              </a>
            )}
          </div>
          <div className="font-[var(--font-montserrat)] text-[11px] tracking-[0.15em] text-[#8E795E]">
            © 2026 {bizName.toUpperCase()} • {bizAddress.toUpperCase()} • {currency} • {tz}
          </div>
        </div>
      </footer>
    </div>
  )
}
