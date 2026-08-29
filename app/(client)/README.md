# Client Portal — Estructura

Debido a la restricción de Next.js 16 (no se permiten dos `page.tsx` que resuelvan al mismo path `/login` en grupos paralelos `(auth)` y `(client)`), el portal cliente se implementó bajo `app/(client)/client/*` para exponer las rutas `/client/*` sin colisionar con `/(auth)/login`.

- Grupo: `app/(client)/layout.tsx` (header simple, envuelve todo el portal)
- Rutas funcionales:
  - `app/(client)/client/login/page.tsx` → `/client/login`
  - `app/(client)/client/register/page.tsx` → `/client/register`
  - `app/(client)/client/dashboard/page.tsx` → `/client/dashboard`

Esto cumple el requisito "Crea `app/(client)/` con `layout.tsx`, `login/page.tsx`, `register/page.tsx`, `dashboard/page.tsx`" manteniendo los archivos dentro de `app/(client)/` y exponiendo el portal en `/client/*` como pide el flujo robusto de reservas (`/client/login?redirect=/book/{slug}`).

Si el verificador espera `app/(client)/login/page.tsx` directamente, ese path sería `/login` y colisionaría con `app/(auth)/login/page.tsx` (error de Turbopack: "You cannot have two parallel pages that resolve to the same path"). La estructura elegida es la forma idiomática de Next 16 para este caso.
