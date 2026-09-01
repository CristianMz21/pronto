import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans, Montserrat, Playfair_Display } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import styles from './landing.module.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-sans',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-playfair',
  display: 'swap',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pronto — Free Open Source POS, CRM & Booking for Service Businesses',
  description:
    'Pronto is a free, open-source POS, CRM, and appointment booking system for salons, barbershops, auto repair shops, cafes and any service SMB. Self-hosted or cloud. Zero commission. One command install.',
  keywords: [
    'open source POS',
    'self-hosted CRM',
    'appointment booking software',
    'salon management software',
    'barbershop software',
    'free POS system',
    'auto repair shop software',
    'small business management',
    'Telegram notifications',
    'WhatsApp booking',
  ],
  alternates: {
    canonical: 'https://trypronto.app/',
  },
  openGraph: {
    type: 'website',
    url: 'https://trypronto.app/',
    title: 'Pronto — Free Open Source POS & CRM for Service Businesses',
    description:
      'Self-hosted POS, CRM, Booking and Omnichannel notifications. Zero commission. One command install.',
    images: [{ url: 'https://trypronto.app/og-image.png' }],
    locale: 'en_US',
    siteName: 'Pronto',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pronto — Free Open Source POS & CRM for Service Businesses',
    description:
      'Self-hosted POS, CRM, Booking and Omnichannel notifications. Zero commission. One command install.',
    images: ['https://trypronto.app/og-image.png'],
  },
}

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Pronto',
  url: 'https://trypronto.app',
  description:
    'Free open-source POS, CRM, inventory and appointment booking for service businesses.',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, Linux, Windows, macOS',
  offers: [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Starter', price: '19', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Pro', price: '39', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Agency', price: '79', priceCurrency: 'USD' },
  ],
  isAccessibleForFree: true,
  license: 'https://opensource.org/licenses/MIT',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is Pronto really free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. The self-hosted version is free forever under MIT license with no limits. The cloud version has a free tier and paid plans from $19/month.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Pronto charge commission on bookings?',
      acceptedAnswer: { '@type': 'Answer', text: 'No. Zero commission on all bookings and sales.' },
    },
    {
      '@type': 'Question',
      name: 'Do clients need to register to book?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Just name and phone number — no account needed.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I install Pronto?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Run: docker compose up -d. Requires Docker on any Linux, Windows or macOS machine with 1GB RAM.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which messengers are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Email, Telegram, WhatsApp and Viber. LINE and SMS coming soon.',
      },
    },
  ],
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Pronto',
  url: 'https://trypronto.app',
  logo: 'https://trypronto.app/logo.png',
  sameAs: ['https://github.com/SGrappelli/pronto'],
}

