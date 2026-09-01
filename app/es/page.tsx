import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'
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
    return (
      <div
        className={`${styles.page} ${bricolage.variable} ${dmSans.variable}`}
        style={{ background: '#FBF8F5' }}
      >
        <nav
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'rgba(10,10,10,0.92)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(197,160,89,0.18)',
            padding: '0 24px',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-bricolage)',
              fontSize: 22,
              fontWeight: 800,
              color: '#C5A059',
              textDecoration: 'none',
              letterSpacing: '0.04em',
            }}
          >
            ESCUDERÍA<span style={{ color: '#fff' }}>.</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link
              href="/client/me"
              style={{ fontSize: 14, color: '#d0c5b9', textDecoration: 'none', fontWeight: 500 }}
            >
              Mi cuenta
            </Link>
            <Link
              href="/book/escuderia"
              style={{
                background: '#C5A059',
                color: '#0A0A0A',
                fontSize: 14,
                fontWeight: 700,
                padding: '10px 22px',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Reservar
            </Link>
            <Link
              href="/"
              style={{
                fontSize: 13,
                color: '#9A8E85',
                textDecoration: 'none',
                border: '1px solid rgba(197,160,89,0.25)',
                padding: '6px 10px',
                borderRadius: 6,
              }}
            >
              EN
            </Link>
          </div>
        </nav>
        <section
          style={{
            background: '#0A0A0A',
            color: '#fff',
            padding: '72px 24px 64px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -80,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 800,
              height: 400,
              background:
                'radial-gradient(ellipse at center, rgba(197,160,89,0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(197,160,89,0.12)',
                border: '1px solid rgba(197,160,89,0.22)',
                color: '#C5A059',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.12em',
                padding: '6px 14px',
                borderRadius: 20,
                marginBottom: 20,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C5A059' }} />{' '}
              BOGOTÁ · CENTRO Y NORTE
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-bricolage)',
                fontSize: 'clamp(36px, 6vw, 56px)',
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
                marginBottom: 16,
              }}
            >
              Tu estilo,
              <br />
              <span style={{ color: '#C5A059', fontStyle: 'italic', fontWeight: 700 }}>
                nuestra escudería
              </span>
            </h1>
            <p
              style={{
                fontSize: 17,
                color: '#d0c5b9',
                lineHeight: 1.6,
                maxWidth: 560,
                margin: '0 auto 28px',
              }}
            >
              Barbería contemporánea. Reserva en 30s con tu barbero favorito. Sin registro.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/book/escuderia"
                style={{
                  background: '#C5A059',
                  color: '#0A0A0A',
                  fontWeight: 700,
                  padding: '14px 28px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  fontSize: 15,
                  boxShadow: '0 4px 20px rgba(197,160,89,0.3)',
                }}
              >
                Reservar cita →
              </Link>
              <Link
                href="/client/me"
                style={{
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '14px 24px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Ver mis citas
              </Link>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 18,
                justifyContent: 'center',
                marginTop: 28,
                color: '#9A8E85',
                fontSize: 13,
              }}
            >
              <span>★ 4.9 · 1.200+ clientes</span>
              <span>·</span>
              <span>✓ Sin comisión</span>
            </div>
          </div>
        </section>
        <section
          style={{ padding: '64px 24px', background: '#fff', borderTop: '1px solid #E8E0D8' }}
        >
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: '#C5A059',
                  marginBottom: 8,
                }}
              >
                SERVICIOS
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-bricolage)',
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#0A0A0A',
                  marginBottom: 10,
                }}
              >
                Corte preciso. Acabado premium.
              </h2>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {[
                {
                  name: 'Corte Clásico',
                  price: '$30.000',
                  dur: '30 min',
                  desc: 'Degradado limpio, lavado y styling.',
                },
                {
                  name: 'Corte + Barba',
                  price: '$45.000',
                  dur: '50 min',
                  desc: 'Combo completo con toalla caliente.',
                  featured: true,
                },
                {
                  name: 'Barba Premium',
                  price: '$30.000',
                  dur: '35 min',
                  desc: 'Perfilado navaja, vapor y after shave.',
                },
                {
                  name: 'Color · Tinte',
                  price: '$80.000',
                  dur: '90 min',
                  desc: 'Matizado profesional.',
                },
              ].map((s) => (
                <div
                  key={s.name}
                  style={{
                    background: s.featured ? '#0A0A0A' : '#fff',
                    color: s.featured ? '#fff' : '#0A0A0A',
                    border: `1px solid ${s.featured ? '#0A0A0A' : '#E8E0D8'}`,
                    borderRadius: 16,
                    padding: 24,
                    position: 'relative',
                  }}
                >
                  {s.featured && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        background: '#C5A059',
                        color: '#0A0A0A',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: 6,
                      }}
                    >
                      MÁS POPULAR
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: s.featured ? '#C5A059' : '#9A8E85',
                      marginBottom: 6,
                    }}
                  >
                    {s.dur}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-bricolage)',
                      fontSize: 18,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: s.featured ? '#d0c5b9' : '#6b7280',
                      marginBottom: 12,
                    }}
                  >
                    {s.desc}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 18,
                      color: s.featured ? '#C5A059' : '#0A0A0A',
                    }}
                  >
                    {s.price}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          style={{ padding: '64px 24px', background: '#FBF8F5', borderTop: '1px solid #E8E0D8' }}
        >
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: '#C5A059',
                  marginBottom: 8,
                }}
              >
                BARBEROS
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-bricolage)',
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#0A0A0A',
                }}
              >
                Elige tu escudero
              </h2>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {[
                {
                  name: 'Carlos',
                  rating: '4.9',
                  jobs: '247',
                  spec: 'Fade · Corte clásico',
                  color: '#0A0A0A',
                },
                {
                  name: 'Andrés',
                  rating: '4.8',
                  jobs: '189',
                  spec: 'Barba · Afeitado',
                  color: '#1a1a1a',
                },
                {
                  name: 'Sofía',
                  rating: '4.9',
                  jobs: '203',
                  spec: 'Color · Cejas',
                  color: '#2a2a2a',
                },
              ].map((b) => (
                <div
                  key={b.name}
                  style={{
                    background: '#fff',
                    border: '1px solid #E8E0D8',
                    borderRadius: 16,
                    padding: 24,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: b.color,
                      color: '#C5A059',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 20,
                      margin: '0 auto 12px',
                      border: '2px solid #C5A059',
                    }}
                  >
                    {b.name[0]}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {b.name} · ★{b.rating}
                  </div>
                  <div style={{ fontSize: 12, color: '#9A8E85', marginBottom: 8 }}>
                    {b.jobs} servicios · {b.spec}
                  </div>
                  <Link
                    href="/book/escuderia"
                    style={{
                      fontSize: 13,
                      color: '#0A0A0A',
                      fontWeight: 600,
                      textDecoration: 'none',
                      border: '1px solid #E8E0D8',
                      padding: '8px 16px',
                      borderRadius: 8,
                      display: 'inline-block',
                      marginTop: 8,
                    }}
                  >
                    Reservar con {b.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          style={{
            padding: '56px 24px',
            background: '#0A0A0A',
            color: '#fff',
            borderTop: '1px solid rgba(197,160,89,0.18)',
          }}
        >
          <div
            style={{
              maxWidth: 960,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 32,
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: '#C5A059',
                  marginBottom: 8,
                }}
              >
                UBICACIÓN
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-bricolage)',
                  fontSize: 26,
                  fontWeight: 700,
                  marginBottom: 12,
                }}
              >
                Centro y Norte
              </h3>
              <p style={{ color: '#d0c5b9', lineHeight: 1.7, fontSize: 14, marginBottom: 16 }}>
                Lun–Sáb 09:00–20:00 · Dom cerrado
              </p>
              <div style={{ fontSize: 13, color: '#9A8E85', lineHeight: 1.8 }}>
                <div>Centro — Cra 7 #12-34 · Norte — Cl 100 #15-20</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <a
                  href="https://maps.google.com/?q=Cra+7+%2312-34+Bogotá"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: '#fff',
                    color: '#0A0A0A',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Cómo llegar
                </a>
                <a
                  href="https://wa.me/573001234567"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  WhatsApp
                </a>
              </div>
            </div>
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(197,160,89,0.18)',
                borderRadius: 16,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: '#C5A059',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  marginBottom: 8,
                }}
              >
                ¿LISTO?
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-bricolage)',
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Reserva en 30 segundos
              </div>
              <div style={{ fontSize: 13, color: '#9A8E85', marginBottom: 16 }}>
                Sin registro. Elige servicio, barbero y hora.
              </div>
              <Link
                href="/book/escuderia"
                style={{
                  background: '#C5A059',
                  color: '#0A0A0A',
                  padding: '12px 24px',
                  borderRadius: 10,
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Reservar ahora →
              </Link>
            </div>
          </div>
        </section>
        <footer
          style={{
            background: '#0A0A0A',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            padding: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            color: '#6b7280',
            fontSize: 13,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-bricolage)',
              fontWeight: 800,
              color: '#C5A059',
              letterSpacing: '0.04em',
            }}
          >
            ESCUDERÍA<span style={{ color: '#fff' }}>.</span>
          </div>
          <div>© 2026 Escudería.</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link href="/book/escuderia" style={{ color: '#9A8E85', textDecoration: 'none' }}>
              Reservar
            </Link>
            <Link href="/client/me" style={{ color: '#9A8E85', textDecoration: 'none' }}>
              Mi cuenta
            </Link>
          </div>
        </footer>
      </div>
    )
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

      {/* FOOTER — keep in sync with all other pages
          ES standard: /es/ · /es/precios · /es/para · /es/para/salones · legal · GitHub
          EN standard: / · /pricing · /for · /for/salons · legal · GitHub */}
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
