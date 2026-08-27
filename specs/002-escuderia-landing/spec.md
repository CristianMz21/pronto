# Feature Specification: Escudería Landing Premium (Stitch Obsidian & Gilt)

**Feature Branch**: `002-escuderia-landing`

**Created**: 2026-08-27

**Status**: Draft

**Input**: Implementar landing page premium para barbería Escudería (Colombia) usando template Stitch `nombre_de_barber_a_landing_page_premium` (Obsidian & Gilt — Cinematic Minimalism) en `/home/mackroph/Descargas/template/stitch_elite_grooming_experience/`. Adaptar a Next.js 16 + Tailwind + Supabase, con datos reales (servicios, barberos, horarios), localización COP/es-CO, mobile + desktop, CTA a `/book/escuderia`.

## User Scenarios & Testing

### User Story 1 — Visitante descubre Escudería y reserva (Priority: P1)

Como cliente potencial que llega a `escuderia.com` (o `localhost:3000/escuderia`) quiero entender en 5s qué es Escudería, ver servicios/precios COP y reservar sin crear cuenta.

**Why this priority**: Es el funnel principal: visita → reserva. Sin esto, la landing no genera ingresos.

**Independent Test**: Abrir `/escuderia` en móvil y desktop → ver hero "Tu estilo. Nuestra precisión." → scroll a servicios (5) con precios COP → click `RESERVAR CITA` → llega a `/book/escuderia` con servicios precargados.

**Acceptance Scenarios**:

1. **Given** usuario en `/escuderia`, **When** ve el hero, **Then** ve `Escudería` + claim + `RESERVAR CITA` (gold border, hover fill) + imagen hero cinematic + badge `Abierto hoy • 09:00-20:00`
2. **Given** scroll a `#services`, **When** ve servicios, **Then** ve 5 servicios de DB (`Corte Clásico $30.000`, `Corte + Barba $45.000`, etc.) con `formatCurrency COP` y `duration_min`, layout restaurant-menu (nombre izq, precio der, leader punteada `subtle-bronze/20`)
3. **Given** click `BOOK NOW` / `RESERVAR CITA` en hero o nav, **When** navega, **Then** va a `/book/escuderia` (no a `#book` anchor)

---

### User Story 2 — Visitante explora experiencia y barberos (Priority: P2)

Como visitante indeciso quiero ver el ambiente (fotos editorial), conocer barberos y ubicación para confiar.

**Why this priority**: La barbería premium vende ritual y confianza, no solo corte. Fotos + barberos + horario convierten al indeciso.

**Independent Test**: En `/escuderia` ver sección `EL ENTORNO` con grid 12-col asimétrico (texto 5 col, imágenes 7 col), hover `grayscale-0`, y sección barberos con 4 cards y colores `#1a1a1a/#ec4899/#0ea5e9/#f59e0b`.

**Acceptance Scenarios**:

1. **Given** en `#experience`, **When** ve el grid, **Then** ve `EL ENTORNO / Mucho más que una barbería.` + 2 imágenes editorial (cuero, tijeras) con `grayscale` + `hover:grayscale-0` y `fade-up` on scroll
2. **Given** en barberos, **When** ve la lista, **Then** ve 4 barberos de DB (`Escudería Owner`, `Ana`, `Luis`, `Miguel`) con iniciales en círculo `color` y `specialties`
3. **Given** en footer / `#location`, **When** ve contacto, **Then** ve `+57 300 123 4567` `tel:` + `Colombia` + horario `Lun-Sáb 09:00-20:00` (`America/Bogota`)

---

### User Story 3 — Mobile premium (Priority: P1)

Como usuario en celular quiero la misma experiencia premium sin scroll horizontal, con nav glass y CTA accesible.

**Why this priority**: 70%+ del tráfico barbería es móvil. La versión `nombre_de_barber_a_mobile_experience/code.html` es la referencia.

**Independent Test**: Abrir `/escuderia` en 375px → nav `glass-nav` (blur 20px, `bg-surface/40`), hero `h-[80vh]` con gradiente, tipografía `headline-lg-mobile` 36px, servicios en lista vertical, sin overflow.

**Acceptance Scenarios**:

1. **Given** viewport 375px, **When** carga `/escuderia`, **Then** no hay scroll horizontal, nav es `fixed` con `backdrop-blur-xl`, y `BOOK NOW` es `gold-border-btn` full-width en hero mobile
2. **Given** viewport 375px, **When** ve servicios, **Then** son vertical `flex-col`, precio y duración a la derecha, sin tabla desktop

---

### Edge Cases

