import { z } from 'zod'

/**
 * Customer 360 — preferences & notification_prefs
 * Slice: Foundational (T007)
 * Spec: FR-C8, FR-C9, spec.md P2 Mi estilo
 * Data: clients.preferences jsonb {cut,length,clipper,beard,barber_id,notes}
 *       clients.notification_prefs jsonb {whatsapp,email,push}
 *       clients.status enum, clients.preferred_barber_id FK
 * Locale: es-CO neutral, COP handling via formatCurrency elsewhere
 */

// ── Preferences JSONB ─────────────────────────────────────────────────────────

export const CutOptions = [
  'Low Fade',
  'Mid Fade',
  'High Fade',
  'Taper',
  'Buzz',
  'Mullet',
  'Pompadour',
  'French Crop',
] as const

export const LengthOptions = ['muy corto', 'corto', 'medio', 'largo', 'muy largo'] as const

// Clipper guards #0 .. #8 (Colombia barbería common)
export const ClipperOptions = ['#0', '#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'] as const

export const BeardOptions = ['sin barba', '3mm', '5mm', '7mm', '10mm', 'barba completa'] as const

export const PreferencesSchema = z.object({
  cut: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  length: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  // clipper: e.g. "#1→#2"
  clipper: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  beard: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  barber_id: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
})

export type Preferences = z.infer<typeof PreferencesSchema>

export const PreferencesDefaults: Preferences = {}

// ── Notification prefs ───────────────────────────────────────────────────────

export const NotificationPrefsSchema = z.object({
  whatsapp: z.boolean().default(true),
  email: z.boolean().default(true),
  push: z.boolean().default(true),
})

export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>

export const NotificationPrefsDefaults: NotificationPrefs = {
  whatsapp: true,
  email: true,
  push: true,
}

// ── Status ───────────────────────────────────────────────────────────────────

export const ClientStatusSchema = z.enum(['active', 'inactive', 'VIP'])
export type ClientStatus = z.infer<typeof ClientStatusSchema>

// ── Full client 360 preferences row ─────────────────────────────────────────

export const ClientPreferencesRowSchema = z.object({
  preferences: PreferencesSchema.optional().default({}),
  status: ClientStatusSchema.optional().default('active'),
  preferred_barber_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  notification_prefs: NotificationPrefsSchema.optional().default(NotificationPrefsDefaults),
})

export type ClientPreferencesRow = z.infer<typeof ClientPreferencesRowSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse raw jsonb from DB safely, returns defaults on invalid */
export function parsePreferences(raw: unknown): Preferences {
  const parsed = PreferencesSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : {}
}

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const parsed = NotificationPrefsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : { ...NotificationPrefsDefaults }
}

export function parseClientStatus(raw: unknown): ClientStatus {
  const parsed = ClientStatusSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'active'
}

/** Validate before DB write (throws ZodError if invalid) */
export function validatePreferences(input: unknown): Preferences {
  return PreferencesSchema.parse(input ?? {})
}

export function validateNotificationPrefs(input: unknown): NotificationPrefs {
  return NotificationPrefsSchema.parse(input ?? {})
}

/** Merge patch into existing preferences (shallow, undefined deletes key) */
export function mergePreferences(current: Preferences, patch: Partial<Preferences>): Preferences {
  const next: Record<string, unknown> = { ...current }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete next[k]
    } else {
      next[k] = v
    }
  }
  const parsed = PreferencesSchema.safeParse(next)
  if (!parsed.success) throw parsed.error
  return parsed.data
}

/** Serialize for DB jsonb column (ensure no undefined) */
export function serializePreferences(prefs: Preferences): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(prefs)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v
  }
  return clean
}

export function serializeNotificationPrefs(prefs: NotificationPrefs): Record<string, boolean> {
  return {
    whatsapp: !!prefs.whatsapp,
    email: !!prefs.email,
    push: !!prefs.push,
  }
}

/** Human summary for UI: "Low Fade longitud media Máquina #1→#2 Barba 3mm" (es-CO) */
export function preferencesToSummary(prefs: Preferences): string {
  const parts: string[] = []
  if (prefs.cut) parts.push(prefs.cut)
  if (prefs.length) parts.push(`longitud ${prefs.length}`)
  if (prefs.clipper) parts.push(`Máquina ${prefs.clipper}`)
  if (prefs.beard) parts.push(`Barba ${prefs.beard}`)
  if (prefs.notes) parts.push(`— ${prefs.notes}`)
  return parts.join(' · ') || 'Sin preferencias guardadas'
}

/** COP-aware helper: not monetary, but keeps locale contract — delegates to lib/utils formatCurrency */
export function isValidClientStatus(v: unknown): v is ClientStatus {
  return ClientStatusSchema.safeParse(v).success
}
