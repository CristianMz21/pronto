import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  COP: 'es-CO',
  EUR: 'es-ES',
  BRL: 'pt-BR',
  MXN: 'es-MX',
  ARS: 'es-AR',
  CLP: 'es-CL',
  PEN: 'es-PE',
}

export function formatCurrency(amount: number, currency = 'USD', locale?: string): string {
  const resolvedLocale = locale ?? CURRENCY_LOCALE[currency] ?? 'en-US'
  const raw = new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
  return raw.replace(/\u00A0/g, ' ')
}

export function formatDate(date: string | Date, locale = 'es-CO'): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'Invalid Date'
  try {
    // Hydration-safe: explicit timeZone prevents server (UTC) vs client (America/Bogota) mismatch
    const timeZone = locale === 'es-CO' ? 'America/Bogota' : 'UTC'
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone,
    }).format(d)
  } catch {
    return 'Invalid Date'
  }
}

export function uses12HourClock(locale: string): boolean {
  try {
    const sample = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(
      new Date(2000, 0, 1, 13),
    )
    return /am|pm/i.test(sample)
  } catch {
    return false
  }
}

export function formatTime(date: string | Date, locale = 'es-CO'): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'Invalid Date'
  try {
    const timeZone = locale === 'es-CO' ? 'America/Bogota' : 'UTC'
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: uses12HourClock(locale),
      timeZone,
    }).format(d)
  } catch {
    return 'Invalid Date'
  }
}

export function formatInBusinessTimezone(
  date: string | Date,
  timezone: string,
  part: 'date' | 'time' | 'datetime' = 'date',
  locale = 'es-CO',
): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'Invalid Date'
  const opts: Intl.DateTimeFormatOptions = { timeZone: timezone }
  if (part === 'date') {
    opts.year = 'numeric'
    opts.month = 'short'
    opts.day = 'numeric'
  } else if (part === 'time') {
    opts.hour = '2-digit'
    opts.minute = '2-digit'
    opts.hour12 = uses12HourClock(locale)
  } else {
    opts.year = 'numeric'
    opts.month = 'short'
    opts.day = 'numeric'
    opts.hour = '2-digit'
    opts.minute = '2-digit'
    opts.hour12 = uses12HourClock(locale)
  }
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d)
  } catch {
    return 'Invalid Date'
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getTenantSlug(hostname: string): string | null {
  const parts = hostname.split('.')
  if (parts.length >= 3 && parts[1] === 'trypronto') {
    // @ts-expect-error - tsc strict fix
    return parts[0]
  }
  return null
}