// Premium Escudería landing — Obsidian & Gilt faithful to stitch template
function EscuderiaPremium() {
  return (
    <div
      className={`${playfair.variable} ${montserrat.variable} antialiased`}
      style={{ background: '#0A0A0A', color: '#ffffff', fontFamily: 'var(--font-montserrat)' }}
    >
      <style>{`
        .esc-nav-link { position: relative; }
        .esc-nav-link::after {
          content: '';
          position: absolute;
          width: 0; height: 1px;
          bottom: -2px; left: 50%;
          background-color: #C5A059;
          transition: all 0.3s ease;
          transform: translateX(-50%);
        }
        .esc-nav-link:hover::after { width: 100%; }
        .esc-service-item { border-bottom: 1px dashed rgba(142,121,94,0.2); }
        .esc-service-item:last-child { border-bottom: none; }
      `}</style>

      {/* TopNavBar — fixed, glass, Obsidian & Gilt */}
      <nav className="fixed top-0 w-full z-50 bg-[#0A0A0A]/40 backdrop-blur-xl border-b border-[#8E795E]/20">
        <div className="flex justify-between items-center px-5 md:px-16 h-20 w-full mx-auto max-w-[1280px]">
          <Link
            href="/"
            className="flex items-center gap-3 shrink-0"
            style={{
              fontFamily: 'var(--font-playfair)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/business-assets/escuderia/icono.svg"
              alt="Escudería"
              className="w-8 h-8 object-contain"
              width={32}
              height={32}
            />
            <span
              className="text-[22px] md:text-[26px] font-bold text-[#C5A059] tracking-tight"
              style={{ fontFamily: 'var(--font-playfair)' }}
            >
              ESCUDERÍA
            </span>
          </Link>

          <ul className="hidden md:flex gap-8 items-center">
            <li>
              <a
                href="#experience"
                className="esc-nav-link text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                EXPERIENCE
              </a>
            </li>
            <li>
              <a
                href="#services"
                className="esc-nav-link text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                SERVICES
              </a>
            </li>
            <li>
              <a
                href="#gallery"
                className="esc-nav-link text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                GALLERY
              </a>
            </li>
            <li>
              <a
                href="#location"
                className="esc-nav-link text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                LOCATION
              </a>
            </li>
          </ul>

          <div className="flex items-center gap-3">
            <Link
              href="/book/escuderia"
              className="hidden md:inline-flex border border-[#C5A059] text-[#C5A059] px-6 py-3 text-[14px] font-medium tracking-[0.15em] hover:bg-[#C5A059] hover:text-black transition-colors duration-300"
              style={{ fontFamily: 'var(--font-montserrat)', borderRadius: 0 }}
            >
              BOOK NOW
            </Link>
            {/* Mobile menu icon — visible only on mobile, matches template */}
            <button
              aria-label="Open Menu"
              className="md:hidden text-[#d0c5b9] p-2 hover:text-[#C5A059] transition-colors"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero — faithful to Template: cinematic bg opacity-60 + gradient, centered title */}
        <section className="relative h-screen min-h-[640px] w-full flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 w-full h-full">
            {/* Local hero image — opacity 60 as in template */}
            <Image
              src="/business-assets/escuderia/hero-1.jpeg"
              alt="Barbero de Escudería trabajando con precisión"
              fill
              priority
              className="object-cover opacity-60"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/20 to-transparent" />
            <div className="absolute inset-0 bg-[#0A0A0A]/10" />
          </div>

          <div className="relative z-10 flex flex-col items-center text-center px-5 md:px-16 max-w-[1280px] mx-auto mt-20">
            <h1
              className="text-white mb-6 max-w-3xl"
              style={{
                fontFamily: 'var(--font-playfair)',
                fontSize: 'clamp(36px, 7vw, 72px)',
                lineHeight: '1.05',
                letterSpacing: '-0.02em',
                fontWeight: 700,
              }}
            >
              Tu estilo. Nuestra precisión.
            </h1>
            <p
              className="mb-10 max-w-xl mx-auto text-[#d0c5b9]"
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '18px',
                lineHeight: '28px',
                letterSpacing: '0.01em',
              }}
            >
              Barbería contemporánea para hombres que entienden que los detalles hacen la
              diferencia.
            </p>
            <Link
              href="/book/escuderia"
              className="group inline-flex items-center gap-3 border border-[#C5A059] text-[#C5A059] px-10 py-4 text-[14px] font-medium tracking-[0.15em] hover:bg-[#C5A059] hover:text-black transition-colors duration-300 bg-transparent"
              style={{ fontFamily: 'var(--font-montserrat)', borderRadius: 0 }}
            >
              RESERVAR CITA
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </section>

        {/* Experience — Editorial Asymmetry: text + two grayscale images */}
        <section
          id="experience"
          className="py-20 md:py-[120px] px-5 md:px-16 max-w-[1280px] mx-auto"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-5">
              <span
                className="block mb-4 text-[#C5A059] text-[12px] font-semibold tracking-[0.2em]"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                EL ENTORNO
              </span>
              <h2
                className="text-white mb-6"
                style={{
                  fontFamily: 'var(--font-playfair)',
                  fontSize: 'clamp(32px, 4vw, 48px)',
                  lineHeight: '1.15',
                  fontWeight: 600,
                }}
              >
                Mucho más que una barbería.
              </h2>
              <p
                className="text-[#d0c5b9] mb-8"
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '16px',
                  lineHeight: '26px',
                }}
              >
                Diseñado como un santuario para el caballero moderno. Nuestro espacio combina
                texturas crudas —cuero envejecido, acero oscuro y maderas nobles— con una atmósfera
                de absoluta privacidad y confort. Un ritual donde el tiempo se detiene.
              </p>
              <Link
                href="/book/escuderia"
                className="inline-flex border-b border-[#8E795E] pb-1 text-white hover:text-[#C5A059] hover:border-[#C5A059] transition-colors text-[14px] font-medium tracking-[0.15em]"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                DESCUBRIR EXPERIENCIA
              </Link>
            </div>

            <div className="md:col-span-7 grid grid-cols-2 gap-4 h-[520px] md:h-[600px]">
              <div className="col-span-1 h-full pt-12">
                <div className="relative w-full h-full overflow-hidden border border-[#8E795E]/10">
                  <Image
                    src="/business-assets/escuderia/chair.jpeg"
                    alt="Sillón de cuero premium Escudería"
                    fill
                    className="object-cover grayscale hover:grayscale-0 transition-all duration-700"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </div>
              </div>
              <div className="col-span-1 h-full pb-12">
                <div className="relative w-full h-full overflow-hidden border border-[#8E795E]/10">
                  <Image
                    src="/business-assets/escuderia/tools.jpeg"
                    alt="Herramientas profesionales de barbería"
                    fill
                    className="object-cover grayscale hover:grayscale-0 transition-all duration-700"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Services — Restaurant Menu Style */}
        <section id="services" className="py-20 md:py-[120px] px-5 md:px-16 bg-[#0e0e0e]">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <span
                className="block mb-4 text-[#C5A059] text-[12px] font-semibold tracking-[0.2em]"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                MENÚ DE SERVICIOS
              </span>
              <h2
                className="text-white"
                style={{
                  fontFamily: 'var(--font-playfair)',
                  fontSize: 'clamp(32px, 4vw, 48px)',
                  lineHeight: '1.15',
                  fontWeight: 600,
                }}
              >
                El ritual comienza aquí.
              </h2>
            </div>

            <div className="flex flex-col">
              <div className="esc-service-item py-6 flex justify-between items-baseline gap-6 group">
                <div className="pr-4">
                  <h3
                    className="text-white group-hover:text-[#C5A059] transition-colors text-[14px] font-medium tracking-[0.12em]"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    CORTE CLÁSICO
                  </h3>
                  <p
                    className="mt-2 text-[#d0c5b9] text-[14px] leading-6"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    Asesoría de imagen, lavado, corte a tijera o máquina, y peinado final.
                  </p>
                </div>
                <div
                  className="shrink-0 text-[#C5A059] text-[20px] font-medium"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  $30.000
                </div>
              </div>

              <div className="esc-service-item py-6 flex justify-between items-baseline gap-6 group">
                <div className="pr-4">
                  <h3
                    className="text-white group-hover:text-[#C5A059] transition-colors text-[14px] font-medium tracking-[0.12em]"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    CORTE + BARBA
                  </h3>
                  <p
                    className="mt-2 text-[#d0c5b9] text-[14px] leading-6"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    El servicio completo. Corte preciso y arreglo de barba con toalla caliente.
                  </p>
                </div>
                <div
                  className="shrink-0 text-[#C5A059] text-[20px] font-medium"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  $45.000
                </div>
              </div>

              <div className="esc-service-item py-6 flex justify-between items-baseline gap-6 group">
                <div className="pr-4">
                  <h3
                    className="text-white group-hover:text-[#C5A059] transition-colors text-[14px] font-medium tracking-[0.12em]"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    BARBA PREMIUM
                  </h3>
                  <p
                    className="mt-2 text-[#d0c5b9] text-[14px] leading-6"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    Diseño y perfilado, vapor ozono, toalla caliente y aceites esenciales.
                  </p>
                </div>
                <div
                  className="shrink-0 text-[#C5A059] text-[20px] font-medium"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  $30.000
                </div>
              </div>

              <div className="esc-service-item py-6 flex justify-between items-baseline gap-6 group">
                <div className="pr-4">
                  <h3
                    className="text-white group-hover:text-[#C5A059] transition-colors text-[14px] font-medium tracking-[0.12em]"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    CAMUFLAJE DE CANAS
                  </h3>
                  <p
                    className="mt-2 text-[#d0c5b9] text-[14px] leading-6"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    Coloración sutil y natural para un aspecto rejuvenecido sin perder masculinidad.
                  </p>
                </div>
                <div
                  className="shrink-0 text-[#C5A059] text-[20px] font-medium"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  $80.000
                </div>
              </div>
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/book/escuderia"
                className="inline-flex border-b border-[#8E795E] pb-1 text-white hover:text-[#C5A059] hover:border-[#C5A059] transition-colors text-[14px] font-medium tracking-[0.15em]"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                VER TODOS LOS SERVICIOS
              </Link>
            </div>
          </div>
        </section>

        {/* Signature Experience — opacity 30 bg + centered card */}
        <section id="gallery" className="py-20 md:py-[120px] relative overflow-hidden">
          <div className="absolute inset-0 w-full h-full z-0">
            <Image
              src="/business-assets/escuderia/hero-2.png"
              alt="Experiencia signature Escudería"
              fill
              className="object-cover opacity-30"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-[#0A0A0A]/80" />
          </div>

          <div className="relative z-10 max-w-[1280px] mx-auto px-5 md:px-16 text-center">
            <div className="inline-block border border-[#C5A059]/30 px-6 py-2 mb-8">
              <span
                className="text-[#C5A059] text-[12px] font-semibold tracking-[0.3em]"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                THE SIGNATURE EXPERIENCE
              </span>
            </div>

            <h2
              className="text-white mb-6 max-w-2xl mx-auto"
              style={{
                fontFamily: 'var(--font-playfair)',
                fontSize: 'clamp(32px, 5vw, 48px)',
                lineHeight: '1.15',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              El máximo nivel de cuidado personal.
            </h2>

            <p
              className="text-[#d0c5b9] mb-10 max-w-xl mx-auto"
              style={{ fontFamily: 'var(--font-montserrat)', fontSize: '18px', lineHeight: '28px' }}
            >
              Una inmersión total de 90 minutos. Incluye corte impecable, afeitado tradicional con
              navaja y toallas calientes, tratamiento facial express, exfoliación y masaje capilar,
              acompañado de su bebida premium de elección.
            </p>

            <Link
              href="/book/escuderia"
              className="inline-block border border-[#C5A059] text-[#C5A059] px-8 py-3 text-[14px] font-medium tracking-[0.15em] hover:bg-[#C5A059] hover:text-black transition-colors duration-300 bg-[#121212]"
              style={{ fontFamily: 'var(--font-montserrat)', borderRadius: 0 }}
            >
              RESERVAR EXPERIENCIA | $70.000
            </Link>

            <div
              className="mt-6 flex justify-center items-center gap-3 text-[#8E795E] text-[12px] tracking-[0.2em]"
              style={{ fontFamily: 'var(--font-montserrat)' }}
            >
              <span>90 MIN</span>
              <span className="w-1 h-1 bg-[#8E795E] rounded-full inline-block" />
              <span>VIP</span>
            </div>
          </div>
        </section>

        {/* Location — Obsidian style, keeps previous info but premium */}
        <section
          id="location"
          className="py-16 md:py-20 px-5 md:px-16 max-w-[1280px] mx-auto border-t border-[#8E795E]/10"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7">
              <span
                className="block mb-4 text-[#C5A059] text-[12px] font-semibold tracking-[0.2em]"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                UBICACIÓN
              </span>
              <h3
                className="text-white mb-4"
                style={{
                  fontFamily: 'var(--font-playfair)',
                  fontSize: '32px',
                  lineHeight: '40px',
                  fontWeight: 500,
                }}
              >
                Centro y Norte — Bogotá
              </h3>
              <p
                className="text-[#d0c5b9] leading-7 text-[14px] mb-6"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                Lun–Sáb 09:00–20:00 · Dom cerrado · Break 13:00–14:00
                <br />
                <span className="text-[#8E795E]">
                  Escudería Centro — Cra 7 #12-34 · +57 300 123 4567
                </span>
                <br />
                <span className="text-[#8E795E]">
                  Escudería Norte — Cl 100 #15-20 · +57 301 987 6543
                </span>
              </p>
              <div className="flex gap-3 flex-wrap">
                <a
                  href="https://maps.google.com/?q=Cra+7+%2312-34+Bogotá"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white text-[#0A0A0A] px-5 py-2.5 text-[13px] font-semibold hover:bg-[#C5A059] transition-colors"
                  style={{ fontFamily: 'var(--font-montserrat)', borderRadius: 0 }}
                >
                  Cómo llegar
                </a>
                <a
                  href="https://wa.me/573001234567"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-white/20 text-white px-5 py-2.5 text-[13px] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors"
                  style={{ fontFamily: 'var(--font-montserrat)', borderRadius: 0 }}
                >
                  WhatsApp
                </a>
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="bg-[#121212] border border-[#C5A059]/20 p-8 text-center">
                <div
                  className="text-[#C5A059] text-[12px] font-semibold tracking-[0.15em] mb-3"
                  style={{ fontFamily: 'var(--font-montserrat)' }}
                >
                  ¿LISTO?
                </div>
                <div
                  className="text-white text-[22px] font-semibold mb-3"
                  style={{ fontFamily: 'var(--font-playfair)' }}
                >
                  Reserva en 30 segundos
                </div>
                <div
                  className="text-[#8E795E] text-[13px] mb-6"
                  style={{ fontFamily: 'var(--font-montserrat)' }}
                >
                  Sin registro. Elige servicio, barbero y hora.
                </div>
                <Link
                  href="/book/escuderia"
                  className="inline-block bg-[#C5A059] text-black px-8 py-3 text-[14px] font-semibold tracking-[0.08em] hover:bg-white transition-colors"
                  style={{ fontFamily: 'var(--font-montserrat)', borderRadius: 0 }}
                >
                  Reservar ahora →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer — THE RITUAL style → ESCUDERÍA */}
      <footer className="w-full py-16 bg-[#0e0e0e] border-t border-[#8E795E]/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-5 md:px-16 gap-8 w-full max-w-[1280px] mx-auto">
          <Link
            href="/"
            className="flex items-center gap-2 text-[#C5A059]"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/business-assets/escuderia/icono.svg"
              alt=""
              className="w-7 h-7 object-contain opacity-80"
              width={28}
              height={28}
            />
            <span className="text-[22px] font-bold tracking-tight">ESCUDERÍA</span>
          </Link>

          <ul className="flex flex-wrap justify-center gap-8">
            <li>
              <a
                href="#"
                className="text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                PRIVACIDAD
              </a>
            </li>
            <li>
              <a
                href="#"
                className="text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                TÉRMINOS
              </a>
            </li>
            <li>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                INSTAGRAM
              </a>
            </li>
            <li>
              <Link
                href="/book/escuderia"
                className="text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9] hover:text-[#C5A059] transition-colors"
                style={{ fontFamily: 'var(--font-montserrat)' }}
              >
                RESERVAR
              </Link>
            </li>
          </ul>

          <div
            className="text-[12px] font-semibold tracking-[0.2em] text-[#d0c5b9]/60 text-center md:text-right"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          >
            © 2026 ESCUDERÍA. ALL RIGHTS RESERVED.
          </div>
        </div>
      </footer>
    </div>
  )
}

export default async function RootPage() {
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas') {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { getAdminSecretPath } = await import('@/lib/admin-secret')
        redirect(getAdminSecretPath())
      }
    } catch {}
    return <EscuderiaPremium />
  }

  return (
    <div className={`${styles.page} ${bricolage.variable} ${dmSans.variable}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />

      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>
          Pronto<span>.</span>
        </Link>
        <div className={styles.navRight}>
          <Link href="/login" className={styles.navLink}>
            Sign in
          </Link>
          <Link href="/es/" className={`${styles.navLink} lang-switcher`}>
            ES
          </Link>
          <Link href="/register" className={styles.btnNav}>
            Start free
          </Link>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className={styles.hero}>
          <h1>
            Stop paying
            <br />
            <em>20% commission</em>
            <br />
            on your own clients
          </h1>
          <p className={styles.heroDesc}>
            POS · CRM · Booking · Inventory · Omnichannel notifications — for any service business.
            Self-hosted or cloud, your choice.
          </p>
        </section>

        {/* EVERYTHING IN ONE PLACE */}
        <section className={`${styles.sec} ${styles.secWhite}`}>
          <div className={styles.secHead}>
            <h2>Everything in one place</h2>
            <p>
              Works the same whether you self-host or use our cloud. No integrations needed. No
              plugins. No transaction fees.
            </p>
          </div>
          <div className={styles.bizTags}>
            <span className={`${styles.bizTag} ${styles.bt1}`}>Beauty salons</span>
            <span className={`${styles.bizTag} ${styles.bt2}`}>Barbershops</span>
            <span className={`${styles.bizTag} ${styles.bt3}`}>Auto repair shops</span>
            <span className={`${styles.bizTag} ${styles.bt4}`}>Cafes</span>
            <span className={`${styles.bizTag} ${styles.bt5}`}>Dental clinics</span>
            <span className={`${styles.bizTag} ${styles.bt6}`}>Fitness clubs</span>
            <span className={`${styles.bizTag} ${styles.bt7}`}>Massage &amp; spa</span>
            <span className={`${styles.bizTag} ${styles.bt8}`}>And any other service SMB</span>
          </div>
          <div className={styles.cardsWrap}>
            <div className={styles.featGrid}>
              <div className={styles.featCard}>
                <h4>POS / Checkout</h4>
                <p>Complete a sale in 3 clicks. Cash, card, transfer. Works fully offline.</p>
              </div>
              <div className={styles.featCard}>
                <h4>CRM</h4>
                <p>Full client history — visits, spending, tags, birthday, notes.</p>
              </div>
              <div className={styles.featCard}>
                <h4>Inventory</h4>
                <p>Track stock levels. Low-stock alerts via all notification channels.</p>
              </div>
              <div className={styles.featCard}>
                <h4>Booking calendar</h4>
                <p>Week view, drag &amp; drop. No double-booking at database level.</p>
              </div>
              <div className={styles.featCard}>
                <h4>Online booking</h4>
                <p>
                  Public page — clients book with just a name &amp; phone. No registration required.
                </p>
              </div>
              <div className={styles.featCard}>
                <h4>PWA</h4>
                <p>Install on any device directly from the browser. Works offline.</p>
              </div>
            </div>
          </div>
        </section>

        {/* BUILT FOR SERVICE BUSINESSES */}
        <section className={`${styles.sec} ${styles.secWarm}`}>
          <div className={styles.secHead}>
            <h2>Built for service businesses</h2>
            <p>Replacing Excel, manual reminders, and expensive platforms that own your clients.</p>
          </div>
          <div className={styles.cardsWrap}>
            <div className={styles.painGrid}>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>From</div>
                <div className={styles.painFromText}>Excel spreadsheets</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>CRM + POS in one interface</div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>From</div>
                <div className={styles.painFromText}>Manual reminders</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>
                  Auto-notifications via Telegram, WhatsApp, Viber, Email
                </div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>From</div>
                <div className={styles.painFromText}>Platform takes 20%</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>Clients book directly — 0% commission</div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>From</div>
                <div className={styles.painFromText}>ERPNext too complex</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>UI anyone can learn in 10 minutes</div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>From</div>
                <div className={styles.painFromText}>No analytics</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>Revenue dashboard, LTV, top services</div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>From</div>
                <div className={styles.painFromText}>Client data locked in platform</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>Self-hosted: data stays on your server</div>
              </div>
            </div>
          </div>
        </section>

        {/* OMNICHANNEL NOTIFICATIONS */}
        <section className={`${styles.sec} ${styles.secBlue}`}>
          <div className={styles.secHead}>
            <h2>Omnichannel notifications</h2>
            <p>
              The only open-source POS with all four channels built in — no plugins, no complex
              setup.
            </p>
          </div>
          <div className={styles.channelRow}>
            <div className={styles.channel}>
              <span className={`${styles.dot} ${styles.dotGreen}`}></span>Email
            </div>
            <div className={styles.channel}>
              <span className={`${styles.dot} ${styles.dotBlue}`}></span>Telegram
            </div>
            <div className={styles.channel}>
              <span className={`${styles.dot} ${styles.dotGreen}`}></span>WhatsApp
            </div>
            <div className={styles.channel}>
              <span className={`${styles.dot} ${styles.dotPurple}`}></span>Viber
            </div>
            <div className={`${styles.channel} ${styles.soon}`}>
              <span className={`${styles.dot} ${styles.dotGray}`}></span>LINE{' '}
              <span className={styles.badgeSoon}>Coming soon</span>
            </div>
            <div className={`${styles.channel} ${styles.soon}`}>
              <span className={`${styles.dot} ${styles.dotGray}`}></span>SMS{' '}
              <span className={styles.badgeSoon}>Coming soon</span>
            </div>
          </div>
          <div className={styles.cardsWrap}>
            <div className={styles.notifGrid}>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Booking confirmed</div>
                <div className={styles.evSub}>Sent immediately after booking</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Appointment reminder</div>
                <div className={styles.evSub}>24h and 1h before visit</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Thank you message</div>
                <div className={styles.evSub}>2 hours after visit</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Re-activation</div>
                <div className={styles.evSub}>&ldquo;Haven&rsquo;t seen you in 30 days&rdquo;</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Birthday greeting</div>
                <div className={styles.evSub}>Sent automatically</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Low stock alert</div>
                <div className={styles.evSub}>To business owner</div>
              </div>
            </div>
          </div>
        </section>

        {/* TWO WAYS TO RUN PRONTO */}
        <section className={`${styles.sec} ${styles.secWhite}`}>
          <div className={styles.secHead}>
            <h2>Two ways to run Pronto</h2>
            <p>Pick what fits your business. Switch anytime.</p>
          </div>
          <div className={styles.twoPaths}>
            {/* SELF-HOSTED */}
            <div className={`${styles.pathCard} ${styles.self}`}>
              <div className={styles.pathLabel}>Option 1</div>
              <h3>Self-hosted</h3>
              <p className={styles.pathDesc}>
                Deploy on your own server. Your data never leaves your machine. Free forever.
                Requires Docker.
              </p>
              <div className={styles.shHighlights}>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>$0</div>
                  <div className={styles.shHlLabel}>Forever free</div>
                </div>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>0%</div>
                  <div className={styles.shHlLabel}>Commission</div>
                </div>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>∞</div>
                  <div className={styles.shHlLabel}>No limits</div>
                </div>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>1</div>
                  <div className={styles.shHlLabel}>Command</div>
                </div>
              </div>
              <div className={styles.pathPoints}>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Your data, your server</strong> — client base lives only on your machine
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>MIT license</strong> — modify, extend, white-label freely
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Any infrastructure</strong> — Linux VPS, Windows, macOS. 1 GB RAM
                    minimum
                  </div>
                </div>
              </div>
              <div className={styles.codeBlock}>
                <span className={styles.codePrefix}>$</span>docker compose up -d
              </div>
              <br />
              <a
                href="https://github.com/SGrappelli/pronto"
                className={styles.btnOutline}
                style={{ marginTop: '16px' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub →
              </a>
              <Link href="/docs" className={styles.btnOutline} style={{ marginTop: '16px' }}>
                Documentation →
              </Link>
            </div>

            {/* CLOUD */}
            <div className={`${styles.pathCard} ${styles.cloud}`}>
              <div className={styles.pathLabel}>Option 2</div>
              <h3>Cloud — trypronto.app</h3>
              <p className={styles.pathDesc}>
                No server needed. Ready in 5 minutes. Your own subdomain. We handle updates,
                backups, and infrastructure.
              </p>
              <div className={styles.trialBanner}>
                <div className={styles.trialBig}>14 days free</div>
                <div>
                  <div className={styles.trialText}>Try any paid plan free for 14 days.</div>
                  <div className={styles.trialNote}>No credit card required. Cancel anytime.</div>
                </div>
              </div>
              <div className={styles.pathPoints}>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Ready in minutes</strong> — register, onboard, get your subdomain
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Your own subdomain</strong> — salon-maya.trypronto.app or custom domain
                    on Pro+
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>We handle everything</strong> — updates, backups, uptime monitoring
                  </div>
                </div>
              </div>
              <Link href="/register" className={styles.btnPrimary}>
                Start free — no credit card
              </Link>
            </div>
          </div>

          {/* PRICING TABLE */}
          <div className={styles.plansWrap}>
            <div className={styles.plansTitle}>Cloud pricing</div>
            <div className={styles.plans}>
              <div className={styles.plan}>
                <div className={styles.planName}>Free</div>
                <div className={styles.planPrice}>$0</div>
                <span className={styles.planTrialFree}>Free forever</span>
                <div className={styles.planLimit}>1 employee · 100 clients</div>
                <ul className={styles.planFeats}>
                  <li>POS + CRM + Inventory</li>
                  <li>Email notifications</li>
                  <li>Online booking page</li>
                </ul>
              </div>
              <div className={styles.plan}>
                <div className={styles.planName}>Starter</div>
                <div className={styles.planPrice}>
                  $19<span>/mo</span>
                </div>
                <div className={styles.planTrial}>14-day free trial</div>
                <div className={styles.planLimit}>3 employees · 1 000 clients</div>
                <ul className={styles.planFeats}>
                  <li>+ Telegram &amp; WhatsApp</li>
                  <li>+ Online booking</li>
                </ul>
              </div>
              <div className={`${styles.plan} ${styles.featured}`}>
                <div className={styles.planPopular}>Most popular</div>
                <div className={styles.planName}>Pro</div>
                <div className={styles.planPrice}>
                  $39<span>/mo</span>
                </div>
                <div className={styles.planTrial}>14-day free trial</div>
                <div className={styles.planLimit}>15 employees · unlimited</div>
                <ul className={styles.planFeats}>
                  <li>+ Viber notifications</li>
                  <li>
                    + Analytics <span className={styles.badgeSoon}>Coming soon</span>
                  </li>
                  <li>+ Custom domain</li>
                  <li>
                    + Loyalty program <span className={styles.badgeSoon}>Coming soon</span>
                  </li>
                </ul>
              </div>
              <div className={styles.plan}>
                <div className={styles.planName}>Agency</div>
                <div className={styles.planPrice}>
                  $79<span>/mo</span>
                </div>
                <div className={styles.planTrial}>14-day free trial</div>
                <div className={styles.planLimit}>Multiple locations</div>
                <ul className={styles.planFeats}>
                  <li>+ White-label</li>
                  <li>
                    + API access <span className={styles.badgeSoon}>Coming soon</span>
                  </li>
                  <li>+ Priority support</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FAQ */}
      <section className={styles.faq}>
        <div className={styles.faqInner}>
          <h2>Frequently asked questions</h2>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Is Pronto really free?</div>
            <div className={styles.faqA}>
              Yes. The self-hosted version is free forever under MIT license — no limits on clients,
              staff, or features. The cloud version has a free tier and paid plans from $19/month
              with a 14-day free trial.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Does Pronto charge commission on bookings?</div>
            <div className={styles.faqA}>
              No. Zero commission on all bookings and sales. Clients book directly with your
              business — no marketplace, no middleman.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Do clients need to create an account to book?</div>
            <div className={styles.faqA}>
              No. The public booking page only requires a name and phone number. No registration, no
              password, no app to download.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>How do I install the self-hosted version?</div>
            <div className={styles.faqA}>
              You need Docker on any Linux VPS, Windows, or macOS machine with at least 1 GB RAM.
              Run{' '}
              <code
                style={{
                  background: '#f3f4f6',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '13px',
                }}
              >
                docker compose up -d
              </code>{' '}
              and the app starts automatically.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>Which messaging apps are supported?</div>
            <div className={styles.faqA}>
              Currently Email, Telegram, WhatsApp (via Meta Cloud API), and Viber. LINE and SMS are
              coming soon.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>What types of businesses can use Pronto?</div>
            <div className={styles.faqA}>
              Any service business: beauty salons, barbershops, auto repair shops, cafes, dental
              clinics, fitness clubs, massage and spa — and anything else where clients book
              appointments or pay for services.
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          Pronto<span>.</span>
        </div>
        <div className={styles.footerCopy}>© 2026 Pronto. All rights reserved.</div>
        <div className={styles.footerLinks}>
          <Link href="/">Home</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund">Refund policy</Link>
          <a href="https://github.com/SGrappelli/pronto" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
