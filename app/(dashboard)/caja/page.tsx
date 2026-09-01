import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Header } from '@/components/layout/header'
import { getAuthUser } from '@/lib/auth-user'
import { createClient } from '@/lib/supabase/server'

import { CajaView } from './caja-view'

export default async function CajaPage(props: { searchParams: Promise<{ location?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user)
    redirect(
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
        ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/login`
        : '/login',
    )

  let business: { id: string; currency: string } | null = null
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) business = owned as { id: string; currency: string }
  else {
    const { data: empBiz } = await supabase
      .from('employees')
      .select('business_id, businesses!inner(id, currency)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (empBiz) {
      const b = (empBiz as unknown as { businesses: { id: string; currency: string } }).businesses
      business = b
    }
  }
  if (!business)
    redirect(
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
        ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/onboarding`
        : '/onboarding',
    )

  let openQuery = supabase
    .from('cash_registers')
    .select('id, opening_cash, opened_at, status, location_id')
    .eq('business_id', business.id)
    .eq('status', 'open')
  if (searchParams.location)
    openQuery = openQuery.eq('location_id', searchParams.location) as typeof openQuery
  const { data: openRegister } = await openQuery.maybeSingle()

  let expected = 0
  let txSum = 0,
    inSum = 0,
    outSum = 0
  if (openRegister) {
    let txQuery = supabase
      .from('transactions')
      .select('amount, location_id')
      .eq('business_id', business.id)
      .eq('payment_method', 'cash')
      .eq('status', 'completed')
      .gte('created_at', openRegister.opened_at)
    if (searchParams.location)
      txQuery = (txQuery as unknown as { eq: (c: string, v: string) => typeof txQuery }).eq(
        'location_id',
        searchParams.location,
      ) as typeof txQuery
    const { data: txs } = await txQuery
    const { data: moves } = await supabase
      .from('cash_movements')
      .select('type, amount')
      .eq('register_id', openRegister.id)
    txSum = (txs ?? []).reduce((s, r) => s + Number(r.amount), 0)
    inSum = (moves ?? []).filter((m) => m.type === 'in').reduce((s, r) => s + Number(r.amount), 0)
    outSum = (moves ?? []).filter((m) => m.type === 'out').reduce((s, r) => s + Number(r.amount), 0)
    expected = Math.round((Number(openRegister.opening_cash) + txSum + inSum - outSum) * 100) / 100
  }

  let historyQuery = supabase
    .from('cash_registers')
    .select(
      'id, opening_cash, expected_cash, actual_cash, difference, status, opened_at, closed_at, notes, location_id',
    )
    .eq('business_id', business.id)
    .order('opened_at', { ascending: false })
    .limit(10)
  if (searchParams.location)
    historyQuery = historyQuery.eq('location_id', searchParams.location) as typeof historyQuery
  const [{ data: history }, { data: locations }] = await Promise.all([
    historyQuery,
    supabase.from('locations').select('id, name').eq('business_id', business.id).order('name'),
  ])

  const { data: movements } = openRegister
    ? await supabase
        .from('cash_movements')
        .select('id, type, amount, reason, created_at')
        .eq('register_id', openRegister.id)
        .order('created_at', { ascending: false })
        .limit(20)
    : {
        data: [] as unknown as {
          id: string
          type: string
          amount: number
          reason: string | null
          created_at: string
        }[],
      }

  return (
    <>
      <Header title="Caja" />
      {(locations?.length ?? 0) > 1 && (
        <div className="px-6 pt-4 flex gap-2 text-xs">
          <Link
            href="/caja"
            className={`px-3 py-1 rounded-full border ${!searchParams.location ? 'bg-gray-900 text-white' : 'bg-white'}`}
          >
            Todas
          </Link>
          {locations?.map((l) => (
            <Link
              key={l.id}
              href={`/caja?location=${l.id}`}
              className={`px-3 py-1 rounded-full border ${searchParams.location === l.id ? 'bg-gray-900 text-white' : 'bg-white'}`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}
      <CajaView
        businessId={business.id}
        currency={business.currency ?? 'COP'}
        openRegister={openRegister ? { ...openRegister, expected, txSum, inSum, outSum } : null}
        history={
          (history as unknown as {
            id: string
            opening_cash: number
            expected_cash: number | null
            actual_cash: number | null
            difference: number | null
            status: string
            opened_at: string
            closed_at: string | null
          }[]) ?? []
        }
        movements={
          (movements as unknown as {
            id: string
            type: string
            amount: number
            reason: string | null
            created_at: string
          }[]) ?? []
        }
      />
    </>
  )
}
