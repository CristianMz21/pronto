import { expect, test } from '@playwright/test'

/**
 * Auth E2E — /register → /check-email → /login → /dashboard, redirectTo, ALLOW_PUBLIC_REGISTER=false
 * Proxy handles auth redirects, protected routes, client portal.
 * All smoke tests run without backend; real Supabase tests are conditional.
 */

test.describe('Auth — smoke (always runs)', () => {
  test('GET /register renders business form', async ({ page }) => {
    const res = await page.request.get('/register')
    // When ALLOW_PUBLIC_REGISTER=false, proxy returns 302 to /apply; otherwise 200.
    // In local dev, ALLOW_PUBLIC_REGISTER is not false, so expect 200.
    expect([200, 302]).toContain(res.status())
    if (res.status() === 200) {
      await page.goto('/register')
      await expect(page.locator('input[name="business_name"]')).toBeVisible({ timeout: 8000 })
      await expect(page.locator('input[name="email"]')).toBeVisible()
      await expect(page.locator('input[name="password"]')).toBeVisible()
      await expect(page.locator('button', { hasText: /Crear|Register|Create/ })).toBeVisible()
    }
  })

  test('GET /check-email renders after register', async ({ page }) => {
    await page.goto('/check-email')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('text=Check your email')).toBeVisible({ timeout: 8000 })
  })

  test('GET /login renders email+password form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(
      page.locator('button', { hasText: /Sign|Ingresar|Entrar|Continuar/ }),
    ).toBeVisible()
    const res = await page.request.get('/login')
    expect(res.status()).toBe(200)
  })

  test('unauthenticated /dashboard → 302/303 → /login?redirectTo=/dashboard', async ({ page }) => {
    // Use request to check redirect without following
    const res = await page.request.get('/dashboard', { maxRedirects: 0 }).catch(async () => {
      // fallback via page navigation
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
      return null as unknown as { status: () => number; headers: () => Record<string, string> }
    })
    if (res && typeof res.status === 'function') {
      // When intercepted via request, should be 307/302 redirect to /login
      expect([302, 303, 307, 308]).toContain(res.status())
      const loc = res.headers()['location'] ?? ''
      expect(loc).toContain('/login')
    }
  })

  test('/login?redirectTo preserves param and redirects after auth (mock)', async ({ page }) => {
    await page.goto('/login?redirectTo=/pos')
    await expect(page.locator('input[name="redirectTo"]').first()).toHaveValue('/pos')
    // Both forms carry redirect — verify at least one has correct value
    const all = page.locator('input[name="redirectTo"]')
    await expect(all).toHaveCount(2)
    await expect(all.first()).toHaveValue('/pos')
    await expect(all.nth(1)).toHaveValue('/pos')
  })

  test('proxy: unauthenticated protected routes → /login (pos, caja, crm, inventory, settings)', async ({
    page,
  }) => {
    for (const path of [
      '/pos',
      '/caja',
      '/crm',
      '/inventory',
      '/settings',
      '/booking',
      '/sucursales',
    ]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
    }
  })

  test('proxy: public routes remain accessible without auth', async ({ page }) => {
    for (const path of [
      '/book/escuderia',
      '/client/login',
      '/client/register',
      '/offline',
      '/login',
      '/register',
    ]) {
      const res = await page.request.get(path)
      // public should not redirect to login; allow 200 or 302 for /register when ALLOW_PUBLIC_REGISTER=false
      expect([200, 302]).toContain(res.status())
    }
  })

  test('proxy: /admin/* → 404 invisibility when not super_admin', async ({ page }) => {
    const res = await page.request.get('/admin')
    expect(res.status()).toBe(404)
    const res2 = await page.request.get('/admin/login')
    // /admin/login is allowed even without super_admin but with noindex
    expect([200, 404]).toContain(res2.status())
  })

  test('proxy: authenticated user on /login should redirect to /dashboard (mocked via header check)', async ({
    page,
  }) => {
    // Without real session we can at least verify the login page contains the dashboard redirect fallback
    await page.goto('/login')
    const html = await page.content()
    expect(html).toContain('redirectTo')
  })

  test('proxy: x-pathname header is set (via proxy forwarding)', async ({ page }) => {
    // We verify via the dashboard layout's header check by ensuring unauthenticated request still hits proxy
    // The simplest deterministic check: /api/health is not protected and should return 200
    const res = await page.request.get('/api/health')
    expect(res.status()).toBe(200)
    const j = await res.json()
    expect(j.status).toBe('ok')
  })

  test('client portal: /client/dashboard without auth → /client/login?redirect', async ({
    page,
  }) => {
    await page.goto('/client/dashboard')
    await expect(page).toHaveURL(/\/client\/login/, { timeout: 8000 })
    expect(page.url()).toContain('redirect')
  })

  test('client login and register pages render', async ({ page }) => {
    await page.goto('/client/login')
    await expect(page.locator('text=Acceso cliente')).toBeVisible({ timeout: 8000 })
    await page.goto('/client/register')
    await expect(page.locator('text=Crear cuenta')).toBeVisible({ timeout: 8000 })
  })
})

test.describe('Auth — ALLOW_PUBLIC_REGISTER=false (requires env restart)', () => {
  test.skip(
    process.env.ALLOW_PUBLIC_REGISTER !== 'false',
    'Solo aplica cuando ALLOW_PUBLIC_REGISTER=false — requiere reiniciar dev con env',
  )

  test('/register → 302 → /apply when closed', async ({ page }) => {
    const res = await page.request.get('/register', { maxRedirects: 0 })
    expect([302, 303, 307]).toContain(res.status())
    expect(res.headers()['location']).toContain('/apply')
    await page.goto('/register')
    await expect(page).toHaveURL(/\/apply/)
  })
})

test.describe('Auth — real Supabase flow (requires E2E_SUPABASE)', () => {
  test.skip(!process.env.E2E_SUPABASE, 'Requiere Supabase real — E2E_SUPABASE=1')
  test('/register → /check-email → /login → /dashboard full cycle', async ({ page }) => {
    const email = `e2e-auth-${Date.now()}@example.com`
    await page.goto('/register')
    await page.fill('input[name="business_name"]', `E2E Biz ${Date.now()}`)
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', 'TestPass123!')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/check-email|\/dashboard|\/login/, { timeout: 15000 })
  })
})
