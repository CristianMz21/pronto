import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { Header } from '@/components/layout/header'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'
import { getTelegramBotInfo } from '@/lib/telegram'

import { ClientDetailView } from './client-detail-view'

export default async function ClientDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const t = await getTranslations('clientDetail')
  const user = await getAuthUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency, timezone, telegram_bot_token')
    .eq('owner_id', user?.id ?? '')
    .maybeSingle()
  if (!business) return null

  const { data: client } = await (
    supabase.from('clients') as unknown as {
      select: (s: string) => {
        eq: (
          a: string,
          b: string,
        ) => {
          eq: (
            c: string,
            d: string,
          ) => {
            maybeSingle: () => Promise<{
              data: {
                id: string
                name: string
                phone: string | null
                email: string | null
                birthday: string | null
                notes: string | null
                tags: string[]
                total_visits: number
                total_spent: number
                last_visit_at: string | null
                created_at: string
                telegram_id: string | null
                viber_user_id: string | null
                whatsapp_number: string | null
                location_id: string | null
                preferences?: unknown
                preferred_barber_id?: string | null
              } | null
            }>
          }
        }
      }
    }
  )
    .select(
      'id, name, phone, email, birthday, notes, tags, total_visits, total_spent, last_visit_at, created_at, telegram_id, viber_user_id, whatsapp_number, location_id, preferences, preferred_barber_id, notification_prefs, status',
    )
    .eq('id', params.id)
    .eq('business_id', (business as { id: string }).id)
    .maybeSingle()

  if (!client) notFound()

  const clientTyped = client as unknown as {
    id: string
    name: string
    location_id?: string | null
    preferred_barber_id?: string | null
  }
  const [{ data: preferredBarber }, { data: location }] = await Promise.all([
    (clientTyped as { preferred_barber_id?: string | null }).preferred_barber_id
      ? supabase
          .from('employees')
          .select('id, name')
          .eq('id', clientTyped.preferred_barber_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null } as { data: unknown }),
    clientTyped.location_id
      ? supabase
          .from('locations')
          .select('id, name')
          .eq('id', clientTyped.location_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as { data: unknown }),
  ])

  const telegramInfo = business.telegram_bot_token
    ? await getTelegramBotInfo(business.telegram_bot_token)
    : { ok: false as const }
  const telegramBotUsername = telegramInfo.ok
    ? ((telegramInfo as { ok: true; result?: { username: string } }).result?.username ?? null)
    : null

  const [
    { data: appointments },
    { data: loyalty },
    { data: memberships },
    { data: favorites },
    { data: styles },
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, starts_at, ends_at, status, price, services(name), employees(name)')
      .eq('client_id', client.id)
      .eq('business_id', business.id)
      .order('starts_at', { ascending: false })
      .limit(20),
    supabase.from('loyalty_accounts').select('points').eq('client_id', client.id).maybeSingle(),
    supabase
      .from('client_memberships')
      .select('id, remaining, expires_at, status, memberships(name)')
      .eq('client_id', client.id)
      .eq('business_id', business.id)
      .order('expires_at', { ascending: true })
      .limit(10),
    supabase
      .from('favorites')
      .select('client_id, employee_id, created_at, employees(id, name)')
      .eq('client_id', client.id),
    supabase
      .from('client_styles')
      .select('id, photo_url, service_id, employee_id, notes, is_favorite, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  return (
    <>
      <Header
        title={client.name}
        actions={
          <Link
            href="/crm"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('backToClients')}
          </Link>
        }
      />
      <ClientDetailView
        client={
          client as unknown as {
            id: string
            name: string
            phone: string | null
            email: string | null
            birthday: string | null
            notes: string | null
            tags: string[]
            total_visits: number
            total_spent: number
            last_visit_at: string | null
            created_at: string
            telegram_id: string | null
            viber_user_id: string | null
            whatsapp_number: string | null
            preferences?: unknown
            preferred_barber_id?: string | null
            location_id?: string | null
            status?: string
            notification_prefs?: unknown
          }
        }
        appointments={appointments ?? []}
        currency={business.currency}
        timezone={business.timezone}
        businessId={business.id}
        telegramBotUsername={telegramBotUsername}
        preferredBarber={preferredBarber as unknown as { id: string; name: string } | null}
        location={location as unknown as { id: string; name: string } | null}
        loyaltyPoints={(loyalty as { points: number } | null)?.points ?? 0}
        memberships={
          (memberships as unknown as
            | {
                id: string
                remaining: number
                expires_at: string
                status: string
                memberships: { name: string } | null
              }[]
            | null) ?? []
        }
        favorites={
          (favorites as unknown as
            | {
                client_id: string
                employee_id: string
                created_at: string
                employees: { id: string; name: string } | null
              }[]
            | null) ?? []
        }
        styles={
          (styles as unknown as
            | {
                id: string
                photo_url: string
                service_id: string | null
                employee_id: string | null
                notes: string | null
                is_favorite: boolean
                created_at: string
              }[]
            | null) ?? []
        }
      />
    </>
  )
}
