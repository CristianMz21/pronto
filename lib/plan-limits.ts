// Self-hosted version — all limits are unlimited

export type PlanCheck = {
  allowed: boolean
  limit: number
  current: number
  plan: string
}

export async function checkClientLimit(_supabase: unknown, _businessId: string, _plan: string): Promise<PlanCheck> {
  return { allowed: true, limit: Infinity, current: 0, plan: 'self-hosted' }
}

export async function checkEmployeeLimit(_supabase: unknown, _businessId: string, _plan: string): Promise<PlanCheck> {
  return { allowed: true, limit: Infinity, current: 0, plan: 'self-hosted' }
}

export async function checkBookingLimit(_supabase: unknown, _businessId: string, _plan: string): Promise<PlanCheck> {
  return { allowed: true, limit: Infinity, current: 0, plan: 'self-hosted' }
}

export async function checkProductLimit(_supabase: unknown, _businessId: string, _plan: string): Promise<PlanCheck> {
  return { allowed: true, limit: Infinity, current: 0, plan: 'self-hosted' }
}

export function checkNotificationChannel(_plan: string, _channel: string): boolean {
  return true
}
