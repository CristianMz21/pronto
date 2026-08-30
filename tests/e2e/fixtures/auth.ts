import { test as base, expect } from '@playwright/test'

/**
 * Auth fixtures — helpers to simulate authenticated contexts without real Supabase session.
 * Proxy trusts x-user-role / x-user-id headers only when set server-side; client-side
 * mocks cannot forge them for navigation tests (proxy runs on server). Therefore
 * authenticated RBAC tests are marked E2E_SUPABASE-only with conditional skip.
 *
 * For smoke tests we merely assert unauthenticated redirects (proxy behavior without cookies).
 */

export const test = base
export { expect }

/**
 * Helper: unauthenticated redirect assertion.
 * Ensures proxy protects `path` by redirecting to /login with redirectTo.
 */
export async function expectRedirectToLogin(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)
  await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  // login should preserve redirectTo
  const url = new URL(page.url())
  expect(url.searchParams.get('redirectTo') ?? url.searchParams.get('redirect') ?? '').toContain(
    path.split('?')[0] ?? path,
  )
}
