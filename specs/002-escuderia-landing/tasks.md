# Tasks: Escudería Landing Premium (Stitch Obsidian & Gilt)

**Input**: `specs/002-escuderia-landing/spec.md`, `plan.md`

**Tests**: Lighthouse ≥90, formatCurrency COP, CTA → /book/escuderia

## Phase 1: Setup

- [x] T001 Crear feature `002-escuderia-landing` con `create-new-feature.sh`
- [x] T002 Escribir `spec.md` (3 stories, 7 FR, 5 SC) y `plan.md` (Cinematic Minimalism, Playfair+Montserrat, #0A0A0A/#C5A059)

## Phase 2: Implementation (P1)

- [x] T003 Implementar `app/escuderia/page.tsx` SSR con `createClient` (business slug=escuderia, services, employees) + fallback bizId
- [x] T004 Aplicar design system `obsidian_gilt/DESIGN.md`: background #0A0A0A, metallic-gold #C5A059, Playfair 72/48, Montserrat 12/0.2em, 0px radius, glass-nav 20px blur
- [x] T005 Hero `h-screen` / `h-[80vh]` mobile, gradiente, `Tu estilo. Nuestra precisión.`, CTA `RESERVAR CITA` → `/book/escuderia` (btn-gold hover fill)
- [x] T006 Experience 12-col grid (5 text + 7 images), grayscale hover, fade-up
- [x] T007 Services restaurant-menu: `service-list-item` dashed #8E795E/20, `font-button` 14/0.15em uppercase, precio `Playfair 20px` gold, `formatCurrency COP`
- [x] T008 Barberos 4 con `color` círculo + `specialties`, Location 3 cards (Horario/Ubicación/Reserva)
- [x] T009 Nav glass-nav fixed + BOOK NOW gold-border, footer

## Phase 3: Verification

- [x] T010 `npm run build` 45 rutas → /escuderia 200, `curl` Escudería 5x, no CDN tailwind, next/font
- [x] T011 `npm run test:unit` 29 tests, `formatCurrency(30000,COP)=$ 30.000`
