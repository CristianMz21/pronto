/**
 * Commission calculation — mirrors 043_commission_trigger.sql
 * Fixed takes priority over percentage.
 */
export function calcCommission(
  amount: number,
  rate: number | null | undefined,
  fixed: number | null | undefined,
): { amount: number; type: 'fixed' | 'percentage' | null } {
  if (fixed != null && fixed > 0) {
    return { amount: Math.round(fixed * 100) / 100, type: 'fixed' }
  }
  if (rate != null && rate > 0) {
    const val = Math.round(((amount * rate) / 100) * 100) / 100
    return { amount: val > 0 ? val : 0, type: 'percentage' }
  }
  return { amount: 0, type: null }
}
