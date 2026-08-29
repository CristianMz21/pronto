import { expect, test } from '@playwright/test'

// E2E placeholder — flujo crítico cliente→reserva→recepción→servicio→checkout→pago→cita completada→historial
// Requiere app levantada (docker compose up) y Supabase configurado.
// Marcado como skip hasta que haya credenciales reales en .env.

test.describe('E2E booking→POS (placeholder)', () => {
  test.skip(true, 'Requiere Supabase real y datos seed — habilitar tras FASE 1 bootstrap completo')

  test('cliente reserva pública y POS cierra venta', async ({ page }) => {
    await page.goto('/book/test-slug')
    await expect(page.locator('body')).toBeVisible()
  })
})
