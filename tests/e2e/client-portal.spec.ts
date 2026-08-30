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

/**
 * Client Portal — guest book → claim por phone → historial/rebook, cancel con cancelLeadTime
 */

test.describe('Client Portal — mocked (always runs)', () => {
  test('guest book → claim via phone (mock)', async ({ page }) => {
    const phone = '+573009998877'
    await page.route('**/api/book', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          json: { appointmentId: 'appt-guest', clientId: 'client-guest-1' },
        })
      } else await route.continue()
    })
    await page.route('**/api/client/appointments', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: [
            { id: 'appt-guest', status: 'confirmed', service: 'Corte Clásico', date: '2026-09-02' },
          ],
        })
      } else await route.continue()
    })
    await page.route('**/api/auth/claim', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, json: { claimed: true, clientId: 'client-guest-1' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const book = await fetchJson(page, '/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
        date: '2026-09-02',
        time: '10:00',
        name: 'Guest User',
        phone,
      }),
    })
    expect(book.status).toBe(200)
    expect((book.json as { clientId: string }).clientId).toBeTruthy()

    const claim = await fetchJson(page, '/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, email: 'guest@example.com' }),
    })
    expect([200, 404]).toContain(claim.status)

    const hist = await fetchJson(page, '/api/client/appointments', { method: 'GET' })
    expect(hist.status).toBe(200)
    expect((hist.json as Array<{ id: string }>)[0]?.id).toBe('appt-guest')

    await page.unroute('**/api/book')
    await page.unroute('**/api/client/appointments')
    await page.unroute('**/api/auth/claim')
  })

  test('historial + rebook 1-click (mock)', async ({ page }) => {
    await page.route('**/api/client/appointments', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: [
            {
              id: 'appt-1',
              service_id: 'svc-1',
              service: 'Corte Clásico',
              date: '2026-08-15',
              status: 'completed',
            },
            {
              id: 'appt-2',
              service_id: 'svc-1',
              service: 'Corte Clásico',
              date: '2026-09-10',
              status: 'confirmed',
            },
          ],
        })
      } else await route.continue()
    })
    await page.route('**/api/book', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { serviceId: string }
        expect(body.serviceId).toBeTruthy()
        await route.fulfill({ status: 200, json: { appointmentId: 'appt-rebook', clientId: 'c1' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const hist = await fetchJson(page, '/api/client/appointments', { method: 'GET' })
    expect((hist.json as unknown[]).length).toBe(2)
    const rebook = await fetchJson(page, '/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        serviceId: 'svc-1',
        date: '2026-09-15',
        time: '11:00',
        name: 'Rebook',
        phone: '+573001112233',
      }),
    })
    expect(rebook.status).toBe(200)
    await page.unroute('**/api/client/appointments')
    await page.unroute('**/api/book')
  })

  test('cancel con cancelLeadTime → too_soon 409 (mock)', async ({ page }) => {
    const apptId = 'appt-cancel-1'
    await page.route(`**/api/client/appointments/${apptId}*`, async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() === 'DELETE') {
        if (url.searchParams.get('force') !== 'true') {
          await route.fulfill({
            status: 409,
            json: { error: 'too_soon', message: 'Cancel with at least 60 minutes' },
          })
        } else {
          await route.fulfill({ status: 200, json: { id: apptId, status: 'cancelled' } })
        }
      } else await route.continue()
    })
    await page.goto('/offline')
    const tooSoon = await fetchJson(page, `/api/client/appointments/${apptId}`, {
      method: 'DELETE',
    })
    expect(tooSoon.status).toBe(409)
    expect((tooSoon.json as { error: string }).error).toBe('too_soon')
    const ok = await fetchJson(page, `/api/client/appointments/${apptId}?force=true`, {
      method: 'DELETE',
    })
    expect(ok.status).toBe(200)
    await page.unroute(`**/api/client/appointments/${apptId}*`)
  })

  test('cancel reprogram token → slot liberado (mock)', async ({ page }) => {
    await page.route('**/api/client/appointments/appt-reschedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, json: { newAppointmentId: 'appt-new', freed: true } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/client/appointments/appt-reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-20', time: '14:00' }),
    })
    expect(res.status).toBe(200)
    expect((res.json as { freed: boolean }).freed).toBe(true)
    await page.unroute('**/api/client/appointments/appt-reschedule')
  })

  test('client pages render without auth (public)', async ({ page }) => {
    await page.goto('/client/login')
    await expect(page.locator('text=Acceso cliente')).toBeVisible({ timeout: 8000 })
    await page.goto('/client/register')
    await expect(page.locator('text=Crear cuenta')).toBeVisible({ timeout: 8000 })
    await page.goto('/client/dashboard')
    await expect(page).toHaveURL(/\/client\/login/)
  })
})
