import { useTranslations } from 'next-intl'

export interface Business {
  id: string
  owner_id?: string | null
  name: string
  slug: string
  type: string | null
  phone: string | null
  email: string | null
  address: string | null
  timezone: string
  currency: string
  plan: string
  plan_expires_at: string | null
  telegram_bot_token: string | null
  viber_bot_token: string | null
  owner_whatsapp: string | null
  email_provider: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_pass: string | null
  smtp_from: string | null
  resend_api_key: string | null
  meta_whatsapp_phone_number_id: string | null
  meta_whatsapp_access_token: string | null
  wa_template_confirmation: string | null
  wa_template_reminder: string | null
  wa_template_thankyou: string | null
  wa_template_reactivation: string | null
  wa_template_birthday: string | null
  wa_template_language: string | null
  brand_color: string | null
  notification_language: string | null
  logo_url: string | null
  enabled_modules: string[] | null
  min_advance_minutes?: number | null
  booking_lead_time_enabled?: boolean | null
  require_cash_register_for_cash?: boolean | null
  allow_guest_bookings?: boolean | null
  telegram_chat_id?: string | null
  viber_chat_id?: string | null
}
export interface Service {
  id: string
  name: string
  description: string | null
  price: number
  duration_min: number
  category: string | null
  is_active: boolean
  capacity: number
  cost?: number | null
}
export interface Employee {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
  is_active: boolean
  color?: string | null
  specialties?: string[]
  commission_rate?: number | null
  commission_fixed?: number | null
  bio?: string | null
  avatar_url?: string | null
}
export interface DayHours {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
  break_start?: string | null
  break_end?: string | null
}

const CURRENCIES: { value: string; label: string }[] = [
  { value: 'USD', label: '🇺🇸 USD — US Dollar' },
  { value: 'EUR', label: '🇪🇺 EUR — Euro' },
  { value: 'GBP', label: '🇬🇧 GBP — British Pound' },
  { value: 'AED', label: '🇦🇪 AED — UAE Dirham' },
  { value: 'SAR', label: '🇸🇦 SAR — Saudi Riyal' },
  { value: 'TRY', label: '🇹🇷 TRY — Turkish Lira' },
  { value: 'UAH', label: '🇺🇦 UAH — Ukrainian Hryvnia' },
  { value: 'RUB', label: '🇷🇺 RUB — Russian Ruble' },
  { value: 'KZT', label: '🇰🇿 KZT — Kazakhstani Tenge' },
  { value: 'GEL', label: '🇬🇪 GEL — Georgian Lari' },
  { value: 'BRL', label: '🇧🇷 BRL — Brazilian Real' },
  { value: 'MXN', label: '🇲🇽 MXN — Mexican Peso' },
  { value: 'INR', label: '🇮🇳 INR — Indian Rupee' },
  { value: 'THB', label: '🇹🇭 THB — Thai Baht' },
  { value: 'JPY', label: '🇯🇵 JPY — Japanese Yen' },
  { value: 'CNY', label: '🇨🇳 CNY — Chinese Yuan' },
  { value: 'PLN', label: '🇵🇱 PLN — Polish Złoty' },
  { value: 'RON', label: '🇷🇴 RON — Romanian Leu' },
  { value: 'ARS', label: '🇦🇷 ARS — Argentine Peso' },
  { value: 'other', label: '✏️ Other (enter manually)' },
]

type Tab =
  | 'general'
  | 'services'
  | 'employees'
  | 'notifications'
  | 'billing'
  | 'account'
  | 'modules'
  | 'advanced'
const VALID_TABS: Tab[] = [
  'general',
  'services',
  'employees',
  'notifications',
  'billing',
  'modules',
  'advanced',
]

export function getInitialTab(raw: string | null): Tab {
  if (!raw) return 'general'
  if ((VALID_TABS as string[]).includes(raw)) return raw as Tab
  return 'general'
}

export function sanitizeSlug(raw: string, fallback: string): string {
  const cleaned =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  return cleaned
}

export function isKnownCurrency(currency: string): boolean {
  return CURRENCIES.some((c) => c.value !== 'other' && c.value === currency)
}

export function getCurrencySelectValue(currency: string | null): string {
  if (!currency) return 'USD'
  if (isKnownCurrency(currency)) return currency
  return 'other'
}

export function findBreakValidationError(
  dayHours: DayHours[],
  t: ReturnType<typeof useTranslations<'settings'>>,
): string | null {
  for (const day of dayHours) {
    if (!day.is_open) continue
    if (!day.break_start || !day.break_end) continue
    const rawNames: unknown = t.raw('workingHours.dayNames')
    const dayNames: string[] = Array.isArray(rawNames) ? (rawNames as string[]) : []
    const dayName: string = dayNames[day.day_of_week] ?? String(day.day_of_week)
    if (day.break_start >= day.break_end) {
      return t('workingHours.breakInvalidRange', { day: dayName })
    }
    if (day.break_start < day.open_time || day.break_end > day.close_time) {
      return t('workingHours.breakOutsideHours', { day: dayName })
    }
  }
  return null
}

export function safeRawHtml(
  t: ReturnType<typeof useTranslations<'settings'>>,
  key: Parameters<typeof t.raw>[0],
): string {
  const val: unknown = t.raw(key)
  return typeof val === 'string' ? val : ''
}

export { CURRENCIES }
