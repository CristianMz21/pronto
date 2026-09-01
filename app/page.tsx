import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'
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
    // Anonymous selfhosted: Escudería PREMIUM landing
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
                letterSpacing: '0.02em',
              }}
            >
              Reservar
            </Link>
            <Link
              href="/es/"
              style={{
                fontSize: 13,
                color: '#9A8E85',
                textDecoration: 'none',
                border: '1px solid rgba(197,160,89,0.25)',
                padding: '6px 10px',
                borderRadius: 6,
              }}
            >
              ES
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
              Barbería contemporánea. Reserva en 30s con tu barbero favorito. Sin registro — solo
              nombre y teléfono.
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
                  letterSpacing: '0.02em',
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
              <span>·</span>
              <span>09:00–20:00</span>
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
                  letterSpacing: '-0.02em',
                  color: '#0A0A0A',
                  marginBottom: 10,
                }}
              >
                Corte preciso. Acabado premium.
              </h2>
              <p style={{ color: '#6b7280', maxWidth: 560, margin: '0 auto' }}>
                Selecciona tu servicio y barbero. Duración y precio transparentes.
              </p>
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
                  desc: 'Combo completo con toalla caliente y aceites.',
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
                  desc: 'Matizado profesional, cuidado capilar.',
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
                        letterSpacing: '0.06em',
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
                      lineHeight: 1.5,
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
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Link
                href="/book/escuderia"
                style={{
                  color: '#0A0A0A',
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                  borderBottom: '1px solid #0A0A0A',
                  paddingBottom: 2,
                }}
              >
                Ver todos los servicios →
              </Link>
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
              <p style={{ color: '#6b7280', marginTop: 8 }}>
                Favoritos del cliente, disponibilidad real.
              </p>
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
                Lun–Sáb 09:00–20:00 · Dom cerrado · Break 13:00–14:00
              </p>
              <div style={{ fontSize: 13, color: '#9A8E85', lineHeight: 1.8 }}>
                <div>Escudería Centro — Cra 7 #12-34, Bogotá · +57 300 123 4567</div>
                <div>Escudería Norte — Cl 100 #15-20, Bogotá · +57 301 987 6543</div>
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
          <div>© 2026 Escudería. Todos los derechos reservados.</div>
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

      {/* FOOTER — keep in sync with all other pages
          ES standard: /es/ · /es/precios · /es/para · legal · GitHub
          EN standard: / · legal · GitHub */}
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
