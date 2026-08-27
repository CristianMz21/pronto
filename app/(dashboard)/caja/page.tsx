import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { getAuthUser } from '@/lib/auth-user'
import { CajaView } from './caja-view'

export default async function CajaPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase.from('businesses').select('id, currency').eq('owner_id', user.id).maybeSingle()
  if (!business) redirect('/onboarding')

  const { data: openRegister } = await supabase
    .from('cash_registers')
    .select('id, opening_cash, opened_at, status')
    .eq('business_id', business.id)
    .eq('status', 'open')
    .maybeSingle()

  let expected = 0
  let txSum = 0, inSum = 0, outSum = 0
  if (openRegister) {
    const { data: txs } = await supabase.from('transactions').select('amount').eq('business_id', business.id).eq('payment_method', 'cash').eq('status', 'completed').gte('created_at', openRegister.opened_at)
    const { data: moves } = await supabase.from('cash_movements').select('type, amount').eq('register_id', openRegister.id)
    txSum = (txs ?? []).reduce((s, r) => s + Number(r.amount), 0)
    inSum = (moves ?? []).filter((m) => m.type === 'in').reduce((s, r) => s + Number(r.amount), 0)
    outSum = (moves ?? []).filter((m) => m.type === 'out').reduce((s, r) => s + Number(r.amount), 0)
    expected = Number(openRegister.opening_cash) + txSum + inSum - outSum
  }

  const { data: history } = await supabase
    .from('cash_registers')
    .select('id, opening_cash, expected_cash, actual_cash, difference, status, opened_at, closed_at, notes')
    .eq('business_id', business.id)
    .order('opened_at', { ascending: false })
    .limit(10)

  const { data: movements } = openRegister
    ? await supabase.from('cash_movements').select('id, type, amount, reason, created_at').eq('register_id', openRegister.id).order('created_at', { ascending: false }).limit(20)
    : { data: [] as any[] }

  return (
    <>
      <Header title="Caja" />
      <CajaView
        businessId={business.id}
        currency={business.currency ?? 'COP'}
        openRegister={openRegister ? { ...openRegister, expected, txSum, inSum, outSum } : null}
        history={history ?? []}
        movements={movements ?? []}
      />
    </>
  )
}
