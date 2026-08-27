import { clsx, type ClassValue } from 'clsx'
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

/**
 * Locale-aware currency formatting.
 * - COP/es-CO → "$30.000" (Intl es-CO uses "$ 30.000,00" with NBSP, normalized)
 * - USD/en-US → "$30,000"
 * Backward compatible: single-arg still defaults to USD/en-US.
 */
export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale?: string
): string {
  const resolvedLocale = locale ?? CURRENCY_LOCALE[currency] ?? 'en-US'
  const raw = new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
  // es-CO produces "$ 30.000" (NBSP). Normalize NBSP to plain space for snapshot stability
  // and trim for cleaner display when needed. Keep Intl semantics otherwise.
  return raw.replace(/\u00A0/g, ' ')
}

export function formatDate(date: string | Date, locale = 'es-CO'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function uses12HourClock(locale: string): boolean {
  const sample = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(new Date(2000, 0, 1, 13))
  return /am|pm/i.test(sample)
}

export function formatTime(date: string | Date, locale = 'es-CO'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: uses12HourClock(locale),
  }).format(new Date(date))
}

export function formatInBusinessTimezone(
  date: string | Date,
  timezone: string,
  part: 'date' | 'time' = 'date',
  locale = 'es-CO'
): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone: timezone }
  if (part === 'date') {
    opts.year = 'numeric'; opts.month = 'short'; opts.day = 'numeric'
  } else {
    opts.hour = '2-digit'; opts.minute = '2-digit'; opts.hour12 = uses12HourClock(locale)
  }
  return new Intl.DateTimeFormat(locale, opts).format(new Date(date))
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
  // salon-maya.trypronto.app → salon-maya
  // localhost:3000 → null (dev mode)
  const parts = hostname.split('.')
  if (parts.length >= 3 && parts[1] === 'trypronto') {
    return parts[0]
  }
  return null
}
