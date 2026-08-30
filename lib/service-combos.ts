import { z } from 'zod'

export const ServiceComboSchema = z.object({
  name: z.string().min(1).max(120),
  service_ids: z.array(z.string().uuid()).min(1).max(20),
  price: z.coerce.number().int().min(0).max(10_000_000),
  duration_min: z.coerce.number().int().min(1).max(480),
  location_id: z.string().uuid().nullable().optional().or(z.literal('')),
  is_active: z.boolean().optional().default(true),
})

export interface ServiceCombo {
  id: string
  business_id: string
  location_id: string | null
  name: string
  service_ids: string[]
  price: number
  duration_min: number
  is_active: boolean
}

function comboApplies(combo: ServiceCombo, cartServiceIds: string[]): boolean {
  if (!combo.is_active) return false
  if (!combo.service_ids || combo.service_ids.length === 0) return false
  // All services in combo must be present in cart (combo eligibility)
  return combo.service_ids.every((sid) => cartServiceIds.includes(sid))
}

function calculateComboDiscount(
  combo: ServiceCombo,
  cartServices: { id: string; price: number }[],
): number {
  // Discount = sum of individual prices - combo price (if positive)
  const included = cartServices.filter((s) => combo.service_ids.includes(s.id))
  const sum = included.reduce((acc, s) => acc + Number(s.price), 0)
  if (sum <= combo.price) return 0
  return sum - combo.price
}

export function findBestCombo(
  combos: ServiceCombo[],
  cartServices: { id: string; price: number }[],
): { combo: ServiceCombo | null; discount: number } {
  let best: ServiceCombo | null = null
  let bestDiscount = 0
  const cartIds = cartServices.map((s) => s.id)
  for (const c of combos) {
    if (!comboApplies(c, cartIds)) continue
    const d = calculateComboDiscount(c, cartServices)
    if (d > bestDiscount) {
      bestDiscount = d
      best = c
    }
  }
  return { combo: best, discount: bestDiscount }
}
