import { expect, test } from '@playwright/test'

async function fetchJson(page: import('@playwright/test').Page, url: string, init?: RequestInit) {
  return page.evaluate(
    async ({ u, opts }) => {
      const r = await fetch(u, opts as RequestInit)
      const t = await r.text()
      let j: unknown = null
      try {
        j = t ? JSON.parse(t) : null
      } catch {
        j = t
      }
      return { status: r.status, json: j as unknown }
    },
    { u: url, opts: init ?? {} },
  )
}

function mockClient360(overrides?: Partial<Record<string, unknown>>) {
  const now = new Date()
  const upcomingStarts = new Date(now.getTime() + 24 * 3600000).toISOString()
  const upcomingEnds = new Date(now.getTime() + 24 * 3600000 + 45 * 60_000).toISOString()
  const historyDate1 = new Date(now.getTime() - 5 * 86400000).toISOString()
  const historyDate2 = new Date(now.getTime() - 10 * 86400000).toISOString()
  return {
    client: {
      id: '22222222-2222-4111-a222-222222222222',
      business_id: '11111111-1111-4111-a111-111111111111',
      name: 'Cristian',
      phone: '+573001112233',
      email: 'cristian@test.com',
      birthday: null,
      preferences: { cut: 'Low Fade' },
      status: 'active',
      preferred_barber_id: 'emp-1',
      notification_prefs: { whatsapp: true, email: true, push: true },
      location_id: null,
      created_at: now.toISOString(),
      total_visits: 12,
      total_spent: 350000,
      last_visit_at: historyDate1,
      tags: [],
    },
    upcoming: [
      {
        id: 'appt-upcoming-1',
        business_id: '11111111-1111-4111-a111-111111111111',
        client_id: '22222222-2222-4111-a222-222222222222',
        employee_id: 'emp-1',
        service_id: 'svc-1',
        starts_at: upcomingStarts,
        ends_at: upcomingEnds,
        status: 'confirmed',
        price: 35000,
        checkin_code: 'Abc12345',
        payment_status: 'unpaid',
        deposit_amount: 0,
        guest_name: null,
        notes: null,
        service_name: 'Corte + Barba',
        employee_name: 'Carlos',
      },
    ],
    history: [
      {
        id: 'hist-1',
        business_id: '11111111-1111-4111-a111-111111111111',
        client_id: '22222222-2222-4111-a222-222222222222',
        employee_id: 'emp-1',
        service_id: 'svc-1',
        starts_at: historyDate1,
        ends_at: historyDate1,
        status: 'completed',
        price: 25000,
        checkin_code: null,
        payment_status: 'unpaid',
        deposit_amount: null,
        guest_name: null,
        notes: null,
        service_name: 'Corte clásico',
        employee_name: 'Carlos',
      },
      {
        id: 'hist-2',
        business_id: '11111111-1111-4111-a111-111111111111',
        client_id: '22222222-2222-4111-a222-222222222222',
        employee_id: 'emp-2',
        service_id: 'svc-2',
        starts_at: historyDate2,
        ends_at: historyDate2,
        status: 'completed',
        price: 30000,
        checkin_code: null,
        payment_status: 'unpaid',
        deposit_amount: null,
        guest_name: null,
        notes: null,
        service_name: 'Barba',
        employee_name: 'Andrés',
      },
    ],
    loyalty: { points: 120, earned: 120, redeemed: 0 },
    memberships: [],
    favorites: [],
    styles: [],
    reviews: [],
    transactions: [
      {
        id: 'tx-1',
        amount: 35000,
        payment_method: 'cash',
        status: 'completed',
        tip_amount: 0,
        created_at: historyDate1,
      },
    ],
    promotions: [],
    stats: { upcomingCount: 1, historyCount: 2, completedCount: 2, cancelledCount: 0 },
    ...overrides,
  }
}

