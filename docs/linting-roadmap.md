# Roadmap de Linting y Calidad — Escudero

> Stack: Next.js 16.3.2 + React 19 + TypeScript `strict:true` + Supabase (RLS) + Drizzle + `eslint-config-next/core-web-vitals` (16 warnings activos). CI hoy solo `lint + build`. Objetivo: llegar a best practices sin romper el trabajo paralelo de la CLI que toca `tests/unit`, `app/(dashboard)`, `drizzle`.

Idioma: español (términos técnicos en inglés: ESLint, Prettier, Knip, Husky, CI, PR).

---

## 1. Principios

- **Capas, no reemplazos:** CoderRabbit no sustituye a ESLint ni a `tsc --noEmit`. Cada capa atrapa defectos distintos.
- **Cero conflictos con CLI paralela:** Fase 1 solo docs (este archivo + `docs/coderabbit-evaluation.md` + `.coderabbit.example.yaml`). No tocar `package.json`, `eslint.config.mjs`, `tsconfig.json`, `app/**`, `tests/**`, `supabase/migrations/**`, `drizzle/**` hasta que la CLI termine.
- **CI determinístico bloquea merge; AI solo aconseja.**

---

## 2. Checklist por Fases

### Fase 1 — Ahora (sin conflicto) ✅

- [x] `docs/coderabbit-evaluation.md` creado — evaluación técnica completa
- [x] `.coderabbit.example.yaml` creado (no activo, evita auto-activación)
- [x] Este roadmap creado
- [ ] Compartir con equipo, acordar formatter (Prettier vs Biome — recomiendo **Prettier** para compatibilidad `eslint-config-next`)

No instalar dependencias ni cambiar config en esta fase.

### Fase 2 — Después de la CLI (1 PR dedicado, delegable)

> Cuando la CLI termine `app/**`, `tests/**`, `drizzle/**`, hacer **un solo PR** con estos cambios.

**ESLint strict:**

- [ ] Instalar: `npm i -D @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-import eslint-plugin-jsx-a11y knip prettier eslint-config-prettier`
- [ ] Extender `eslint.config.mjs` con `typescript-eslint/recommendedTypeChecked` + `import` + `jsx-a11y`. Mantener `eslint-config-next/core-web-vitals` como base.
- [ ] Activar `project: true` para type-aware linting (usa `tsconfig.json`).
- [ ] Mantener las 4 reglas `react-hooks/*` en `warn` hasta fix batch:
  ```js
  // eslint.config.mjs:19 — hoy en warn, promover a error en Fase 3
  'react-hooks/set-state-in-effect': 'warn'
  ```

**Formatter:**

- [ ] `prettier` + `.prettierrc` (ej: `{ "semi": false, "singleQuote": true, "printWidth": 100 }`) + `.prettierignore` (`.next`, `public`, `coverage`)
- [ ] O alternativa **Biome**: `npx @biomejs/biome init` — elegir uno, no ambos

**Scripts `package.json`:**

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "knip": "knip"
  }
}
```

**Pre-commit (Husky + lint-staged):**

- [ ] `npm i -D husky lint-staged`
- [ ] `npx husky init` → `.husky/pre-commit` con `npx lint-staged`
- [ ] `package.json`:
  ```json
  {
    "lint-staged": {
      "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
      "*.{json,md,css}": ["prettier --write"]
    }
  }
  ```

**CI — `.github/workflows/ci.yml` (split del job único):**

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, run: npm run lint]
  typecheck:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, run: npm run typecheck]
  test:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, run: npm run test:unit -- --coverage]
  build:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, run: npm run build]
    env: { NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co, ... }
  knip:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, run: npm run knip]
```

**Fix batch de 16 warnings:**

- [ ] `npm run lint` → fijar `booking-calendar.tsx:179` y similares (extraer `getMonday` fuera de effect o usar `useSyncExternalStore`/`useState` lazy init)
- [ ] Commit separado `fix(lint): resolve react-hooks warnings` — facilita review

**Activar CoderRabbit + CodeQL:**

- [ ] `cp .coderabbit.example.yaml .coderabbit.yaml`
- [ ] Instalar GitHub App en `CristianMz21/pronto` (https://app.coderabbit.ai)
- [ ] Añadir `.github/workflows/codeql.yml` (`github/codeql-action` init + autobuild + analyze, free para repo público)

### Fase 3 — Tune (2–4 semanas después)

- [ ] Promover `react-hooks/*` de `warn` a `error` en `eslint.config.mjs:19`
- [ ] Cambiar `next.config.js:51` `typescript.ignoreBuildErrors` de `true` a `false` y corregir errores de `tsc --noEmit`
- [ ] Evaluar `skipLibCheck: false` en `tsconfig.json:7` (hoy `true` oculta errores de tipos)
- [ ] Ajustar CoderRabbit `profile: chill` → `assertive` si ruido bajo; añadir learnings
- [ ] (Opcional) SonarCloud si se quiere quality gate de duplicación/complejidad

---

## 3. Comandos Útiles (para Fase 2)

```bash
# Ver estado actual
npm run lint
npx tsc --noEmit
npx knip

# Después de instalar Fase 2
npm run lint:fix
npm run format
npm run typecheck
npm run knip -- --dependencies

# Pre-commit manual
npx lint-staged

# CI local (simula GitHub Actions)
npm run lint && npm run typecheck && npm run test:unit && npm run build
```

---

## 4. Qué Delegar y Cuándo

- **Ahora:** nada — Fase 1 es solo lectura de docs.
- **Al terminar CLI:** delegar Fase 2 como **un sub-agente writer** (multi-file rule) — incluye `package.json`, `eslint.config.mjs`, `prettier`, `husky`, `ci.yml`. El orquestador no debe hacerlo inline.
- **Review:** después de Fase 2, review en fresh context (PR rule) antes de merge, verificando que `npm run lint -- --max-warnings=0` y `tsc --noEmit` pasan en local.
- **CoderRabbit:** activar solo tras PR Fase 2 mergeado, para que aprenda sobre código ya formateado.

---

## 5. Criterios de Éxito

- `npm run lint` → 0 warnings (hoy 16)
- `npm run typecheck` → 0 errores con `ignoreBuildErrors: false`
- `npm run format:check` → pass
- CI con 5 jobs verdes (lint, typecheck, test, build, knip)
- CoderRabbit comenta PRs sin bloquear, con <20% falsos positivos tras 2 semanas de learnings

---

## 6. Riesgos si no se hace

- `ignoreBuildErrors:true` + `skipLibCheck:true` esconden regresiones de tipos que explotan en runtime (ej: `appointments` FSM guarda `checked_in` sin validar `employee_services`).
- 16 warnings se convierten en 50+ si no se atajan ahora — deuda que bloquea upgrades de Next/React.
- Sin `knip`, código muerto de `lib/` y `app/(dashboard)` se acumula sin detección.

---

## Referencias

- Evaluación detallada: `docs/coderabbit-evaluation.md`
- Config ejemplo: `.coderabbit.example.yaml` (copiar a `.coderabbit.yaml` para activar)
- ESLint actual: `eslint.config.mjs:10` | TS workaround: `next.config.js:51` | CI: `.github/workflows/ci.yml:10`
