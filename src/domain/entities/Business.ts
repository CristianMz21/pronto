export type BusinessId = string
export type BusinessSlug = string

export interface Business {
  id: BusinessId
  ownerId: string
  name: string
  slug: BusinessSlug
  type: string | null
  phone: string | null
  email: string | null
  address: string | null
  timezone: string
  currency: string
  logoUrl: string | null
  plan: 'free' | 'starter' | 'pro' | 'agency'
  brandColor: string | null
  notificationLanguage: string | null
  enabledModules: string[]
  createdAt: Date
  updatedAt: Date
}

export interface BusinessSettings {
  businessId: BusinessId
  timezone: string
  currency: string
  brandColor: string | null
  notificationLanguage: string
  enabledModules: string[]
  paymentMethods: string[]
  taxRate: number
  cancelLeadTime: number
  minAdvanceMinutes: number
  bookingLeadTimeEnabled: boolean
  requireCashRegisterForCash: boolean
  allowGuestBookings: boolean
}
