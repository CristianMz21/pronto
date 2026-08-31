/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make reasoning and tree-shaking harder.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Orphan modules are not reachable from any entry point. Next.js App Router route files are entry points by framework convention.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.next/',
          '(^|/)coverage/',
          '(^|/)playwright-report/',
          '(^|/)test-results/',
          '\\.config\\.(js|mjs|cjs|ts)$',
          '(^|/)tests/',
          '(^|/)drizzle/',
          'lib/supabase/database\\.types\\.ts',
          // Next.js App Router entry points — not imported statically
          '(^|/)app/.*/(page|layout|route|loading|error|global-error|not-found|template)\\.(tsx|ts|js)$',
          '(^|/)app/(page|layout)\\.tsx$',
          '(^|/)app/sw\\.ts$',
          '(^|/)app/(robots|sitemap)\\.ts$',
          '(^|/)proxy\\.ts$',
          // Domain/Application scaffolding — expected to be orphan until wired
          // Keep these visible but allowlist via comment if intentionally unused:
          // '(^|/)src/',
        ],
      },
      to: {},
    },
    // --- Layering: domain must stay pure ---
    {
      name: 'no-domain-imports-lib-or-app',
      severity: 'error',
      comment:
        'src/domain is the innermost hexagon — it must not depend on lib/, app/, components/ or hooks/.',
      from: { path: '^src/domain' },
      to: { path: '^(app|lib|components|hooks|proxy\\.ts)' },
    },
    {
      name: 'no-application-imports-app-or-components',
      severity: 'warn',
      comment:
        'src/application should not depend on app/ or components/ (inward dependency only). Allowed: src/domain, lib/ for ports/adapters.',
      from: { path: '^src/application' },
      to: { path: '^(app|components)' },
    },
    // --- Lib must not import app/components (adapters should not know UI) ---
    {
      name: 'no-lib-imports-app',
      severity: 'error',
      comment: 'lib/ is a shared kernel — it must not import from app/ (App Router leaves).',
      from: { path: '^lib' },
      to: { path: '^app' },
    },
    {
      name: 'no-lib-imports-components',
      severity: 'warn',
      comment:
        'lib/ should rarely import components/. Prefer the reverse direction. Warn only to allow gradual cleanup.',
      from: { path: '^lib' },
      to: { path: '^components' },
    },
    // --- Components must not import app (UI cannot know routes) ---
    {
      name: 'no-components-imports-app',
      severity: 'error',
      comment: 'components/ must not import from app/ — App Router pages own the composition.',
      from: { path: '^components' },
      to: { path: '^app' },
    },
    {
      name: 'no-hooks-imports-app',
      severity: 'error',
      comment: 'hooks/ must not import from app/.',
      from: { path: '^hooks' },
      to: { path: '^app' },
    },
    // --- No source -> test imports ---
    {
      name: 'no-source-depends-on-tests',
      severity: 'error',
      comment: 'Source code must not depend on test files.',
      from: { pathNot: '(^|/)(tests|__tests__|__mocks__)/|\\.test\\.|\\.spec\\.' },
      to: { path: '(^|/)(tests|__tests__|__mocks__)/|\\.test\\.|\\.spec\\.' },
    },
    // --- No non-test -> dev-only deps leakage (optional hygiene) ---
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment: 'Unresolvable dependencies are likely typos or missing aliases.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    // App Router: treat app/**/page.tsx, layout.tsx, route.ts as entry points implicitly via orphan rule
    // Exclude generated and infra paths
    exclude: {
      path: 'node_modules|.next|coverage|playwright-report|test-results|.git',
    },
    // We use @/* -> ./* alias; dependency-cruiser resolves via tsconfig if present
    tsConfig: { fileName: 'tsconfig.json' },
    // Keep for Next.js: allow @/* and relative
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
        theme: {
          graph: { splines: 'ortho' },
          modules: [
            { criteria: { source: '^app' }, attributes: { fillcolor: '#7acc8f' } },
            { criteria: { source: '^components' }, attributes: { fillcolor: '#8dc7ff' } },
            { criteria: { source: '^lib' }, attributes: { fillcolor: '#ffd77e' } },
            { criteria: { source: '^src/domain' }, attributes: { fillcolor: '#ff9e9e' } },
            { criteria: { source: '^src/application' }, attributes: { fillcolor: '#d9a7ff' } },
          ],
          dependencies: [
            { criteria: { resolved: '^src/domain' }, attributes: { color: '#ff4d4d' } },
          ],
        },
      },
    },
  },
}
