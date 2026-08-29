import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth-user'
import { Header } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CampaignBuilder } from '@/components/crm/campaign-builder'
import { formatInBusinessTimezone } from '@/lib/utils'
import { Megaphone } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function resolveBusiness(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: owned } = await supabase.from('businesses').select('id, name, currency, timezone').eq('owner_id', userId).maybeSingle()
  if (owned) return owned as { id: string; name: string; currency: string; timezone: string }
  const { data: emp } = await supabase.from('employees').select('business_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  if (emp) {
    const { data: biz } = await supabase.from('businesses').select('id, name, currency, timezone').eq('id', (emp as { business_id: string }).business_id).maybeSingle()
    if (biz) return biz as { id: string; name: string; currency: string; timezone: string }
  }
  return null
}

export default async function CrmCampaignsPage(props: { searchParams: Promise<{ location?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return null
  const business = await resolveBusiness(supabase, user.id)
  if (!business) return <div className="p-6 text-sm text-gray-500">Sin business</div>

  const selectedLocation = searchParams.location ?? null
  let q = supabase
    .from('campaigns')
    .select('id, name, segment, channel, status, stats, sent_at, created_at, location_id')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (selectedLocation) q = q.eq('location_id', selectedLocation) as typeof q
  const { data: campaigns } = await q

  const { data: locations } = await supabase.from('locations').select('id, name').eq('business_id', business.id).order('name')

  // Aggregate stats for header
  const totalSent = (campaigns ?? []).reduce((acc, c) => acc + (Number((c.stats as unknown as { sent?: number })?.sent ?? 0)), 0)

  return (
    <>
      <Header
        title="CRM & Campañas"
        actions={
          <Link href="/crm">
            <Button variant="outline" size="sm">Ver clientes</Button>
          </Link>
        }
      />
      <main className="p-6 space-y-6">
        {(locations?.length ?? 0) > 1 && (
          <div className="flex gap-2 text-xs">
            <Link href="/crm-campaigns" className={`px-3 py-1 rounded-full border ${!selectedLocation ? 'bg-gray-900 text-white' : 'bg-white'}`}>Todas</Link>
            {locations!.map((l) => (
              <Link key={l.id} href={`/crm-campaigns?location=${l.id}`} className={`px-3 py-1 rounded-full border ${selectedLocation === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}>{l.name}</Link>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <CampaignBuilder initialLocationId={selectedLocation} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Megaphone className="w-4 h-4" /> {campaigns?.length ?? 0} campañas — {totalSent} envíos acumulados
            </div>

            <div className="bg-white rounded-xl border border-gray-200 divide-y">
              {(campaigns?.length ?? 0) === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">
                  <div className="text-3xl mb-2">📣</div>
                  No hay campañas aún. Creá la primera desde el panel izquierdo.
                </div>
              ) : (
                campaigns!.map((c) => (
                  <div key={c.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{c.name}</div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{c.segment}</Badge>
                        <Badge variant="outline" className="text-xs">{c.channel}</Badge>
                        <Badge className={`text-xs ${c.status === 'sent' ? 'bg-green-100 text-green-700' : c.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'}`}>{c.status}</Badge>
                        {c.location_id && <Badge variant="outline" className="text-xs">{locations?.find((l) => l.id === c.location_id)?.name ?? c.location_id.slice(0, 6)}</Badge>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {formatInBusinessTimezone(c.created_at, business.timezone)} — stats: {JSON.stringify(c.stats)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Link href={`/api/campaigns/${c.id}`} target="_blank" className="text-xs text-blue-600 hover:underline">detalle</Link>
                      <Link href={`/api/campaigns/${c.id}/stats`} target="_blank" className="text-xs text-blue-600 hover:underline">stats</Link>
                      {c.status === 'draft' && (
                        <form
                          action={async () => {
                            'use server'
                            // server action placeholder — actual send via builder button
                          }}
                        >
                          <span className="text-xs text-gray-400">enviar desde builder</span>
                        </form>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border">
              <strong>Tip Carlos 42d:</strong> usá segmento <code className="bg-white px-1 rounded">inactive_42</code> + canal WhatsApp + plantilla &quot;Hola {'{{name}}'} te extrañamos...&quot; — el cron diario 09:00 también dispara <code>inactive_42</code> + <code>birthday_7</code> automático si lo habilitás en Settings.
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