- Si `services` vacío (DB sin datos) → muestra `No hay servicios` pero hero y CTA siguen funcionando (no bloquea reserva, lleva a `/book/escuderia` con empty)
- Si `employees` vacío → barberos muestra `Sin barberos aún` pero no rompe layout
- Si `business` no existe (slug `escuderia` no encontrado) → fallback a `bizId` hardcodeado `17c1a2b5...` y datos demo, no 500
- Imágenes externas (`lh3.googleusercontent.com`) pueden fallar → `onError` fallback a `bg-deep-charcoal` con icono, no layout shift
- `formatCurrency` con `COP` debe dar `$ 30.000` (es-CO, NBSP normalizado), no `$30,000` (en-US)

## Requirements

### Functional Requirements

- **FR-001**: System MUST render landing en `app/escuderia/page.tsx` (y opcionalmente `/` si `slug=escuderia`) con SSR que fetchea `businesses` (`slug=escuderia`), `services` y `employees` activos via `createClient` (Supabase SSR, no service_role en cliente)
- **FR-002**: System MUST aplicar design system `obsidian_gilt/DESIGN.md` (Cinematic Minimalism): `background #0A0A0A`, `metallic-gold #C5A059`, `warm-white #F9F6F1`, `Playfair Display` headlines, `Montserrat` body, `0px` radius, `1px` `subtle-bronze` borders, `glass-nav` 20px blur
- **FR-003**: System MUST mostrar hero con `data-alt` cinematográfico, `h-screen` desktop / `h-[80vh]` mobile, gradiente `from-[#0A0A0A]`, `fade-up` observer, y CTA `RESERVAR CITA` → `/book/escuderia` (no `#book`)
- **FR-004**: System MUST mostrar servicios como restaurant-menu: `service-list-item` con `border-bottom: 1px dashed rgba(142,121,94,0.2)`, nombre `font-button` `14px 0.15em` uppercase, precio `font-headline-md 20px` `metallic-gold`, descripción `14px` `on-surface-variant`, y `formatCurrency` COP
- **FR-005**: System MUST mostrar barberos con `specialties` y `color` (círculo iniciales), y horario `Lun-Sáb 09:00-20:00` (`America/Bogota`) desde `business_hours` o fallback
- **FR-006**: System MUST ser responsive sin `head` duplicado: usar `next/font` para `Playfair_Display` y `Montserrat` (no CDN `tailwind.config` inline), y `next.config` sin `cdn.tailwindcss.com`
- **FR-007**: System MUST tener nav `fixed` `glass-nav` (`bg-surface/40` `backdrop-blur-xl` `border-subtle-bronze/20`) con links `EXPERIENCE`/`SERVICES`/`GALLERY`/`LOCATION` y `BOOK NOW` gold-border, con `nav-link` underline hover y `md:hidden` menu

### Key Entities

- **Business**: `id, name, slug, phone, address, timezone, currency, brand_color` (ya existe `Escudería` `escuderia` `COP` `America/Bogota` `#1a1a1a`)
- **Service**: `id, name, description, price, duration_min, category, capacity` (5 activos)
- **Employee**: `id, name, specialties, color` (4 activos)

## Success Criteria

### Measurable Outcomes

- **SC-001**: Lighthouse Performance ≥90, Accessibility ≥95 en `/escuderia` (mobile) — no CDN tailwind, fonts `next/font`
- **SC-002**: `/escuderia` pinta LCP <2.5s en 4G (hero imagen con `priority` o `next/image` con `sizes`)
- **SC-003**: 100% de servicios de DB renderizados con precio COP correcto (snapshot test `formatCurrency(30000,COP) → $ 30.000`)
- **SC-004**: Click `RESERVAR CITA` en hero lleva a `/book/escuderia` en <100ms (prefetch `next/link`)
- **SC-005**: No hay hydration mismatch en `/escuderia` (html/body `suppressHydrationWarning` ya en `layout.tsx:64`, no `Date.now()` en client)

## Assumptions

- Template Stitch es referencia visual, no código a copiar literal con CDN: se reimplementa con Tailwind local y `next/font` para evitar FOUC y CSP
- Imágenes `lh3.googleusercontent.com` son placeholders; en prod se reemplazan por fotos reales de Escudería (se dejan como fallback)
- La landing vive en `/escuderia` (no rompe `/` de Pronto SaaS); si `escuderia.com` apunta a esta instancia, se puede hacer rewrite `host:escuderia.com → /escuderia` en `proxy.ts` futuro, no en este MVP
- No se necesita CMS para la landing en este slice: contenido viene de `businesses/services/employees` (ya Colombia) y el resto es hardcode editorial
