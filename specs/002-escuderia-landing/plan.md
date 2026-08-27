# Implementation Plan: Escudería Landing Premium (Stitch Obsidian & Gilt)

**Branch**: `002-escuderia-landing` | **Date**: 2026-08-27 | **Spec**: `specs/002-escuderia-landing/spec.md`

**Input**: Feature specification from `/specs/002-escuderia-landing/spec.md`

## Summary

Implementar landing premium para Escudería en `app/escuderia/page.tsx` usando template Stitch `nombre_de_barber_a_landing_page_premium` (Obsidian & Gilt, Cinematic Minimalism) con `DESIGN.md` (Playfair Display + Montserrat, #0A0A0A, #C5A059), SSR Supabase (services/employees), COP/es-CO, glass-nav, hero h-screen, services restaurant-menu, barberos, y CTA a `/book/escuderia`. Sin CDN tailwind, con `next/font`.

## Technical Context

**Language/Version**: TypeScript 5 + Next.js 16.3.2 App Router, React 19, Node 20/24

**Primary Dependencies**: `next/font` (Playfair_Display, Montserrat), Tailwind 3.4, `lucide-react`, `@supabase/ssr`, `isomorphic-dompurify` (no CDN)

**Storage**: Supabase PostgreSQL (businesses, services, employees) via `createClient` SSR (anon, RLS)

**Testing**: `vitest` unit (formatCurrency COP), `playwright` e2e (hero CTA → /book/escuderia), Lighthouse CI (≥90 perf)

**Target Platform**: Web (desktop 1280 + mobile 375), PWA-ready, SEO (Metadata, OG)

**Project Type**: Web application (Next.js App Router)

**Performance Goals**: LCP <2.5s (hero `next/image` priority), CLS 0, TTFB <600ms, 100% services COP correct

**Constraints**: 0px radius, 1px subtle-bronze borders, glass-nav 20px blur, no `cdn.tailwindcss.com`, `suppressHydrationWarning` ya en layout

**Scale/Scope**: 1 landing page (`app/escuderia/page.tsx` ~250 lines) + 1 layout, 5 services, 4 barberos, 3 sections (hero, experience, services, signature, barberos, footer)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Pronto-First**: Reusa `businesses/services/employees` existentes (Escudería COP), no duplica DB, extiende `app/escuderia/page.tsx` previo (simple FBF8F5) a premium sin romper `/book/escuderia`
- [x] **II. Cliente Real Primero**: Funnel visita→reserva en 5s, CTA gold-border, precios COP visibles, mobile-first (70% tráfico)
- [x] **III. Integridad**: SSR anon (RLS), no service_role en cliente, sanitiza `business.name` via `createClient` (no user input), `formatCurrency` COP ya testeado
- [x] **IV. Mobile-First/PWA**: `h-[80vh]` mobile, `h-screen` desktop, `grid-cols-12` → `grid-cols-4`, `backdrop-blur-xl`, no horizontal scroll, `next/image` responsive
- [x] **V. Simplicidad**: Single file `page.tsx`, sin nuevo `src/`, sin CMS, sin dependencia extra, `next/font` vs CDN

*Post-Phase 1 re-check*: Si `lh3.googleusercontent.com` imágenes fallan, fallback a `bg-deep-charcoal` + icono, no layout shift.

## Project Structure

### Documentation (this feature)

```text
specs/002-escuderia-landing/
├── spec.md              # Feature spec (3 stories, 7 FR, 5 SC)
├── plan.md              # This file
├── research.md          # Template analysis (Stitch)
├── data-model.md        # Business/Service/Employee (already in 001)
├── quickstart.md        # How to view /escuderia
└── tasks.md             # Tasks per story
```

### Source Code (repository root)

```text
app/
├── escuderia/
│   └── page.tsx         # SSR landing premium (Stitch) — THIS FEATURE
├── escuderia/
│   └── layout.tsx       # Optional: override root layout for dark theme (not needed, page self-contained)
├── layout.tsx           # Root with suppressHydrationWarning (already fixed)
└── book/[slug]/page.tsx # Booking target (existing)

lib/
├── utils.ts             # formatCurrency COP (already)
└── supabase/server.ts   # createClient SSR

public/
└── (hero images via lh3.googleusercontent.com, fallback)
```

**Structure Decision**: Mantener `app/escuderia/page.tsx` como única fuente de verdad para Escudería landing (no `src/`), reutilizar `lib/utils` y `supabase`. No crear `components/landing` separado para no dispersar; si crece, extraer a `components/escuderia/*` en siguiente iteración.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | Single page, no new project | N/A |
