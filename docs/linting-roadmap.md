# Roadmap de Linting y Calidad — Escudero

> Stack: Next.js 16.3.2 + React 19 + TypeScript `strict:true` + Supabase (RLS) + Drizzle + `eslint-config-next/core-web-vitals`. CI hoy 9 jobs (lint + typecheck + test + knip + depcruise + bundle-analyzer + lighthouse + build + audit). Objetivo: **super strict typing** en TODOS los borders con zod — sin romper el trabajo paralelo.

Idioma: español (términos técnicos en inglés: ESLint, Zod, CI, PR).

---

## 1. Principios

- **Capas, no reemplazos:** CoderRabbit no sustituye a ESLint ni a `tsc --noEmit`. Cada capa atrapa defectos distintos.
- **Borders primero:** Todo dato que cruza un border (FormData, JSON, headers, query, Supabase) debe pasar por zod o por helpers tipados.
- **Infra antes de fixes masivos:** PR0 solo cimientos; no intentar fixear las 528 warns de golpe.
- **CI determinístico bloquea merge; AI solo aconseja.**

---

## 2. Estado Actual (2026-08-30) — Baseline

- `npm run lint` → **~528 warns** (principalmente `@typescript-eslint/no-unsafe-*` + `sonarjs/cognitive-complexity` + `@next/next/no-img-element`). CI usa `npx eslint . --max-warnings 600` para no bloquear mientras se paga deuda.
- `tsc --noEmit` → con `ignoreBuildErrors: true` en `next.config.js:59` para no romper `next build` en Docker. Drift de tipos de Supabase aún no bloquea build; `typecheck` job es non-blocking con fallback `|| echo ...`.
- `tsconfig.json` → `strict:true` + 8 flags extra: `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, **`noPropertyAccessFromIndexSignature` (PR0)**, **`noImplicitReturns` (PR0)**. `skipLibCheck:true` aún activo (PR10 evaluará `false`).
- Scripts nuevos (PR0):
  - `lint:strict` → `eslint . --max-warnings 0`
  - `typecheck:strict` → `tsc --noEmit --skipLibCheck false`
  - `quality:strict` → `lint --max-warnings 0 && typecheck && knip --strict && depcruise`

---

## 3. PR0 — Cimientos (este PR) ✅

Solo infraestructura, **no** fix masivo de warns. Cambios:

- **tsconfig.json**: añade `noPropertyAccessFromIndexSignature:true` + `noImplicitReturns:true`
- **package.json**: añade `quality:strict`, `typecheck:strict`, `lint:strict`
- **eslint.config.mjs**: añade roadmap + `TODO(PR10)` junto a cada `@typescript-eslint/no-unsafe-*` en `warn` (no flip a `error` aún)
- **lib/supabase/typed.ts** (nuevo):
  ```ts
  import type { Database } from './database.types'
  export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
  export type Insert<T> = Database['public']['Tables'][T]['Insert']
  export type Update<T> = Database['public']['Tables'][T]['Update']
  export function assertNever(x: never): never
  export function isRecord(v: unknown): v is Record<string, unknown>
  export function createTypedServiceClient(): SupabaseClient<Database>
  ```
- **lib/validation/schemas.ts** (nuevo):
  ```ts
  LoginFormSchema: { email: z.string().email(), password: z.string().min(1), redirectTo: z.string().optional() }
  BookingSchema: { businessId, serviceId, startsAt, endsAt, ... }
  HeadersSchema: { 'x-location-id': z.string().uuid().optional(), ... }
  export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T
  ```
- **lib/validation/guard.ts** (nuevo):
  ```ts
  export function isRecord(v: unknown): v is Record<string, unknown>
  export function asString(v: unknown, fallback?: string): string | undefined
  export function ensureString(v: FormDataEntryValue | null): string
  export function getFormString(formData: FormData, key: string): string | undefined
  export function getRequiredFormString(formData: FormData, key: string): string
  ```

Verificación PR0:
```bash
npm run typecheck
npx tsc --noEmit --skipLibCheck false || echo "expected drift until PR10"
npm run lint
npx eslint lib/supabase/typed.ts lib/validation/schemas.ts lib/validation/guard.ts --max-warnings 0
```

---

## 4. Checklist por Fases (PR1 → PR10)

### PR1-2 — Borders FormData / JSON

- Migrar `app/**/actions.ts` y `app/api/**` a `parseOrThrow(LoginFormSchema, formData)` + `guard.ts` helpers.
- Cada `FormData.get()` debe pasar por `ensureString` / `getRequiredFormString` o zod.
- Reducir ~80-100 warns de `no-unsafe-*` en actions.

### PR3-4 — Supabase Borders

- Reemplazar `supabase.from('table').select()` sin genérico por `Tables<'appointments'>`, `Insert<'clients'>`, `Update<'services'>` desde `lib/supabase/typed.ts`.
- Tipar `maybeSingle()` / `single()` con `Tables<T>` en lugar de `as { ... }`.
- Reducir ~120 warns de `no-unsafe-assignment` en queries.

### PR5-6 — Proxy / Headers / Cookies

- `proxy.ts` ya valida `x-location-id` con regex UUID; migrar a `HeadersSchema.safeParse(headers)`.
- `lib/auth/roles.ts` + `lib/admin-secret.ts` → validar con zod en borders.
- Estandarizar `x-pathname`, `x-user-*` headers con tipos.

### PR7-8 — Index Signatures + Unchecked Access

- Limpiar `noUncheckedIndexedAccess` violations: guard `if (arr[i])` o `arr.at(i)`.
- Limpiar `noPropertyAccessFromIndexSignature`: usar `obj["key"]` o `isRecord` guard.
- Habilitar `sonarjs/cognitive-complexity: error` progresivo.

### PR9 — noImplicitReturns + Flags Restantes

- Asegurar todo `if/else` retorna; fix `noImplicitReturns` violations (~15-20).
- Evaluar `skipLibCheck: false` definitivamente (`typecheck:strict`).

### PR10 — Flip a Super-Strict ✅

- Promover en `eslint.config.mjs`:
  ```js
  '@typescript-eslint/no-unsafe-assignment': 'error' // was warn
  '@typescript-eslint/no-unsafe-member-access': 'error'
  '@typescript-eslint/no-unsafe-call': 'error'
  '@typescript-eslint/no-unsafe-argument': 'error'
  '@typescript-eslint/no-unsafe-return': 'error'
  ```
- Cambiar CI `npx eslint . --max-warnings 600` → `--max-warnings 0` (usa `lint:strict`).
- Cambiar `next.config.js` `typescript.ignoreBuildErrors` de `true` → `false`.
- `npm run quality:strict` debe pasar en CI como gate bloqueante.

---

## 5. Comandos Útiles

```bash
# Ver estado actual
npm run lint                    # ~528 warns, no bloquea
npm run lint:strict             # 0 warns requerido para PR10
npm run typecheck               # skipLibCheck:true
npm run typecheck:strict        # skipLibCheck:false (PR10 target)
npm run quality:strict          # gate final PR10
npx tsc --noEmit --skipLibCheck false

# Validación PR0 (cimientos)
npx eslint lib/supabase/typed.ts lib/validation/schemas.ts lib/validation/guard.ts --max-warnings 0

# Después de cada PR de borders
npm run lint -- --max-warnings 600   # ratchet: bajar 600 → 500 → 400 → 0
npx knip --strict
npm run depcruise

# Pre-commit manual
npx lint-staged

# CI local (simula GitHub Actions)
npm run lint && npm run typecheck && npm run test:unit && npm run build
```

---

## 6. Qué Delegar y Cuándo

- **PR0:** un solo writer (este PR) — toca `tsconfig.json`, `package.json`, `eslint.config.mjs`, `lib/supabase/typed.ts`, `lib/validation/*`, `docs/linting-roadmap.md`. No fix masivo.
- **PR1-PR9:** cada PR un slice autónomo con work-unit commits, 300-400 líneas máx. Un sub-agente writer por PR + fresh review antes de merge.
- **PR10:** flip final + CI ratchet. Requiere fresh review + `quality:strict` verde.
- **CoderRabbit:** activar solo tras PR10 o cuando `lint:strict` esté cerca, para que aprenda sobre código ya tipado.

---

## 7. Criterios de Éxito

- `npm run lint:strict` → 0 warns (hoy 528 → PR10: 0)
- `npm run typecheck:strict` → 0 errores con `skipLibCheck:false` y `ignoreBuildErrors:false`
- `npm run quality:strict` → pass (lint + typecheck + knip --strict + depcruise)
- `npm run format:check` → pass
- CI con 9 jobs verdes (lint, typecheck, test, knip, depcruise, bundle-analyzer, lighthouse, build, audit) — typecheck y lint pasan a bloqueantes en PR10
- `lib/supabase/typed.ts` + `lib/validation/*` usados en >80% de borders (FormData, JSON, Supabase, headers)

---

## 8. Riesgos si no se hace

- `ignoreBuildErrors:true` + `skipLibCheck:true` esconden regresiones de tipos que explotan en runtime (ej: `appointments` FSM guarda `checked_in` sin validar `employee_services`).
- 528 warns se convierten en 700+ si no se atajan ahora — deuda que bloquea upgrades de Next/React.
- Sin `Tables<T>` / `parseOrThrow` en borders, cada `as any` propaga `unknown` → runtime 500 en Supabase y proxy.
- Sin `knip --strict` + `depcruise`, código muerto de `lib/` y `app/(dashboard)` se acumula sin detección.

---

## Referencias

- Evaluación detallada: `docs/coderabbit-evaluation.md`
- Config ejemplo: `.coderabbit.example.yaml` (copiar a `.coderabbit.yaml` para activar)
- ESLint actual: `eslint.config.mjs:72` (`no-unsafe-*` en `warn` con `TODO(PR10)`) | TS: `tsconfig.json:7` | CI: `.github/workflows/ci.yml:36`
- Cimientos PR0: `lib/supabase/typed.ts`, `lib/validation/schemas.ts`, `lib/validation/guard.ts`
