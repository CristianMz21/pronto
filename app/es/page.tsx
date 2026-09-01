import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans, Montserrat, Playfair_Display } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import styles from '../landing.module.css'

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
  title: 'Pronto — Software Gratis de POS, CRM y Reservas para Negocios de Servicios',
  description:
    'Pronto es un software gratuito y de código abierto para negocios de servicios: POS, CRM, reservas en línea e inventario. Sin comisiones. Instala en tu servidor o usa la nube.',
  keywords: [
    'software para salón de belleza',
    'sistema POS gratis',
    'software de gestión para negocios',
    'CRM para pequeños negocios',
    'reservas en línea sin comisión',
    'software para spa',
    'sistema de citas gratis',
    'software para barbería',
    'gestión de clientes WhatsApp Telegram',
    'software código abierto negocios servicios',
  ],
  alternates: {
    canonical: 'https://trypronto.app/es/',
    languages: {
      en: 'https://trypronto.app/',
      es: 'https://trypronto.app/es/',
      'x-default': 'https://trypronto.app/',
    },
  },
  openGraph: {
    type: 'website',
    url: 'https://trypronto.app/es/',
    title: 'Pronto — Software Gratis de POS, CRM y Reservas para Negocios de Servicios',
    description:
      'POS, CRM, reservas y notificaciones omnicanal para cualquier negocio de servicios. Sin comisiones. Una sola instalación.',
    images: [{ url: 'https://trypronto.app/og-image-es.png' }],
    locale: 'es_ES',
    siteName: 'Pronto',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pronto — Software Gratis de POS, CRM y Reservas para Negocios de Servicios',
    description:
      'POS, CRM, reservas y notificaciones omnicanal para cualquier negocio de servicios. Sin comisiones. Una sola instalación.',
    images: ['https://trypronto.app/og-image-es.png'],
  },
}

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Pronto',
  url: 'https://trypronto.app/es/',
  description:
    'Software gratuito y de código abierto para negocios de servicios: POS, CRM, reservas en línea, inventario y notificaciones automáticas por WhatsApp, Telegram, Viber y Email.',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, Linux, Windows, macOS',
  offers: [
    { '@type': 'Offer', name: 'Gratis', price: '0', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Starter', price: '19', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Pro', price: '39', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Agency', price: '79', priceCurrency: 'USD' },
  ],
  isAccessibleForFree: true,
  license: 'https://opensource.org/licenses/MIT',
  inLanguage: 'es',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '¿Pronto es realmente gratuito?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sí. La versión self-hosted es gratuita para siempre bajo licencia MIT, sin límites de clientes, empleados ni funciones. La versión en la nube tiene un plan gratuito y planes de pago desde $19 al mes con 14 días de prueba gratis.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Pronto cobra comisión por las reservas?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Cero comisión en todas las reservas y ventas. Tus clientes reservan directamente contigo, sin marketplace ni intermediarios.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Los clientes necesitan crear una cuenta para reservar?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. La página de reservas solo pide nombre y teléfono. Sin registro, sin contraseña, sin aplicación que descargar.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Cómo instalo Pronto en mi propio servidor?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Necesitas Docker en cualquier servidor Linux, Windows o macOS con al menos 1 GB de RAM. Ejecuta: docker compose up -d y la aplicación se inicia automáticamente.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Qué canales de mensajería están disponibles?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Email, Telegram, WhatsApp y Viber. LINE y SMS próximamente.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Para qué tipo de negocios sirve Pronto?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Para cualquier negocio de servicios: salones de belleza, barberías, talleres de autos, cafeterías, clínicas dentales, gimnasios, spas, estudios de tatuajes y cualquier otro negocio donde los clientes reserven citas o paguen por servicios.',
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
        <section className="relative h-screen min-h-[640px] w-full flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 w-full h-full">
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

        <section id="barbers" className="py-20 md:py-[120px] px-5 md:px-16 max-w-[1280px] mx-auto">
          <div className="text-center mb-12">
            <span
              className="block mb-4 text-[#C5A059] text-[12px] font-semibold tracking-[0.2em]"
              style={{ fontFamily: 'var(--font-montserrat)' }}
            >
              EL EQUIPO
            </span>
            <h2
              className="text-white text-[32px] md:text-[48px] font-semibold mb-4"
              style={{ fontFamily: 'var(--font-playfair)', lineHeight: 1.1 }}
            >
              Maestros del ritual.
            </h2>
            <p
              className="text-[#d0c5b9] max-w-xl mx-auto"
              style={{ fontFamily: 'var(--font-montserrat)' }}
            >
              Tres escuderos, un mismo estándar. Elige tu favorito o deja que asignemos al
              disponible.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Carlos',
                role: 'Fade · Corte clásico',
                exp: '247 servicios',
                img: '/business-assets/escuderia/barber-1.jpeg',
                rating: '4.9',
              },
              {
                name: 'Andrés',
                role: 'Barba · Afeitado',
                exp: '189 servicios',
                img: '/business-assets/escuderia/barber-2.jpeg',
                rating: '4.8',
              },
              {
                name: 'Sofía',
                role: 'Color · Cejas',
                exp: '203 servicios',
                img: '/business-assets/escuderia/chair.jpeg',
                rating: '4.9',
              },
            ].map((b) => (
              <div
                key={b.name}
                className="bg-[#121212] border border-[#8E795E]/20 overflow-hidden group"
              >
                <div className="relative h-64 overflow-hidden">
                  <Image
                    src={b.img}
                    alt={b.name}
                    fill
                    className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 bg-[#C5A059] text-black text-[11px] font-bold px-2 py-1 tracking-[0.08em]">
                    ★ {b.rating}
                  </div>
                </div>
                <div className="p-6 text-center">
                  <div
                    className="text-white font-semibold text-[18px]"
                    style={{ fontFamily: 'var(--font-playfair)' }}
                  >
                    {b.name}
                  </div>
                  <div
                    className="text-[#8E795E] text-[12px] tracking-[0.14em] mt-1"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                  >
                    {b.role} · {b.exp}
                  </div>
                  <Link
                    href="/book/escuderia"
                    className="mt-4 inline-block border border-[#C5A059]/30 text-[#C5A059] px-6 py-2 text-[12px] font-semibold tracking-[0.14em] hover:bg-[#C5A059] hover:text-black transition-colors"
                    style={{ fontFamily: 'var(--font-montserrat)', borderRadius: 0 }}
                  >
                    RESERVAR CON {b.name.toUpperCase()}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="gallery" className="py-20 md:py-[120px] relative overflow-hidden">
          <div className="absolute inset-0 w-full h-full z-0">
            <Image
              src="/business-assets/escuderia/hero-2.jpeg"
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
            © 2026 ESCUDERÍA. TODOS LOS DERECHOS RESERVADOS.
          </div>
        </div>
      </footer>
    </div>
  )
}

export default async function EsPage() {
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
          <Link href="/es/precios" className={`${styles.navLink} ${styles.hideMob}`}>
            Precios
          </Link>
          <Link href="/login" className={styles.navLink}>
            Iniciar sesión
          </Link>
          <Link href="/" className={`${styles.navLink} lang-switcher`}>
            EN
          </Link>
          <Link href="/register" className={styles.btnNav}>
            Empezar gratis
          </Link>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className={styles.hero}>
          <h1>
            Deja de pagar
            <br />
            <em>20% de comisión</em>
            <br />
            por tus propios clientes
          </h1>
          <p className={styles.heroDesc}>
            POS · CRM · Reservas · Inventario · Notificaciones omnicanal — para cualquier negocio de
            servicios. En tu servidor o en la nube, tú eliges.
          </p>
        </section>

        {/* TODO EN UN SOLO LUGAR */}
        <section className={`${styles.sec} ${styles.secWhite}`}>
          <div className={styles.secHead}>
            <h2>Todo en un solo lugar</h2>
            <p>
              Funciona igual tanto si lo instalas tú mismo como si usas nuestra nube. Sin
              integraciones. Sin plugins. Sin comisiones por transacción.
            </p>
          </div>
          <div className={styles.bizTags}>
            <span className={`${styles.bizTag} ${styles.bt1}`}>Salones de belleza</span>
            <span className={`${styles.bizTag} ${styles.bt2}`}>Barberías</span>
            <span className={`${styles.bizTag} ${styles.bt3}`}>Talleres de autos</span>
            <span className={`${styles.bizTag} ${styles.bt4}`}>Cafeterías</span>
            <span className={`${styles.bizTag} ${styles.bt5}`}>Clínicas dentales</span>
            <span className={`${styles.bizTag} ${styles.bt6}`}>Gimnasios</span>
            <span className={`${styles.bizTag} ${styles.bt7}`}>Masajes y spa</span>
            <span className={`${styles.bizTag} ${styles.bt8}`}>
              Y cualquier otro negocio de servicios
            </span>
          </div>
          <div className={styles.cardsWrap}>
            <div className={styles.featGrid}>
              <div className={styles.featCard}>
                <h4>POS / Caja</h4>
                <p>
                  Completa una venta en 3 clics. Efectivo, tarjeta, transferencia. Funciona sin
                  internet.
                </p>
              </div>
              <div className={styles.featCard}>
                <h4>CRM</h4>
                <p>
                  Historial completo del cliente: visitas, gastos, etiquetas, cumpleaños, notas.
                </p>
              </div>
              <div className={styles.featCard}>
                <h4>Inventario</h4>
                <p>Control de stock, entradas, bajas y alerta automática de mínimos.</p>
              </div>
              <div className={styles.featCard}>
                <h4>Calendario de citas</h4>
                <p>
                  Vista semanal con drag &amp; drop. Sin reservas dobles a nivel de base de datos.
                </p>
              </div>
              <div className={styles.featCard}>
                <h4>Reservas en línea</h4>
                <p>
                  Página pública: el cliente reserva con solo su nombre y teléfono. Sin registro.
                </p>
              </div>
              <div className={styles.featCard}>
                <h4>PWA</h4>
                <p>
                  Se instala en cualquier dispositivo desde el navegador. Funciona sin conexión.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* DISEÑADO PARA NEGOCIOS DE SERVICIOS */}
        <section className={`${styles.sec} ${styles.secWarm}`}>
          <div className={styles.secHead}>
            <h2>Diseñado para negocios de servicios</h2>
            <p>
              Reemplaza Excel, recordatorios manuales y plataformas costosas que se quedan con tus
              clientes.
            </p>
          </div>
          <div className={styles.cardsWrap}>
            <div className={styles.painGrid}>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>De</div>
                <div className={styles.painFromText}>Hojas de Excel para clientes y ventas</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>CRM + POS en una sola pantalla</div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>De</div>
                <div className={styles.painFromText}>Recordatorios manuales por WhatsApp</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>
                  Notificaciones automáticas por Telegram, WhatsApp, Viber y Email
                </div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>De</div>
                <div className={styles.painFromText}>La plataforma se queda con el 20%</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>
                  Los clientes reservan directo contigo — 0% de comisión
                </div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>De</div>
                <div className={styles.painFromText}>ERPNext demasiado complicado</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>Interfaz que cualquiera aprende en 10 minutos</div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>De</div>
                <div className={styles.painFromText}>Sin datos reales de tu negocio</div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>Panel de ingresos, LTV y servicios más vendidos</div>
              </div>
              <div className={styles.painCard}>
                <div className={styles.painFromLabel}>De</div>
                <div className={styles.painFromText}>
                  Datos de clientes atrapados en otra plataforma
                </div>
                <div className={styles.painArrow}>↓</div>
                <div className={styles.painTo}>
                  Self-hosted: los datos viven en tu propio servidor
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* NOTIFICACIONES OMNICANAL */}
        <section className={`${styles.sec} ${styles.secBlue}`}>
          <div className={styles.secHead}>
            <h2>Notificaciones omnicanal</h2>
            <p>
              El único POS de código abierto con los cuatro canales integrados — sin plugins, sin
              configuración complicada.
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
              <span className={styles.badgeSoon}>Próximamente</span>
            </div>
            <div className={`${styles.channel} ${styles.soon}`}>
              <span className={`${styles.dot} ${styles.dotGray}`}></span>SMS{' '}
              <span className={styles.badgeSoon}>Próximamente</span>
            </div>
          </div>
          <div className={styles.cardsWrap}>
            <div className={styles.notifGrid}>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Reserva confirmada</div>
                <div className={styles.evSub}>Enviada al instante después de cada reserva</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Recordatorio de cita</div>
                <div className={styles.evSub}>24 horas y 1 hora antes de la visita</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Mensaje de agradecimiento</div>
                <div className={styles.evSub}>2 horas después de finalizada la visita</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Reactivación de clientes</div>
                <div className={styles.evSub}>&ldquo;No te hemos visto en 30 días&rdquo;</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Felicitación de cumpleaños</div>
                <div className={styles.evSub}>Enviada automáticamente</div>
              </div>
              <div className={styles.notifCard}>
                <div className={styles.evText}>Alerta de stock bajo</div>
                <div className={styles.evSub}>Al propietario del negocio</div>
              </div>
            </div>
          </div>
        </section>

        {/* DOS FORMAS DE USAR PRONTO */}
        <section className={`${styles.sec} ${styles.secWhite}`}>
          <div className={styles.secHead}>
            <h2>Dos formas de usar Pronto</h2>
            <p>Elige la que mejor se adapte a tu negocio. Cambia cuando quieras.</p>
          </div>
          <div className={styles.twoPaths}>
            {/* SELF-HOSTED */}
            <div className={`${styles.pathCard} ${styles.self}`}>
              <div className={styles.pathLabel}>Opción 1</div>
              <h3>Self-hosted</h3>
              <p className={styles.pathDesc}>
                Instala en tu propio servidor. Tus datos nunca salen de tu máquina. Gratis para
                siempre. Requiere Docker.
              </p>
              <div className={styles.shHighlights}>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>$0</div>
                  <div className={styles.shHlLabel}>Gratis siempre</div>
                </div>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>0%</div>
                  <div className={styles.shHlLabel}>Comisión</div>
                </div>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>∞</div>
                  <div className={styles.shHlLabel}>Sin límites</div>
                </div>
                <div className={styles.shHlItem}>
                  <div className={styles.shHlNum}>1</div>
                  <div className={styles.shHlLabel}>Comando</div>
                </div>
              </div>
              <div className={styles.pathPoints}>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Tus datos, tu servidor</strong> — la base de clientes vive solo en tu
                    máquina
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Licencia MIT</strong> — modifica, extiende y personaliza libremente
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Cualquier infraestructura</strong> — VPS Linux, Windows, macOS. Mínimo 1
                    GB de RAM
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
                Ver en GitHub →
              </a>
              <Link href="/docs" className={styles.btnOutline} style={{ marginTop: '16px' }}>
                Documentación →
              </Link>
            </div>

            {/* CLOUD */}
            <div className={`${styles.pathCard} ${styles.cloud}`}>
              <div className={styles.pathLabel}>Opción 2</div>
              <h3>Nube — trypronto.app</h3>
              <p className={styles.pathDesc}>
                Sin servidor propio. Listo en 5 minutos. Tu subdominio personalizado. Nosotros nos
                encargamos de las actualizaciones, copias de seguridad e infraestructura.
              </p>
              <div className={styles.trialBanner}>
                <div className={styles.trialBig}>14 días gratis</div>
                <div>
                  <div className={styles.trialText}>
                    Prueba cualquier plan de pago gratis durante 14 días.
                  </div>
                  <div className={styles.trialNote}>
                    Sin tarjeta de crédito. Cancela cuando quieras.
                  </div>
                </div>
              </div>
              <div className={styles.pathPoints}>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Listo en minutos</strong> — regístrate, configura y obtén tu subdominio
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Tu propio subdominio</strong> — salon-maya.trypronto.app o dominio
                    personalizado en Pro+
                  </div>
                </div>
                <div className={styles.pathPoint}>
                  <div className={styles.pathPointDot}></div>
                  <div className={styles.pathPointText}>
                    <strong>Nos encargamos de todo</strong> — actualizaciones, backups y monitoreo
                    de uptime
                  </div>
                </div>
              </div>
              <Link href="/register" className={styles.btnPrimary}>
                Empezar gratis — sin tarjeta
              </Link>
            </div>
          </div>

          {/* PRECIOS */}
          <div className={styles.plansWrap}>
            <div className={styles.plansTitle}>Precios en la nube</div>
            <div className={styles.plans}>
              <div className={styles.plan}>
                <div className={styles.planName}>Gratis</div>
                <div className={styles.planPrice}>$0</div>
                <span className={styles.planTrialFree}>Gratis para siempre</span>
                <div className={styles.planLimit}>1 empleado · 100 clientes</div>
                <ul className={styles.planFeats}>
                  <li>POS + CRM + Inventario</li>
                  <li>Notificaciones por Email</li>
                  <li>Página de reservas en línea</li>
                </ul>
              </div>
              <div className={styles.plan}>
                <div className={styles.planName}>Starter</div>
                <div className={styles.planPrice}>
                  $19<span>/mes</span>
                </div>
                <div className={styles.planTrial}>14 días de prueba gratis</div>
                <div className={styles.planLimit}>3 empleados · 1 000 clientes</div>
                <ul className={styles.planFeats}>
                  <li>+ Telegram y WhatsApp</li>
                  <li>+ Reservas en línea</li>
                </ul>
              </div>
              <div className={`${styles.plan} ${styles.featured}`}>
                <div className={styles.planPopular}>Más popular</div>
                <div className={styles.planName}>Pro</div>
                <div className={styles.planPrice}>
                  $39<span>/mes</span>
                </div>
                <div className={styles.planTrial}>14 días de prueba gratis</div>
                <div className={styles.planLimit}>15 empleados · ilimitado</div>
                <ul className={styles.planFeats}>
                  <li>+ Notificaciones por Viber</li>
                  <li>
                    + Analíticas <span className={styles.badgeSoon}>Próximamente</span>
                  </li>
                  <li>+ Dominio personalizado</li>
                  <li>
                    + Programa de fidelización{' '}
                    <span className={styles.badgeSoon}>Próximamente</span>
                  </li>
                </ul>
              </div>
              <div className={styles.plan}>
                <div className={styles.planName}>Agency</div>
                <div className={styles.planPrice}>
                  $79<span>/mes</span>
                </div>
                <div className={styles.planTrial}>14 días de prueba gratis</div>
                <div className={styles.planLimit}>Varias ubicaciones</div>
                <ul className={styles.planFeats}>
                  <li>+ White-label</li>
                  <li>
                    + Acceso a API <span className={styles.badgeSoon}>Próximamente</span>
                  </li>
                  <li>+ Soporte prioritario</li>
                </ul>
              </div>
            </div>
            <p className={styles.pricingNote}>
              <Link href="/es/precios">Ver precios completos →</Link>
            </p>
          </div>
        </section>
      </main>

      {/* PREGUNTAS FRECUENTES */}
      <section className={styles.faq}>
        <div className={styles.faqInner}>
          <h2>Preguntas frecuentes</h2>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>¿Pronto es realmente gratuito?</div>
            <div className={styles.faqA}>
              Sí. La versión self-hosted es gratuita para siempre bajo licencia MIT, sin límites de
              clientes, empleados ni funciones. La versión en la nube tiene un plan gratuito y
              planes de pago desde $19 al mes con 14 días de prueba gratis.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>¿Pronto cobra comisión por las reservas?</div>
            <div className={styles.faqA}>
              No. Cero comisión en todas las reservas y ventas. Tus clientes reservan directamente
              contigo, sin marketplace ni intermediarios.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>
              ¿Los clientes necesitan crear una cuenta para reservar?
            </div>
            <div className={styles.faqA}>
              No. La página de reservas solo pide nombre y teléfono. Sin registro, sin contraseña,
              sin aplicación que descargar.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>¿Cómo instalo Pronto en mi propio servidor?</div>
            <div className={styles.faqA}>
              Necesitas Docker en cualquier servidor Linux, Windows o macOS con al menos 1 GB de
              RAM. Ejecuta{' '}
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
              y la aplicación se inicia automáticamente.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>¿Qué canales de mensajería están disponibles?</div>
            <div className={styles.faqA}>
              Email, Telegram, WhatsApp y Viber. LINE y SMS próximamente.
            </div>
          </div>
          <div className={styles.faqItem}>
            <div className={styles.faqQ}>¿Para qué tipo de negocios sirve Pronto?</div>
            <div className={styles.faqA}>
              Para cualquier negocio de servicios: salones de belleza, barberías, talleres de autos,
              cafeterías, clínicas dentales, gimnasios, spas, estudios de tatuajes y cualquier otro
              negocio donde los clientes reserven citas o paguen por servicios.
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          Pronto<span>.</span>
        </div>
        <div className={styles.footerCopy}>© 2026 Pronto. Todos los derechos reservados.</div>
        <div className={styles.footerLinks}>
          <Link href="/es/">Inicio</Link>
          <Link href="/es/precios">Precios</Link>
          <Link href="/es/para">Para negocios</Link>
          <Link href="/es/para/salones">Salones</Link>
          <Link href="/terms">Términos</Link>
          <Link href="/privacy">Privacidad</Link>
          <Link href="/refund">Reembolsos</Link>
          <a href="https://github.com/SGrappelli/pronto" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
