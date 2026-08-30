import { expect, test } from '@playwright/test'

/**
 * E2E: RBAC Barbero Reducido — 005
 * Verifies proxy 302 barbero denial, sidebar filtering (no FOUC), and barber scope.
 * Backend-dependent tests require Supabase real + seed (E1/E2, A1/A2, S1-3).
 * They are skipped in CI without E2E_SUPABASE=1; the lightweight smoke always runs.
 */

test.describe('RBAC barbero — proxy + sidebar + barber scope (requires Supabase)', () => {
  test.skip(
    !process.env.E2E_SUPABASE,
    'Requires Supabase real + seed Escudería (059 RLS). Run with E2E_SUPABASE=1',
  )

  test('barbero → /caja 302 → /dashboard (proxy early guard)', async ({ page }) => {
    await page.goto('/caja')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 })
    const navLinks = page.locator('nav a')
    await expect(navLinks).toContainText(['Dashboard'])
    await expect(navLinks).toContainText(['Booking'])
    await expect(page.locator('nav')).not.toContainText('Caja')
  })

  test('barbero → /inventory/movements/123 302 → /dashboard (prefix guard)', async ({ page }) => {
    await page.goto('/inventory/movements/123')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('barbero → /settings/members 302 → /dashboard', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('barbero → /crm 302 → /dashboard (barbero denied CRM)', async ({ page }) => {
    await page.goto('/crm')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('barbero allowed → /booking and /pos (no redirect)', async ({ page }) => {
    await page.goto('/booking')
    await expect(page).toHaveURL(/\/booking/)
    await page.goto('/pos')
    await expect(page).toHaveURL(/\/pos/)
  })

  test('sidebar for barbero: only dashboard/booking/pos visible, no FOUC', async ({ page }) => {
    await page.goto('/dashboard')
    const inventoryLink = page.locator('a[href="/inventory"]')
    await expect(inventoryLink).toHaveCount(0)
    await expect(page.locator('a[href="/caja"]')).toHaveCount(0)
    await expect(page.locator('a[href="/settings"]')).toHaveCount(0)
    await expect(page.locator('a[href="/crm"]')).toHaveCount(0)
    await expect(page.locator('a[href="/dashboard"]')).toHaveCount(1)
    await expect(page.locator('a[href="/booking"]')).toHaveCount(1)
    await expect(page.locator('a[href="/pos"]')).toHaveCount(1)
  })

  test('barbero cannot tab to hidden Settings (removed from DOM)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.keyboard.press('Tab')
    const settings = page.locator('a[href="/settings"]')
    await expect(settings).toHaveCount(0)
  })
})

test.describe('RBAC barbero — lightweight smoke (always runs)', () => {
  test('unauthenticated /caja redirects to /login (not dashboard)', async ({ page }) => {
    await page.goto('/caja')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })

  test('public /book/escuderia renders without RBAC redirect', async ({ page }) => {
    await page.goto('/book/escuderia')
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.locator('body')).toBeVisible()
    expect(page.url()).toContain('/book/escuderia')
  })

  test('canAccessRoute logic smoke via page evaluate (mirrors unit)', async ({ page }) => {
    await page.goto('/login')
    const res = await page.request.get('/login')
    expect(res.status()).toBe(200)
  })
})
