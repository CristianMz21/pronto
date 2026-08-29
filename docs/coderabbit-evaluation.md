# CoderRabbit Evaluation for Escudero (Next.js 16 + Supabase)

> Date: 2026-08-29 | Stack: Next 16.3.2, React 19, Node 20 Alpine, Supabase (RLS), Drizzle ORM, Tailwind, next-intl | Current lint: `eslint-config-next/core-web-vitals` only (16 warnings), no Prettier/Biome, `tsc` with `skipLibCheck:true` + `ignoreBuildErrors:true`, CI: `lint + build` only.

---

## 1. Executive Summary — Recommendation

**Recommendation: YES — adopt CoderRabbit as PR layer, NOT as replacement for local static analysis.**

CoderRabbit adds value precisely where Escudero is weak today: PR-time semantic review (React 19 hooks, Server/Client boundary, Supabase RLS, i18n, accessibility) that ESLint alone misses. It is free for public open-source repos (`CristianMz21/pronto` qualifies) and setup is ~5 minutes (install GitHub App + `.coderabbit.yaml`).

**Condition:** Keep it advisory-only until the deterministic local stack (ESLint strict + `tsc --noEmit` + Prettier + Knip + Husky) is green. CoderRabbit must be layer 4 (PR review), not layer 1 (local truth). Do not activate `.coderabbit.yaml` until the parallel CLI finishing `app/**`, `tests/**`, `drizzle/**` merges — use `.coderabbit.example.yaml` in the meantime (provided at repo root).

**Expected outcome:** ~15–30% fewer review round-trips on PRs touching `app/(dashboard)` FSM/cash-register logic, better onboarding for contributors, without adding local build time.

---

## 2. What Is CoderRabbit?