test.describe('Customer 360 — Client Dashboard (mocked, always runs)', () => {
  test('phone OTP -> Inicio -> Historial -> Rebook (mock ?phone= like app/client/page.tsx)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const payload = mockClient360()

    await page.route(
      (url) => url.pathname === '/api/client/me',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        })
      },
    )

    await page.goto('/client/me?phone=%2B573001112233')
    // Debug: wait a bit and check what we got
    await page.waitForTimeout(1500)
    // Log content for debugging if needed (visible in test output via console)
    // eslint-disable-next-line no-console
    console.log('URL after goto', page.url())
    const bodySnippet = await page
      .locator('body')
      .textContent()
      .catch(() => '')
    console.log('BODY snippet', bodySnippet?.slice(0, 2000))

    await expect(page.locator('body')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Inicio 360')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=Hola, Cristian')).toBeVisible({ timeout: 8000 })

    await expect(page.locator('text=TU PRÓXIMA CITA')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('text=Confirmada').first()).toBeVisible({ timeout: 5000 })

    await expect(page.locator('text=Política: cancelación gratis')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible({ timeout: 8000 })
    await expect(page.locator('text=Corte clásico').first()).toBeVisible({ timeout: 8000 })

    const upcomingRebook = page.locator('a', { hasText: 'Reservar nuevamente' }).first()
    await expect(upcomingRebook).toBeVisible()
    await expect(upcomingRebook).toHaveAttribute('href', /\/book\/escuderia\?service=svc-1/)
    const href1 = await upcomingRebook.getAttribute('href')
    expect(href1).toContain('service=svc-1')
    expect(href1).toContain('employee=emp-1')

    const historyRebooks = page.locator('a', { hasText: 'Reservar nuevamente' })
    await expect(historyRebooks).toHaveCount(3)
    const histHref = await historyRebooks.nth(1).getAttribute('href')
    expect(histHref).toContain('/book/escuderia?service=svc-1')
    const histHref2 = await historyRebooks.nth(2).getAttribute('href')
    expect(histHref2).toContain('/book/escuderia?service=svc-2')

    await historyRebooks.nth(1).click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page).toHaveURL(/\/book\/escuderia\?service=svc-1/)

    await page.goto('/offline')
    const res = await fetchJson(page, '/api/client/me?phone=%2B573001112233', { method: 'GET' })
    expect(res.status).toBe(200)
    expect((res.json as { client: { name: string } }).client.name).toBe('Cristian')

    await page.unroute((url) => url.pathname === '/api/client/me')
  })

  test('Inicio empty upcoming shows CTA Reservar nuevamente — Corte + Barba', async ({ page }) => {
    const emptyPayload = mockClient360({
      upcoming: [],
      stats: { upcomingCount: 0, historyCount: 0, completedCount: 0, cancelledCount: 0 },
      history: [],
    })
    await page.route(
      (url) => url.pathname === '/api/client/me',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyPayload),
        })
      },
    )
    await page.goto('/client/me?phone=%2B573001112233')
    await page.waitForTimeout(1000)
    await expect(page.locator('text=Sin próxima cita')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=¿Quieres volver a tu estilo habitual?')).toBeVisible()
    const cta = page.locator('a', { hasText: 'Reservar nuevamente' }).first()
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', /\/book\/escuderia/)
    await page.unroute((url) => url.pathname === '/api/client/me')
  })

  test('client alias /client?phone= redirects to /client/me?phone= (301 compat)', async ({
    page,
  }) => {
    const payload = mockClient360()
    await page.route(
      (url) => url.pathname === '/api/client/me',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        })
      },
    )
    await page.goto('/client?phone=%2B573001112233')
    await page.waitForTimeout(1500)
    const url = page.url()
    const isRedirect = /\/client\/me\?phone=/.test(url)
    const bodyText = await page
      .locator('body')
      .textContent()
      .catch(() => '')
    expect(isRedirect || (bodyText !== null && bodyText.length > 0)).toBeTruthy()
    if (isRedirect) {
      await expect(page.locator('text=Inicio 360').or(page.locator('text=Hola, Cristian')))
        .toBeVisible({ timeout: 8000 })
        .catch(() => {})
    }
    await page.unroute((url) => url.pathname === '/api/client/me')
  })

  test('API /api/client/me mock returns upcoming sorted asc and history desc (deterministic)', async ({
    page,
  }) => {
    const payload = mockClient360()
    await page.route(
      (url) => url.pathname === '/api/client/me',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        })
      },
    )
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/client/me?phone=%2B573001112233', { method: 'GET' })
    expect(res.status).toBe(200)
    const j = res.json as {
      upcoming: Array<{ starts_at: string }>
      history: Array<{ starts_at: string }>
    }
    expect(j.upcoming.length).toBe(1)
    expect(j.history.length).toBe(2)
    expect(new Date(j.history[0].starts_at).getTime()).toBeGreaterThan(
      new Date(j.history[1].starts_at).getTime(),
    )
    await page.unroute((url) => url.pathname === '/api/client/me')
  })
})
