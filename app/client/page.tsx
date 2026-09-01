import { redirect } from 'next/navigation'

/**
 * Deprecated alias — T020
 * /client → /client/me (301)
 * Keeps query compat ?phone= & ?client_id= and forwards to unified Customer 360.
 * Legacy UI preserved via redirect, not deletion, to avoid breaking bookmarks.
 */
export default async function ClientAliasPage(props: {
  searchParams: Promise<{ phone?: string; client_id?: string }>
}) {
  const sp = await props.searchParams
  const params = new URLSearchParams()
  if (sp.phone) params.set('phone', sp.phone)
  if (sp.client_id) params.set('client_id', sp.client_id)
  // 301 semantics via redirect (Next handles as 307 by default but still permanent intent)
  // For true 301, proxy handles, but app route does 307 which browsers follow.
  redirect(`/client/me${params.toString() ? `?${params.toString()}` : ''}`)
}
