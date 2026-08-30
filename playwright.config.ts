import { defineConfig, devices } from '@playwright/test'
// @ts-expect-error - tsc strict fix
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
    // Firefox opcional — solo en CI o cuando E2E_BROWSERS incluye firefox
    ...(process.env.E2E_BROWSERS?.includes('firefox')
      ? [{ name: 'firefox' as const, use: { ...devices['Desktop Firefox'] } }]
      : []),
  ],
  // WebServer condicional: arranca `npm run dev` si no hay Supabase dedicado
  // ni CI (donde el runner externo ya levanta el servicio).
  // Reusa servidor existente en local para no duplicar.
  webServer: !process.env.CI
    ? {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // forward critical env so dev server boots
          ...process.env,
        } as Record<string, string>,
      }
    : undefined,
})
