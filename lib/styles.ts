import { z } from 'zod'

/**
 * Customer 360 — client_styles helpers (+ storage client-styles)
 * Slice: Foundational (T008)
 * Spec: FR-C9 client_styles {photo_url, service_id, barber_id, notes, is_favorite}, storage bucket client-styles private 5MB
 * Depends: storage.buckets client-styles via 090/094, Supabase Storage RLS
 */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number]

export const ClientStyleSchema = z.object({
  client_id: z.string().uuid(),
  business_id: z.string().uuid(),
  service_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  employee_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  photo_url: z.string().url().min(1).max(2048),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  is_favorite: z.boolean().optional().default(false),
})

export type ClientStyleInput = z.infer<typeof ClientStyleSchema>

export interface ClientStyle extends ClientStyleInput {
  id: string
  created_at: string
}

// ── Validation helpers ───────────────────────────────────────────────────────

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
}

export function validatePhotoFile(file: {
  size: number
  type: string
  name: string
}): { ok: true } | { ok: false; reason: string } {
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, reason: 'file_too_large' }
  if (!isAllowedMime(file.type)) return { ok: false, reason: 'invalid_mime' }
  const ext = file.name.split('.').pop()?.toLowerCase()
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'avif']
  if (!ext || !allowedExts.includes(ext)) return { ok: false, reason: 'invalid_extension' }
  return { ok: true }
}

export function photoPathForUpload(params: {
  businessId: string
  clientId: string
  filename: string
}): string {
  const { businessId, clientId, filename } = params
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ts = Date.now()
  // storage path: client-styles/{businessId}/{clientId}/{ts}_{safe}
  return `${businessId}/${clientId}/${ts}_${safe}`
}

// ── Storage helpers (Supabase JS) ───────────────────────────────────────────

type SupabaseStorageLike = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: unknown,
        opts?: unknown,
      ) => Promise<{ data: unknown; error: unknown }>
      getPublicUrl: (path: string) => { data: { publicUrl: string } }
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>
      remove: (paths: string[]) => Promise<{ error: unknown }>
    }
  }
  from: (table: string) => unknown
}

/**
 * Upload client style photo to bucket client-styles (private, signed URL 1h).
 * Returns photo_url (signed URL or publicUrl fallback for tests).
 */
export async function uploadClientStylePhoto(
  supabase: SupabaseStorageLike,
  params: {
    businessId: string
    clientId: string
    file:
      | File
      | { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }
    serviceId?: string | null
    employeeId?: string | null
    notes?: string | null
  },
): Promise<ClientStyle> {
  const { businessId, clientId, file, serviceId, employeeId, notes } = params

  const validation = validatePhotoFile({ size: file.size, type: file.type, name: file.name })
  if (!validation.ok) throw Object.assign(new Error(validation.reason), { code: validation.reason })

  const businessIdParsed = z.string().uuid().safeParse(businessId)
  if (!businessIdParsed.success) throw new Error('invalid_business_id')
  const clientIdParsed = z.string().uuid().safeParse(clientId)
  if (!clientIdParsed.success) throw new Error('invalid_client_id')

  const path = photoPathForUpload({ businessId, clientId, filename: file.name })
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage.from('client-styles').upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw uploadError

  // Private bucket: create signed URL 1h (fallback to publicUrl for tests without storage)
  let photoUrl: string
  try {
    const { data, error } = await supabase.storage.from('client-styles').createSignedUrl(path, 3600)
    if (!error && data?.signedUrl) photoUrl = data.signedUrl
    else photoUrl = supabase.storage.from('client-styles').getPublicUrl(path).data.publicUrl
  } catch {
    photoUrl = supabase.storage.from('client-styles').getPublicUrl(path).data.publicUrl
  }

  // Insert row
  const payload = {
    client_id: clientId,
    business_id: businessId,
    service_id: serviceId || null,
    employee_id: employeeId || null,
    photo_url: photoUrl,
    notes: notes || null,
    is_favorite: false,
  }
  const parsed = ClientStyleSchema.safeParse(payload)
  if (!parsed.success) throw parsed.error

  const { data, error } = await (
    supabase.from('client_styles') as unknown as {
      insert: (d: unknown) => {
        select: (c: string) => {
          single: () => Promise<{ data: ClientStyle | null; error: unknown }>
        }
      }
    }
  )
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return data as ClientStyle
}

export async function listClientStyles(
  supabase: { from: (t: string) => unknown },
  clientId: string,
): Promise<ClientStyle[]> {
  const parsed = z.string().uuid().safeParse(clientId)
  if (!parsed.success) throw new Error('invalid_client_id')
  const { data, error } = await (
    supabase.from('client_styles') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          order: (
            col: string,
            opts: unknown,
          ) => Promise<{ data: ClientStyle[] | null; error: unknown }>
        }
      }
    }
  )
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as ClientStyle[] | null) ?? []
}

export async function toggleStyleFavorite(
  supabase: { from: (t: string) => unknown },
  styleId: string,
  isFavorite: boolean,
): Promise<ClientStyle> {
  const parsed = z.string().uuid().safeParse(styleId)
  if (!parsed.success) throw new Error('invalid_style_id')
  const { data, error } = await (
    supabase.from('client_styles') as unknown as {
      update: (d: unknown) => {
        eq: (
          c: string,
          v: unknown,
        ) => {
          select: (c: string) => {
            single: () => Promise<{ data: ClientStyle | null; error: unknown }>
          }
        }
      }
    }
  )
    .update({ is_favorite: isFavorite } as unknown as never)
    .eq('id', styleId)
    .select('*')
    .single()
  if (error) throw error
  if (!data) throw new Error('not_found')
  return data as ClientStyle
}

/** Remove style + storage object (requires storage path extraction from photo_url) */
export async function deleteClientStyle(
  supabase: SupabaseStorageLike,
  styleId: string,
): Promise<void> {
  const parsed = z.string().uuid().safeParse(styleId)
  if (!parsed.success) throw new Error('invalid_style_id')

  // Fetch photo_url to delete storage object
  const { data: existing } = await (
    supabase.from('client_styles') as unknown as {
      select: (c: string) => {
        eq: (
          col: string,
          v: unknown,
        ) => { maybeSingle: () => Promise<{ data: ClientStyle | null; error: unknown }> }
      }
    }
  )
    .select('photo_url')
    .eq('id', styleId)
    .maybeSingle()

  const { error } = await (
    supabase.from('client_styles') as unknown as {
      delete: () => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> }
    }
  )
    .delete()
    .eq('id', styleId)

  if (error) throw error

  if (existing) {
    // Try to extract storage path from URL; best-effort, ignore failures
    try {
      const url = (existing as ClientStyle).photo_url
      // storage path is after /object/public/client-styles/ or /object/sign/client-styles/
      const match = url.match(/client-styles\/(.+?)(?:\?|$)/)
      if (match?.[1]) {
        await supabase.storage.from('client-styles').remove([decodeURIComponent(match[1])])
      }
    } catch {}
  }
}