CoderRabbit (https://app.coderabbit.ai) is an AI-powered GitHub App (also GitLab/Bitbucket) that reviews pull requests automatically.

**How it works:**

1. Install the GitHub App on the repo/org (https://app.coderabbit.ai) — no self-hosting. Grant read access to PRs.
2. On every PR open/sync, it clones the diff, builds a prompt with: changed files + repo context + prior learnings + configurable instructions (`.coderabbit.yaml`, `.coderabbitai.yaml`, or repo instructions file).
3. It posts inline comments + a high-level summary/walkthrough via `github-actions` checks. It can also generate PR descriptions and learn conventions (`Learnings`).
4. Configuration is YAML + UI: `language`, `tone_instructions`, `early_access`, `reviews.profile` (`chill`/`assertive`), `path_instructions` (ignore `.next`, `supabase/migrations`), `knowledge_base.learnings`.

**Learns codebase:** When you reply “this is intentional” or `@coderabbitai ignore`, it stores a learning so the same false positive does not repeat. Early-access mode improves AST/context awareness for frameworks like Next.js App Router.

**Limitations:** AI reviews are non-deterministic, may hallucinate, cannot execute tests or type-check — they complement, not replace, `tsc --noEmit` and Vitest/Playwright.

**Pricing:** Free for public open-source repos. Paid for private repos (Starter ~$20/seat/mo, Team higher). See §6.

---

## 3. CoderRabbit vs Traditional Static Analysis

### vs ESLint (current stack)

| Aspect | ESLint | CoderRabbit |
|---|---|---|
| Determinism | Deterministic, AST + plugin rules | Probabilistic LLM |
| Scope | Pattern-based (e.g., `react-hooks/*`) | Semantic/intent (e.g., "this FSM guard leaks checked_in bypass") |
| Next.js support | Via `eslint-config-next` only | Understands App Router, Server/Client, `next-intl`, Serwist |
| Type-aware | Only with `typescript-eslint` + `project:true` | Can read types but not replace `tsc --noEmit` |
| Supabase RLS | No | Can flag missing RLS check / raw SQL interpolation |
| Fixable | `--fix` | Suggests patch, human applies |
| Cost | Free, local, instant | Free OSS / paid private, ~30–90s per PR |

**Verdict:** Keep ESLint as layer 1 truth; CoderRabbit catches what ESLint rules do not.

### vs SonarCloud / SonarQube

SonarCloud provides deterministic, type-aware deep analysis: duplicated code, cognitive complexity, security hotspots (SAST), coverage gating, 30+ languages. Strong for compliance and quality gates. Trade-off: slower, heavier config, limited Next.js semantic, and quality gate can block merges. Best paired: Sonar for metrics/gates, CoderRabbit for conversational PR coaching.

### vs CodeQL

CodeQL (GitHub Advanced Security) is semantic query-based SAST — the gold standard for vulnerability detection (SQLi, XSS, path traversal). It is free for public repos. It does NOT review style, architecture, or React hooks. Use **both**: CodeQL for security scans (weekly + PR), CoderRabbit for maintainability review. They do not overlap.

### vs Biome / Oxlint

Biome (formatter + linter in Rust) and Oxlint (100x faster ESLint) optimize **speed** and **formatting**. They replace Prettier + ESLint core for latency but are less mature for Next.js/React 19 `react-hooks` 7 rules. CoderRabbit is orthogonal: AI context vs raw speed. For Escudero, Biome is a valid Phase-2 alternative to Prettier+ESLint if Oxlint covers `eslint-config-next` parity — but keep one formatter canonical.

---

## 4. Comparison Matrix

| Criteria | ESLint strict + typescript-eslint | Biome/Oxlint | SonarCloud | CodeQL | CoderRabbit AI |
|---|---|---|---|---|---|
| **Speed** | ~2–5s (lint), ~8s (type-aware) | <1s | 2–5 min | 3–8 min | 30–90s (async, off critical path) |
| **Next.js 16 compat** | ✅ `eslint-config-next` 16.3.2 | Partial (needs import/a11y plugins) | Generic JS/TS | Generic JS/TS | ✅ Early-access Next-aware |
| **Type-aware** | ✅ with `project:true` | Limited | ✅ | ✅ (dataflow) | Reads types, not sound |
| **AI context (intent)** | ❌ | ❌ | ❌ | ❌ | ✅ (FSM, RLS, i18n) |
| **Cost (OSS)** | Free | Free | Free ≤100k LOC private, OSS free | Free public | Free public, paid private |
| **Noise / false positives** | Low (tunable warn/error) | Low | Medium (cognitive complexity) | Low (security only) | Medium-high without tuning |
| **Setup effort** | Low | Low | Medium (quality gate) | Low (GitHub App) | Low (GitHub App + YAML) |
| **Open-source fit** | ✅ | ✅ | ✅ | ✅ | ✅ Free OSS tier ideal |

---

## 5. Recommended Layered Stack for Escudero

Do not pick one tool — layer them. Each layer catches a different class of defect, and failures are fast-to-slow.

### Layer 1 — Local (pre-commit, <10s)

- **ESLint strict:** `eslint-config-next/core-web-vitals` + `typescript-eslint` (`recommendedTypeChecked`) + `eslint-plugin-import` (order/cycles) + `eslint-plugin-jsx-a11y` + `eslint-plugin-react-hooks` (keep 4 new rules as `warn` until fixed) — `eslint.config.mjs:10,19`
- **Formatter:** Prettier (or Biome if team prefers single binary) — single config, `prettier --check`
- **Dead code:** Knip (`knip --no-exit-code` locally, CI fails on unused exports/deps)
- **Type correctness:** `tsc --noEmit --skipLibCheck false` locally (remove `ignoreBuildErrors` anchor `next.config.js:51` after parallel CLI)
- **Commands:** `npm run lint && npm run typecheck && npm run knip`

### Layer 2 — Pre-commit (Husky + lint-staged)

- `husky` + `lint-staged` runs ESLint `--fix` + Prettier + `tsc --noEmit` (or `tsc --noEmit --skipLibCheck` fast path) only on staged files.
- Blocks commits with `react-hooks/set-state-in-effect` regressions or formatting drift.

### Layer 3 — CI (deterministic gates, blocking)

```yaml
jobs:
  lint:        eslint . --max-warnings=0  # fail on 16 current warnings after fix-batch
  typecheck:   tsc --noEmit
  test:        vitest run --coverage  # already configured in vitest.config.ts:10
  build:       next build  # with placeholder Supabase env as today
  knip:        knip --no-dependencies
  audit:       npm audit --audit-level=moderate
```

All must be green before merge. No AI in CI — deterministic only.

### Layer 4 — PR (advisory, non-blocking initially)

- **CoderRabbit AI review** — inline suggestions + walkthrough, `profile: chill`, `request_changes_workflow: false` until noise tuned.
- **CodeQL** — `github/codeql-action` weekly + PR for security (free for `CristianMz21/pronto` public).
- SonarCloud optional later if quality-gate compliance needed.

---

## 6. Implementation Plan (Phased — Respects Parallel CLI)

Parallel CLI is touching `tests/unit/**`, `app/(dashboard)/**`, `drizzle/**` — do NOT modify `package.json`, `eslint.config.mjs`, `tsconfig.json`, `app/**`, `tests/**`, `supabase/migrations/**`, `drizzle/**` now.

### Phase 1 — No-Conflict (now, docs only) ✅ This PR

- [x] Add `docs/coderabbit-evaluation.md` (this file)
- [x] Add `.coderabbit.example.yaml` (not active, avoids auto-activation)
- [x] Add `docs/linting-roadmap.md` (step-by-step after CLI)
- No install, no config change, no CI change — zero merge conflict risk.

### Phase 2 — After Parallel CLI Merges (delegate, single PR)

- [ ] Upgrade ESLint: `typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y` — `eslint.config.mjs:3`
- [ ] Formatter: `prettier` + `.prettierrc` + `.prettierignore` (or Biome) — choose one
- [ ] Scripts: `typecheck` (`tsc --noEmit`), `format`, `knip` in `package.json:6`
- [ ] Husky + lint-staged (`.husky/pre-commit`, `lint-staged` config in `package.json`)
- [ ] CI: split `lint-and-build` into `lint | typecheck | test | build | knip` (`.github/workflows/ci.yml:10`)
- [ ] Fix 16 warnings batch (mostly `react-hooks/set-state-in-effect` in `booking-calendar.tsx:179`) — keep as separate commit
- [ ] Activate CoderRabbit: `cp .coderabbit.example.yaml .coderabbit.yaml`, install GitHub App, set `reviews.request_changes_workflow: false` for 2 weeks, then tighten
- [ ] CodeQL: add `.github/workflows/codeql.yml`

### Phase 3 — Tune (2–4 weeks after Phase 2)

- Promote `react-hooks/*` warns to errors in `eslint.config.mjs:20` once fixed.
- Set `next.config.js:51` `typescript.ignoreBuildErrors: false` and fix `tsc --noEmit` errors.
- Evaluate `reviews.profile: assertive` vs noise; add `path_instructions` learnings from PRs.
- Add SonarCloud only if team wants coverage/duplicate-code gates.

---

## 7. Costs (Estimate for `CristianMz21/pronto`)

| Plan | Price | Applies to Escudero? |
|---|---|---|
| **Open Source (public repo)** | **Free, unlimited** | ✅ `CristianMz21/pronto` is public — no cost |
| Starter (private) | ~$12–20 per seat/mo | Only if repo made private or org private repos |
| Team/Enterprise | Custom | Needed for SSO, self-hosted, SLA |

For Escudero today: **$0**. No billing setup required. If a private mirror is used for client deployments, budget ~$15/seat/mo for that mirror only; public upstream stays free. Always verify at https://coderabbit.ai/pricing — pricing changes.

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Parallel CLI merge conflicts** | High if activated now | Use `.coderabbit.example.yaml` (inactive); activate only after CLI merge (Phase 2) |
| **Noise / nitpick fatigue** | Medium | Start `profile: chill`, `collapse_walkthrough: true`, path-ignores for `.next/public/supabase`, tune learnings weekly |
| **AI hallucinations / wrong suggestions** | Medium | Keep CoderRabbit **advisory** (`request_changes_workflow: false`); deterministic CI (ESLint + `tsc --noEmit`) remains blocking |
| **Not a replacement for tests** | High if misunderstood | Vitest/Playwright already in `vitest.config.ts:7` — add to CI in Phase 2; CoderRabbit never gates coverage |
| **Privacy / code sent to LLM** | Low for OSS | Public repo code already public; for private deployments review DPA; avoid sending secrets (already in `.env.example` pattern) |
| **Vendor lock-in** | Low | Config is portable; alternative in §9; removal is uninstalling GitHub App + deleting YAML |

---

## 9. Alternatives If Not CoderRabbit

- **Sourcery** (sourcery.ai) — Similar AI PR reviews, strong Python focus, less Next.js tuning. Paid private, free OSS limited.
- **SonarQube + SonarCloud + CodeRabbit self-host** — If AI review must be self-hosted for data residency, consider CodeRabbit self-host or Greptile, but operational cost higher.
- **No AI — deterministic only** — Valid choice: ESLint strict + SonarCloud + CodeQL covers 90% of defects without AI noise. Trade-off: misses semantic intent bugs (FSM bypass, RLS missing, i18n key drift) that CoderRabbit catches.

---

## 10. References

- CoderRabbit docs & explore: https://app.coderabbit.ai/explore — https://docs.coderabbit.ai
- Next.js ESLint: https://nextjs.org/docs/app/api-reference/config/eslint
- `eslint-config-next` React Hooks 7 warnings: `eslint.config.mjs:12`
- CI today: `.github/workflows/ci.yml:10` | TypeScript workaround: `next.config.js:51` | Vitest config: `vitest.config.ts:5`

*Fork notice: Escudero is a fork of SGrappelli/pronto (MIT) — READMEs already attribute `SGrappelli/pronto@1a50f5f`; no change needed per task scope.*
