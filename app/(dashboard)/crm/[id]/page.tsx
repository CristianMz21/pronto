import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { getTranslations } from 'next-intl/server'
import { ClientDetailView } from './client-detail-view'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getTelegramBotInfo } from '@/lib/telegram'
import { getAuthUser } from '@/lib/auth-user'

export default async function ClientDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const t = await getTranslations('clientDetail')
  const user = await getAuthUser()

  const { data: business } = await supabase
    .from('businesses').select('id, currency, timezone, telegram_bot_token').eq('owner_id', user!.id).maybeSingle()
  if (!business) return null

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone, email, birthday, notes, tags, total_visits, total_spent, last_visit_at, created_at, telegram_id, viber_user_id, whatsapp_number, preferences, preferred_barber_id, location_id')
    .eq('id', params.id)
    .eq('business_id', business.id)
    .maybeSingle()

  if (!client) notFound()

  const [{ data: preferredBarber }, { data: location }] = await Promise.all([
    (client as unknown as { preferred_barber_id?: string | null }).preferred_barber_id ? supabase.from('employees').select('id, name').eq('id', (client as unknown as { preferred_barber_id: string }).preferred_barber_id).maybeSingle() : Promise.resolve({ data: null } as { data: unknown }),
    (client as unknown as { location_id?: string | null }).location_id ? supabase.from('locations').select('id, name').eq('id', (client as unknown as { location_id: string }).location_id).maybeSingle() : Promise.resolve({ data: null } as { data: unknown }),
  ])

  const telegramInfo = business.telegram_bot_token
    ? await getTelegramBotInfo(business.telegram_bot_token)
    : { ok: false as const }
  const telegramBotUsername = telegramInfo.ok
    ? (telegramInfo as { ok: true; result?: { username: string } }).result?.username ?? null
    : null

  const [{ data: appointments }, { data: loyalty }, { data: memberships }] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, starts_at, ends_at, status, price, services(name), employees(name)')
      .eq('client_id', client.id)
      .eq('business_id', business.id)
      .order('starts_at', { ascending: false })
      .limit(20),
    supabase.from('loyalty_accounts').select('points').eq('client_id', client.id).maybeSingle(),
    supabase.from('client_memberships').select('id, remaining, expires_at, status, memberships(name)').eq('client_id', client.id).eq('business_id', business.id).order('expires_at', { ascending: true }).limit(10),
  ])

  return (
    <>
      <Header
        title={client.name}
        actions={
          <Link href="/crm" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft className="w-4 h-4" />{t('backToClients')}
          </Link>
        }
      />
      <ClientDetailView
        client={client as unknown as { id: string; name: string; phone: string | null; email: string | null; birthday: string | null; notes: string | null; tags: string[]; total_visits: number; total_spent: number; last_visit_at: string | null; created_at: string; telegram_id: string | null; viber_user_id: string | null; whatsapp_number: string | null; preferences?: unknown; preferred_barber_id?: string | null; location_id?: string | null }}
        appointments={appointments ?? []}
        currency={business.currency}
        timezone={business.timezone}
        businessId={business.id}
        telegramBotUsername={telegramBotUsername}
        preferredBarber={preferredBarber as unknown as { id: string; name: string } | null}
        location={location as unknown as { id: string; name: string } | null}
        loyaltyPoints={(loyalty as { points: number } | null)?.points ?? 0}
        memberships={(memberships as unknown as { id: string; remaining: number; expires_at: string; status: string; memberships: { name: string } | null }[] | null) ?? []}
      />
    </>
  )
}
