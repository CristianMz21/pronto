'use client'

import {
  CalendarDays,
  CheckCircle2,
  CloudOff,
  Minus,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  WifiOff,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  type CachedClient,
  type CachedEmployee,
  type CachedService,
  cacheData,
  getCachedData,
  getPendingCount,
  getPendingTransactions,
  markTransactionSynced,
  queueTransaction,
} from '@/lib/offline-db'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { isRecord } from '@/lib/validation/guard'

interface Service {
  id: string
  name: string
  price: number
  duration_min: number
  category: string | null
}
interface Employee {
  id: string
  name: string
}
interface Client {
  id: string
  name: string
  phone: string | null
}
interface CartItem {
  service: Service
  qty: number
}
type PaymentMethod = 'cash' | 'card' | 'transfer'

interface BookingContext {
  bookingId: string
  clientId: string
  serviceId: string
  staffId: string
  label: string
}

interface POSTerminalProps {
  businessId: string
  currency: string
  services: Service[]
  employees: Employee[]
  clients: Client[]
  bookingContext?: BookingContext
  initialHasOpenRegister?: boolean
  requireCashRegister?: boolean
  isBarbero?: boolean
  currentEmployeeId?: string | null
  locationId?: string | null
}

// ─── Strict JSON helpers ────────────────────────────────────────────────────

function getStringField(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'string' ? v : undefined
}
function getNumberField(obj: unknown, key: string): number | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function getBooleanField(obj: unknown, key: string): boolean | undefined {
  if (!isRecord(obj)) return undefined
  const v = obj[key]
  return typeof v === 'boolean' ? v : undefined
}

function getPromoDerivedDiscount(
  subtotal: number,
  selectedMembership: string,
  promoDiscount: number,
  loyaltyRedeem: number,
): number {
  if (selectedMembership) return subtotal
  if (promoDiscount > 0) return promoDiscount
  if (loyaltyRedeem > 0) return Math.min(subtotal, Math.round(loyaltyRedeem * 100))
  return 0
}

function getCartSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + i.service.price * i.qty, 0)
}

function getCategories(activeServices: Service[]): string[] {
  return Array.from(new Set(activeServices.map((s) => s.category ?? 'Other')))
}

// ─── Validation / checkout helpers ──────────────────────────────────────────

function validateCashRegister(
  paymentMethod: PaymentMethod,
  requireCashRegister: boolean,
  hasOpenRegister: boolean,
): string | null {
  if (paymentMethod === 'cash' && requireCashRegister && !hasOpenRegister)
    return 'Debes abrir caja antes de cobrar en efectivo. Ve a Caja → Abrir caja.'
  return null
}

function validateBenefitStack(
  selectedMembership: string,
  promoCode: string,
  loyaltyRedeem: number,
): string | null {
  const count = [selectedMembership, promoCode.trim(), loyaltyRedeem > 0 ? 'loyalty' : null].filter(
    Boolean,
  ).length
  if (count > 1) return 'Solo un beneficio por venta (membresía, promo o puntos)'
  return null
}

function getEffectiveEmployeeId(
  isBarbero: boolean,
  currentEmployeeId: string | null,
  selectedEmployee: string,
): string | null {
  if (isBarbero && currentEmployeeId) return currentEmployeeId
  return selectedEmployee || null
}

function validateBarberoServices(
  isBarbero: boolean,
  currentEmployeeId: string | null,
  initialServices: Service[],
  items: { service_id: string }[],
): string | null {
  if (!isBarbero || !currentEmployeeId) return null
  const allowed = new Set(initialServices.map((s) => s.id))
  const hasDisallowed = items.some((it) => !allowed.has(it.service_id))
  if (hasDisallowed)
    return 'No puedes vender un servicio no asignado a tu perfil. Contacta al administrador.'
  return null
}

async function handleOfflineCheckout(
  businessId: string,
  clientId: string | null,
  employeeId: string | null,
  subtotal: number,
  paymentMethod: PaymentMethod,
  items: { service_id: string; name: string; price: number; qty: number }[],
): Promise<{ receipt: string }> {
  const queued = await queueTransaction({
    business_id: businessId,
    client_id: clientId,
    employee_id: employeeId,
    amount: subtotal,
    payment_method: paymentMethod,
    items,
  })
  return { receipt: queued.local_receipt }
}

function getCheckoutValidationError(
  cart: CartItem[],
  paymentMethod: PaymentMethod,
  requireCashRegister: boolean,
  hasOpenRegister: boolean,
  selectedMembership: string,
  promoCode: string,
  loyaltyRedeem: number,
  isBarbero: boolean,
  currentEmployeeId: string | null,
  initialServices: Service[],
  items: { service_id: string }[],
): string | null {
  if (cart.length === 0) return '__empty__'
  const cashErr = validateCashRegister(paymentMethod, requireCashRegister, hasOpenRegister)
  if (cashErr) return cashErr
  const benefitErr = validateBenefitStack(selectedMembership, promoCode, loyaltyRedeem)
  if (benefitErr) return benefitErr
  const barberoErr = validateBarberoServices(isBarbero, currentEmployeeId, initialServices, items)
  if (barberoErr) return barberoErr
  return null
}

async function handleTransactionSuccess(
  isOffline: boolean | undefined,
  receipt: string | undefined,
  txId: string | undefined,
  selectedClient: string,
  _businessId: string,
  supabase: ReturnType<typeof createClient>,
  activeBookingId: string,
  setters: {
    setReceiptNumber: (s: string) => void
    setPendingCount: (f: (n: number) => number) => void
    setWalkinTxId: (s: string) => void
    setSaveForm: (f: { name: string; phone: string; email: string; notes: string }) => void
    setShowSaveModal: (b: boolean) => void
    router: { refresh: () => void }
  },
): Promise<void> {
  if (isOffline) {
    setters.setReceiptNumber(receipt ?? '')
    setters.setPendingCount((n) => n + 1)
    return
  }
  setters.setReceiptNumber(receipt ?? '')
  setters.router.refresh()
  if (!selectedClient && txId) {
    setters.setWalkinTxId(txId)
    setters.setSaveForm({ name: '', phone: '', email: '', notes: '' })
    setters.setShowSaveModal(true)
  }
  if (activeBookingId)
    void supabase
      .from('appointments')
      .update({ status: 'paid' })
      .eq('id', activeBookingId)
      .then(({ error: apptErr }: { error: { message: string } | null }) => {
        void apptErr
      })
}

function resetAfterSuccess(
  setters: {
    setSuccessAmount: (n: number) => void
    setSuccess: (b: boolean) => void
    setCart: (c: CartItem[]) => void
    setDiscount: (n: number) => void
    setPromoDiscount: (n: number) => void
    setPromoCode: (s: string) => void
    setLoyaltyRedeem: (n: number) => void
    setSelectedMembership: (s: string) => void
    setTipAmount: (n: number) => void
    setSelectedClient: (s: string) => void
    setShowBookingBanner: (b: boolean) => void
  },
  total: number,
): void {
  setters.setSuccessAmount(total)
  setters.setSuccess(true)
  setters.setCart([])
  setters.setDiscount(0)
  setters.setPromoDiscount(0)
  setters.setPromoCode('')
  setters.setLoyaltyRedeem(0)
  setters.setSelectedMembership('')
  setters.setTipAmount(0)
  setters.setSelectedClient('')
  setters.setShowBookingBanner(false)
}

async function executeTransactionFlow(
  isOnline: boolean,
  businessId: string,
  locationId: string | null,
  clientId: string | null,
  employeeId: string | null,
  subtotal: number,
  paymentMethod: PaymentMethod,
  items: { service_id: string; name: string; price: number; qty: number }[],
  tipAmount: number,
  promoCode: string,
  loyaltyRedeem: number,
  selectedMembership: string,
  activeBookingId: string,
): Promise<{
  receipt?: string | undefined
  id?: string | undefined
  error?: string
  isOffline?: boolean
}> {
  if (!isOnline) {
    const { receipt } = await handleOfflineCheckout(
      businessId,
      clientId,
      employeeId,
      subtotal,
      paymentMethod,
      items,
    )
    return { receipt, isOffline: true }
  }
  const result = await handleOnlineCheckout(
    businessId,
    locationId,
    clientId,
    employeeId,
    subtotal,
    paymentMethod,
    items,
    tipAmount,
    promoCode,
    loyaltyRedeem,
    selectedMembership,
    activeBookingId,
  )
  if (result.error) return { error: result.error }
  return { receipt: result.receipt_number, id: result.id }
}

async function handleOnlineCheckout(
  businessId: string,
  locationId: string | null,
  clientId: string | null,
  employeeId: string | null,
  subtotal: number,
  paymentMethod: PaymentMethod,
  items: { service_id: string; name: string; price: number; qty: number }[],
  tipAmount: number,
  promoCode: string,
  loyaltyRedeem: number,
  selectedMembership: string,
  activeBookingId: string,
): Promise<{ receipt_number?: string; id?: string; error?: string }> {
  const res = await fetch('/api/pos/transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      location_id: locationId ?? null,
      client_id: clientId,
      employee_id: employeeId,
      amount: subtotal,
      payment_method: paymentMethod,
      items,
      tip_amount: tipAmount,
      promo_code: promoCode.trim() || null,
      loyalty_points_redeem: loyaltyRedeem > 0 ? loyaltyRedeem : 0,
      membership_id: selectedMembership || null,
      appointment_id: activeBookingId || null,
    }),
  })
  const json: unknown = await res.json().catch(() => ({}) as unknown)
  if (!res.ok) {
    const errCode = getStringField(json, 'error')
    const msg = getStringField(json, 'message')
    if (errCode === 'cash_register_closed')
      return { error: msg ?? 'Debes abrir caja antes de cobrar en efectivo' }
    return { error: errCode ?? msg ?? 'transaction failed' }
  }
  return {
    receipt_number: getStringField(json, 'receipt_number') ?? '',
    id: getStringField(json, 'id') ?? '',
  }
}

async function handleEvaluatePromo(args: {
  promoCode: string
  subtotal: number
  cart: CartItem[]
  selectedClient: string
  setPromoDiscount: (n: number) => void
  setPromoError: (s: string) => void
  setSelectedMembership: (s: string) => void
  setLoyaltyRedeem: (n: number) => void
}): Promise<void> {
  if (!args.promoCode.trim()) {
    args.setPromoError('Ingresa código')
    return
  }
  args.setPromoError('')
  try {
    const res = await fetch('/api/promotions/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promo_code: args.promoCode.trim(),
        amount: args.subtotal,
        service_ids: args.cart.map((i) => i.service.id),
        client_id: args.selectedClient || null,
        date: new Date().toISOString().slice(0, 10),
      }),
    })
    const j: unknown = await res.json()
    const eligible = getBooleanField(j, 'eligible') ?? false
    if (res.ok && eligible) {
      const discountVal = getNumberField(j, 'discount') ?? 0
      args.setPromoDiscount(discountVal)
      args.setPromoError('')
      args.setSelectedMembership('')
      args.setLoyaltyRedeem(0)
    } else {
      args.setPromoDiscount(0)
      const reason = getStringField(j, 'reason')
      const err = getStringField(j, 'error')
      args.setPromoError(reason ?? err ?? 'No elegible')
    }
  } catch {
    args.setPromoError('Error evaluando promo')
  }
}

async function handleFetchRegisterStatus(setHasOpenRegister: (b: boolean) => void): Promise<void> {
  if (!navigator.onLine) return
  try {
    const res = await fetch('/api/cash/current')
    if (res.ok) {
      const json: unknown = await res.json()
      const hasRegister = isRecord(json) ? Boolean(json['register']) : false
      setHasOpenRegister(hasRegister)
    }
  } catch {}
}

async function handleSyncQueue(args: {
  setSyncing: (b: boolean) => void
  setSyncError: (s: string) => void
  setPendingCount: (n: number) => void
  setHasOpenRegister: (b: boolean) => void
}): Promise<void> {
  args.setSyncing(true)
  args.setSyncError('')
  try {
    const pending = await getPendingTransactions()
    for (const tx of pending) {
      const res = await fetch('/api/pos/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: tx.business_id,
          client_id: tx.client_id,
          employee_id: tx.employee_id,
          amount: tx.amount,
          payment_method: tx.payment_method,
          items: tx.items,
        }),
      })
      if (res.ok) {
        await markTransactionSynced(tx.id)
      } else if (res.status === 409) {
        const j: unknown = await res.json().catch(() => ({}) as unknown)
        const msg = getStringField(j, 'message')
        args.setSyncError(
          msg ?? 'Caja cerrada: abre caja para sincronizar ventas en efectivo pendientes.',
        )
        break
      }
    }
    const remaining = await getPendingCount()
    args.setPendingCount(remaining)
    void handleFetchRegisterStatus(args.setHasOpenRegister)
  } catch {
    args.setSyncError('Sync failed. Will retry automatically.')
  } finally {
    args.setSyncing(false)
  }
}

async function handleCheckout(args: {
  cart: CartItem[]
  paymentMethod: PaymentMethod
  cashRegisterRequired: boolean
  hasOpenRegister: boolean
  selectedMembership: string
  promoCode: string
  loyaltyRedeem: number
  isBarbero: boolean
  currentEmployeeId: string | null
  initialServices: Service[]
  isOnline: boolean
  businessId: string
  locationId: string | null
  selectedClient: string
  selectedEmployee: string
  subtotal: number
  tipAmount: number
  activeBookingId: string
  total: number
  checkoutError: string
  setCheckoutError: (s: string) => void
  setLoading: (b: boolean) => void
  setHasOpenRegister: (b: boolean) => void
  setReceiptNumber: (s: string) => void
  setPendingCount: (f: (n: number) => number) => void
  setWalkinTxId: (s: string) => void
  setSaveForm: (f: { name: string; phone: string; email: string; notes: string }) => void
  setShowSaveModal: (b: boolean) => void
  supabase: ReturnType<typeof createClient>
  router: ReturnType<typeof useRouter>
  setSuccessAmount: (n: number) => void
  setSuccess: (b: boolean) => void
  setCart: (c: CartItem[]) => void
  setDiscount: (n: number) => void
  setPromoDiscount: (n: number) => void
  setPromoCode: (s: string) => void
  setLoyaltyRedeem: (n: number) => void
  setSelectedMembership: (s: string) => void
  setTipAmount: (n: number) => void
  setSelectedClient: (s: string) => void
  setShowBookingBanner: (b: boolean) => void
}): Promise<void> {
  const items = args.cart.map((i) => ({
    service_id: i.service.id,
    name: i.service.name,
    price: i.service.price,
    qty: i.qty,
  }))
  const validationError = getCheckoutValidationError(
    args.cart,
    args.paymentMethod,
    args.cashRegisterRequired,
    args.hasOpenRegister,
    args.selectedMembership,
    args.promoCode,
    args.loyaltyRedeem,
    args.isBarbero,
    args.currentEmployeeId,
    args.initialServices,
    items,
  )
  if (validationError === '__empty__') return
  if (validationError) {
    args.setCheckoutError(validationError)
    return
  }
  args.setCheckoutError('')
  args.setLoading(true)
  const effectiveEmployeeId = getEffectiveEmployeeId(
    args.isBarbero,
    args.currentEmployeeId,
    args.selectedEmployee,
  )
  try {
    const res = await executeTransactionFlow(
      args.isOnline,
      args.businessId,
      args.locationId,
      args.selectedClient || null,
      effectiveEmployeeId,
      args.subtotal,
      args.paymentMethod,
      items,
      args.tipAmount,
      args.promoCode,
      args.loyaltyRedeem,
      args.selectedMembership,
      args.activeBookingId,
    )
    if (res.error) {
      if (res.error.includes('caja')) args.setHasOpenRegister(false)
      throw new Error(res.error)
    }
    await handleTransactionSuccess(
      res.isOffline,
      res.receipt,
      res.id,
      args.selectedClient,
      args.businessId,
      args.supabase,
      args.activeBookingId,
      {
        setReceiptNumber: args.setReceiptNumber,
        setPendingCount: args.setPendingCount,
        setWalkinTxId: args.setWalkinTxId,
        setSaveForm: args.setSaveForm,
        setShowSaveModal: args.setShowSaveModal,
        router: args.router,
      },
    )
    resetAfterSuccess(
      {
        setSuccessAmount: args.setSuccessAmount,
        setSuccess: args.setSuccess,
        setCart: args.setCart,
        setDiscount: args.setDiscount,
        setPromoDiscount: args.setPromoDiscount,
        setPromoCode: args.setPromoCode,
        setLoyaltyRedeem: args.setLoyaltyRedeem,
        setSelectedMembership: args.setSelectedMembership,
        setTipAmount: args.setTipAmount,
        setSelectedClient: args.setSelectedClient,
        setShowBookingBanner: args.setShowBookingBanner,
      },
      args.total,
    )
  } catch (err) {
    if (!args.checkoutError) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el pago'
      if (!msg.includes('cash_register_closed')) args.setCheckoutError(msg)
    }
  } finally {
    args.setLoading(false)
  }
}

async function handleSaveWalkin(args: {
  supabase: ReturnType<typeof createClient>
  businessId: string
  saveForm: { name: string; phone: string; email: string; notes: string }
  walkinTxId: string
  setActiveClients: React.Dispatch<React.SetStateAction<Client[]>>
  setSavingClient: (b: boolean) => void
  setShowSaveModal: (b: boolean) => void
  setWalkinTxId: (s: string) => void
}): Promise<void> {
  if (!args.saveForm.name.trim()) return
  args.setSavingClient(true)
  const { data: client } = await args.supabase
    .from('clients')
    .insert({
      business_id: args.businessId,
      name: args.saveForm.name.trim(),
      phone: args.saveForm.phone || null,
      email: args.saveForm.email || null,
      notes: args.saveForm.notes || null,
    })
    .select('id')
    .single()

  if (client) {
    if (args.walkinTxId) {
      await args.supabase
        .from('transactions')
        .update({ client_id: client.id })
        .eq('id', args.walkinTxId)
    }
    args.setActiveClients((prev) => [
      ...prev,
      { id: client.id, name: args.saveForm.name.trim(), phone: args.saveForm.phone || null },
    ])
  }
  args.setSavingClient(false)
  args.setShowSaveModal(false)
  args.setWalkinTxId('')
}

// ─── Presentational helpers (each <20) ──────────────────────────────────────

function OfflineBanner({ pendingCount }: { pendingCount: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-200 text-orange-800 text-sm">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span className="font-medium">Offline mode</span>
      <span className="text-orange-600">— Sales will sync automatically when you reconnect.</span>
      {pendingCount > 0 ? (
        <span className="ml-auto font-semibold">{pendingCount} pending</span>
      ) : null}
    </div>
  )
}

function SyncBanner({
  pendingCount,
  syncing,
  syncError,
  onSync,
}: {
  pendingCount: number
  syncing: boolean
  syncError: string
  onSync: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm">
      {syncing ? (
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
      ) : (
        <CloudOff className="w-4 h-4 shrink-0" />
      )}
      <span>
        {syncing
          ? `Syncing ${pendingCount} offline sale${pendingCount > 1 ? 's' : ''}…`
          : `${pendingCount} offline sale${pendingCount > 1 ? 's' : ''} pending sync`}
      </span>
      {!syncing ? (
        <button
          type="button"
          onClick={onSync}
          className="ml-auto text-blue-600 hover:text-blue-800 font-medium underline"
        >
          Sync now
        </button>
      ) : null}
      {syncError ? <span className="text-red-600 text-xs ml-2">{syncError}</span> : null}
    </div>
  )
}

function BookingBanner({
  label,
  t,
}: {
  label: string
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border-b border-indigo-200 text-indigo-900 text-sm">
      <CalendarDays className="w-4 h-4 shrink-0 text-indigo-500" />
      <span>
        {t('bookingBanner')} <strong>{label}</strong>
      </span>
    </div>
  )
}

function MobileTabBar({
  activeTab,
  setActiveTab,
  cartCount,
  t,
}: {
  activeTab: 'services' | 'cart'
  setActiveTab: (v: 'services' | 'cart') => void
  cartCount: number
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  return (
    <div className="md:hidden flex border-b border-gray-200 bg-white sticky top-0 z-10 shrink-0">
      <button
        type="button"
        onClick={() => setActiveTab('services')}
        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'services' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
      >
        {t('servicesTab')}
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('cart')}
        className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'cart' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
      >
        {t('cart')}
        {cartCount > 0 ? (
          <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center leading-none">
            {cartCount}
          </span>
        ) : null}
      </button>
    </div>
  )
}

function ServiceGrid({
  categories,
  activeServices,
  currency,
  activeTab,
  onAddToCart,
  t,
}: {
  categories: string[]
  activeServices: Service[]
  currency: string
  activeTab: 'services' | 'cart'
  onAddToCart: (s: Service) => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  return (
    <div
      className={`flex-1 p-6 overflow-y-auto ${activeTab !== 'services' ? 'hidden md:block' : ''}`}
    >
      <div className="space-y-6">
        {categories.map((cat) => (
          <div key={cat}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {cat}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {activeServices
                .filter((s) => (s.category ?? 'Other') === cat)
                .map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => onAddToCart(s)}
                    className="text-left p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-sm transition-all"
                  >
                    <div className="font-medium text-gray-900 text-sm mb-1">{s.name}</div>
                    <div className="text-blue-600 font-semibold">
                      {formatCurrency(s.price, currency)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.duration_min} min</div>
                  </button>
                ))}
            </div>
          </div>
        ))}
        {activeServices.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {t('noServices')}{' '}
            <a href="/settings?tab=services" className="text-blue-600 hover:underline">
              {t('addServices')}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ClientSelector({
  activeClients,
  selectedClient,
  setSelectedClient,
  t,
}: {
  activeClients: Client[]
  selectedClient: string
  setSelectedClient: (v: string) => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase">{t('clientLabel')}</label>
      <select
        value={selectedClient}
        onChange={(e) => setSelectedClient(e.target.value)}
        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{t('walkIn')}</option>
        {activeClients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.phone ? ` · ${c.phone}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function EmployeeSelector({
  isBarbero,
  currentEmployeeId,
  activeEmployees,
  selectedEmployee,
  setSelectedEmployee,
  t,
}: {
  isBarbero: boolean
  currentEmployeeId: string | null
  activeEmployees: Employee[]
  selectedEmployee: string
  setSelectedEmployee: (v: string) => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  if (isBarbero && currentEmployeeId && activeEmployees.length > 0) {
    return (
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase">{t('employeeLabel')}</label>
        <div className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
          {activeEmployees[0]?.name ?? 'Mi perfil'}
        </div>
      </div>
    )
  }
  if (!isBarbero && activeEmployees.length > 0) {
    return (
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase">{t('employeeLabel')}</label>
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{t('anyEmployee')}</option>
          {activeEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
    )
  }
  return null
}

function CartItems({
  cart,
  currency,
  onUpdateQty,
  onRemove,
  t,
}: {
  cart: CartItem[]
  currency: string
  onUpdateQty: (id: string, delta: number) => void
  onRemove: (id: string) => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  if (cart.length === 0)
    return <div className="text-center text-sm text-gray-400 py-6">{t('emptyCart')}</div>
  return (
    <>
      {cart.map((item) => (
        <div key={item.service.id} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{item.service.name}</div>
            <div className="text-xs text-gray-500">
              {formatCurrency(item.service.price, currency)}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdateQty(item.service.id, -1)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
            <button
              type="button"
              onClick={() => onUpdateQty(item.service.id, 1)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.service.id)}
              className="p-1 rounded hover:bg-red-50 text-red-400"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

function DiscountInput({
  discount,
  subtotal,
  setDiscount,
  setPromoDiscount,
  setPromoCode,
  setSelectedMembership,
  setLoyaltyRedeem,
  t,
}: {
  discount: number
  subtotal: number
  setDiscount: (n: number) => void
  setPromoDiscount: (n: number) => void
  setPromoCode: (s: string) => void
  setSelectedMembership: (s: string) => void
  setLoyaltyRedeem: (n: number) => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase">{t('discountLabel')}</label>
      <input
        type="number"
        min={0}
        max={subtotal}
        value={discount || ''}
        onChange={(e) => {
          setDiscount(Number(e.target.value))
          if (Number(e.target.value) > 0) {
            setPromoDiscount(0)
            setPromoCode('')
            setSelectedMembership('')
            setLoyaltyRedeem(0)
          }
        }}
        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="0"
      />
    </div>
  )
}

function MembershipSelector({
  selectedClient,
  membershipOptions,
  selectedMembership,
  setSelectedMembership,
  subtotal,
  currency,
  mounted,
  setPromoDiscount,
  setPromoCode,
  setLoyaltyRedeem,
  setDiscount,
}: {
  selectedClient: string
  membershipOptions: {
    id: string
    remaining: number
    expires_at: string
    membership_id: string
    name?: string
  }[]
  selectedMembership: string
  setSelectedMembership: (s: string) => void
  subtotal: number
  currency: string
  mounted: boolean
  setPromoDiscount: (n: number) => void
  setPromoCode: (s: string) => void
  setLoyaltyRedeem: (n: number) => void
  setDiscount: (n: number) => void
}) {
  if (!selectedClient || membershipOptions.length === 0) return null
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase">
        Membresía (consume 1 uso)
      </label>
      <select
        value={selectedMembership}
        onChange={(e) => {
          setSelectedMembership(e.target.value)
          if (e.target.value) {
            setPromoDiscount(0)
            setPromoCode('')
            setLoyaltyRedeem(0)
            setDiscount(0)
          }
        }}
        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="">— Sin membresía —</option>
        {membershipOptions.map((m) => (
          <option key={m.id} value={m.id} suppressHydrationWarning>
            {m.name} · {m.remaining} usos · vence{' '}
            {mounted
              ? new Date(m.expires_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
              : new Date(m.expires_at).toISOString().slice(0, 10)}
          </option>
        ))}
      </select>
      {selectedMembership ? (
        <p className="text-xs text-green-600 mt-1">
          Se consumirá 1 uso. Descuento {formatCurrency(subtotal, currency)}
        </p>
      ) : null}
    </div>
  )
}

function PromoSection({
  promoCode,
  setPromoCode,
  promoError,
  promoDiscount,
  currency,
  onEvaluate,
}: {
  promoCode: string
  setPromoCode: (s: string) => void
  promoError: string
  promoDiscount: number
  currency: string
  onEvaluate: () => void
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase">Cupón promo</label>
      <div className="flex gap-2 mt-1">
        <input
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          placeholder="CUMPLE20"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={onEvaluate}
          type="button"
          className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs"
        >
          Validar
        </button>
      </div>
      {promoError ? <p className="text-xs text-red-600 mt-1">{promoError}</p> : null}
      {promoDiscount > 0 ? (
        <p className="text-xs text-green-600 mt-1">
          Descuento {formatCurrency(promoDiscount, currency)}
        </p>
      ) : null}
    </div>
  )
}

function LoyaltySection({
  selectedClient,
  loyaltyBalance,
  loyaltyRedeem,
  setLoyaltyRedeem,
  currency,
  setSelectedMembership,
  setPromoDiscount,
  setPromoCode,
  setDiscount,
}: {
  selectedClient: string
  loyaltyBalance: number | null
  loyaltyRedeem: number
  setLoyaltyRedeem: (n: number) => void
  currency: string
  setSelectedMembership: (s: string) => void
  setPromoDiscount: (n: number) => void
  setPromoCode: (s: string) => void
  setDiscount: (n: number) => void
}) {
  if (!selectedClient || loyaltyBalance === null) return null
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase">
        Puntos fidelización ({loyaltyBalance} pts · {formatCurrency(loyaltyBalance * 100, currency)}{' '}
        valor)
      </label>
      <div className="flex gap-2 mt-1">
        <input
          type="number"
          min={0}
          max={loyaltyBalance}
          value={loyaltyRedeem || ''}
          onChange={(e) => {
            const v = Number(e.target.value)
            setLoyaltyRedeem(v)
            if (v > 0) {
              setSelectedMembership('')
              setPromoDiscount(0)
              setPromoCode('')
              setDiscount(0)
            }
          }}
          placeholder="0"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-500 self-center">100 pts = $10.000</span>
      </div>
      {loyaltyRedeem > 0 && loyaltyBalance !== null && loyaltyRedeem > loyaltyBalance ? (
        <p className="text-xs text-red-600">Puntos insuficientes</p>
      ) : null}
    </div>
  )
}

function TipInput({
  tipAmount,
  setTipAmount,
  subtotal,
}: {
  tipAmount: number
  setTipAmount: (n: number) => void
  subtotal: number
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase">Propina</label>
      <input
        type="number"
        min={0}
        max={subtotal * 0.5}
        value={tipAmount || ''}
        onChange={(e) => setTipAmount(Number(e.target.value))}
        placeholder="0"
        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  )
}

function DiscountBreakdown({
  effectiveDiscount,
  subtotal,
  currency,
}: {
  effectiveDiscount: number
  subtotal: number
  currency: string
}) {
  if (effectiveDiscount <= 0) return null
  return (
    <div className="text-xs bg-green-50 border border-green-200 rounded-lg p-2">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal, currency)}</span>
      </div>
      <div className="flex justify-between text-green-700">
        <span>Descuento</span>
        <span>-{formatCurrency(effectiveDiscount, currency)}</span>
      </div>
    </div>
  )
}

function PaymentMethods({
  paymentMethod,
  setPaymentMethod,
  setCheckoutError,
  t,
}: {
  paymentMethod: PaymentMethod
  setPaymentMethod: (m: PaymentMethod) => void
  setCheckoutError: (s: string) => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => (
        <button
          type="button"
          key={m}
          onClick={() => {
            setPaymentMethod(m)
            setCheckoutError('')
          }}
          className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${paymentMethod === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {t(`paymentMethods.${m}`)}
        </button>
      ))}
    </div>
  )
}

function POSSuccessScreen({
  receiptNumber,
  successAmount,
  currency,
  showSaveModal,
  saveForm,
  setSaveForm,
  savingClient,
  onSaveWalkin,
  onNewSale,
  setShowSaveModal,
  t,
}: {
  receiptNumber: string
  successAmount: number
  currency: string
  showSaveModal: boolean
  saveForm: { name: string; phone: string; email: string; notes: string }
  setSaveForm: React.Dispatch<
    React.SetStateAction<{ name: string; phone: string; email: string; notes: string }>
  >
  savingClient: boolean
  onSaveWalkin: () => void
  onNewSale: () => void
  setShowSaveModal: (b: boolean) => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  const isOfflineReceipt = receiptNumber.startsWith('OFFLINE-')
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-3">
        <Card className="text-center">
          <CardContent className="pt-8 pb-8">
            <CheckCircle2
              className={`w-12 h-12 mx-auto mb-4 ${isOfflineReceipt ? 'text-orange-500' : 'text-green-500'}`}
            />
            <h2 className="text-xl font-semibold text-gray-900 mb-1">{t('success.heading')}</h2>
            <p className="text-sm text-gray-500 mb-1">
              {t('success.receipt')} {receiptNumber}
            </p>
            {isOfflineReceipt ? (
              <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-3">
                Saved offline. Will sync when internet is restored.
              </p>
            ) : null}
            <p className="text-2xl font-bold text-gray-900 mb-6">
              {formatCurrency(successAmount, currency)}
            </p>
            <Button onClick={onNewSale} className="w-full">
              {t('success.newSale')}
            </Button>
          </CardContent>
        </Card>
        {showSaveModal ? (
          <Card>
            <CardContent className="pt-5 pb-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Save this customer to your client base?
              </p>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Name *"
                  value={saveForm.name}
                  onChange={(e) => setSaveForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={saveForm.phone}
                  onChange={(e) => setSaveForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={saveForm.email}
                  onChange={(e) => setSaveForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <textarea
                  placeholder="Notes"
                  value={saveForm.notes}
                  onChange={(e) => setSaveForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={onSaveWalkin}
                  disabled={!saveForm.name.trim() || savingClient}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {savingClient ? '…' : 'Save client'}
                </button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function CartPanel({
  activeTab,
  cart,
  currency,
  t,
  activeClients,
  selectedClient,
  setSelectedClient,
  isBarbero,
  currentEmployeeId,
  activeEmployees,
  selectedEmployee,
  setSelectedEmployee,
  onUpdateQty,
  onRemove,
  discount,
  subtotal,
  setDiscount,
  setPromoDiscount,
  setPromoCode,
  setSelectedMembership,
  setLoyaltyRedeem,
  membershipOptions,
  selectedMembership,
  mounted,
  promoCode,
  promoError,
  promoDiscount,
  onEvaluatePromo,
  loyaltyBalance,
  loyaltyRedeem,
  tipAmount,
  setTipAmount,
  effectiveDiscount,
}: {
  activeTab: 'services' | 'cart'
  cart: CartItem[]
  currency: string
  t: ReturnType<typeof useTranslations<'pos'>>
  activeClients: Client[]
  selectedClient: string
  setSelectedClient: (v: string) => void
  isBarbero: boolean
  currentEmployeeId: string | null
  activeEmployees: Employee[]
  selectedEmployee: string
  setSelectedEmployee: (v: string) => void
  onUpdateQty: (id: string, delta: number) => void
  onRemove: (id: string) => void
  discount: number
  subtotal: number
  setDiscount: (n: number) => void
  setPromoDiscount: (n: number) => void
  setPromoCode: (s: string) => void
  setSelectedMembership: (s: string) => void
  setLoyaltyRedeem: (n: number) => void
  membershipOptions: {
    id: string
    remaining: number
    expires_at: string
    membership_id: string
    name?: string
  }[]
  selectedMembership: string
  mounted: boolean
  promoCode: string
  promoError: string
  promoDiscount: number
  onEvaluatePromo: () => void
  loyaltyBalance: number | null
  loyaltyRedeem: number
  tipAmount: number
  setTipAmount: (n: number) => void
  effectiveDiscount: number
}) {
  return (
    <div
      className={`bg-white border-l border-gray-200 flex-col md:w-80 md:shrink-0 ${activeTab !== 'cart' ? 'hidden md:flex' : 'flex w-full'}`}
    >
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ShoppingCart className="w-4 h-4" />
          {t('cart')} ({cart.reduce((s, i) => s + i.qty, 0)})
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <ClientSelector
          activeClients={activeClients}
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          t={t}
        />
        <EmployeeSelector
          isBarbero={isBarbero}
          currentEmployeeId={currentEmployeeId}
          activeEmployees={activeEmployees}
          selectedEmployee={selectedEmployee}
          setSelectedEmployee={setSelectedEmployee}
          t={t}
        />
        <CartItems
          cart={cart}
          currency={currency}
          onUpdateQty={onUpdateQty}
          onRemove={onRemove}
          t={t}
        />
        {cart.length > 0 ? (
          <div className="space-y-3">
            <DiscountInput
              discount={discount}
              subtotal={subtotal}
              setDiscount={setDiscount}
              setPromoDiscount={setPromoDiscount}
              setPromoCode={setPromoCode}
              setSelectedMembership={setSelectedMembership}
              setLoyaltyRedeem={setLoyaltyRedeem}
              t={t}
            />
            <MembershipSelector
              selectedClient={selectedClient}
              membershipOptions={membershipOptions}
              selectedMembership={selectedMembership}
              setSelectedMembership={setSelectedMembership}
              subtotal={subtotal}
              currency={currency}
              mounted={mounted}
              setPromoDiscount={setPromoDiscount}
              setPromoCode={setPromoCode}
              setLoyaltyRedeem={setLoyaltyRedeem}
              setDiscount={setDiscount}
            />
            <PromoSection
              promoCode={promoCode}
              setPromoCode={setPromoCode}
              promoError={promoError}
              promoDiscount={promoDiscount}
              currency={currency}
              onEvaluate={onEvaluatePromo}
            />
            <LoyaltySection
              selectedClient={selectedClient}
              loyaltyBalance={loyaltyBalance}
              loyaltyRedeem={loyaltyRedeem}
              setLoyaltyRedeem={setLoyaltyRedeem}
              currency={currency}
              setSelectedMembership={setSelectedMembership}
              setPromoDiscount={setPromoDiscount}
              setPromoCode={setPromoCode}
              setDiscount={setDiscount}
            />
            <TipInput tipAmount={tipAmount} setTipAmount={setTipAmount} subtotal={subtotal} />
            <DiscountBreakdown
              effectiveDiscount={effectiveDiscount}
              subtotal={subtotal}
              currency={currency}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CheckoutFooter({
  paymentMethod,
  setPaymentMethod,
  setCheckoutError,
  total,
  currency,
  tipAmount,
  cashRegisterRequired,
  hasOpenRegister,
  checkoutError,
  cartLength,
  loading,
  isOnline,
  onCheckout,
  t,
}: {
  paymentMethod: PaymentMethod
  setPaymentMethod: (m: PaymentMethod) => void
  setCheckoutError: (s: string) => void
  total: number
  currency: string
  tipAmount: number
  cashRegisterRequired: boolean
  hasOpenRegister: boolean
  checkoutError: string
  cartLength: number
  loading: boolean
  isOnline: boolean
  onCheckout: () => void
  t: ReturnType<typeof useTranslations<'pos'>>
}) {
  return (
    <div className="p-4 border-t border-gray-100 space-y-3">
      <PaymentMethods
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        setCheckoutError={setCheckoutError}
        t={t}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{t('totalLabel')}</span>
        <span className="text-xl font-bold text-gray-900">{formatCurrency(total, currency)}</span>
      </div>
      {tipAmount > 0 ? (
        <div className="flex justify-between text-xs text-gray-500">
          <span>Propina</span>
          <span>{formatCurrency(tipAmount, currency)}</span>
        </div>
      ) : null}
      {paymentMethod === 'cash' && cashRegisterRequired && !hasOpenRegister ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Debes abrir caja antes de cobrar en efectivo.{' '}
          <a href="/caja" className="font-semibold underline hover:text-amber-900">
            Ir a Caja
          </a>
        </div>
      ) : null}
      {checkoutError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {checkoutError}
        </div>
      ) : null}
      <Button
        onClick={onCheckout}
        disabled={
          cartLength === 0 ||
          loading ||
          (paymentMethod === 'cash' && cashRegisterRequired && !hasOpenRegister)
        }
        className={`w-full h-12 text-base ${!isOnline ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
      >
        {loading
          ? t('processing')
          : isOnline
            ? t('chargeButton')
            : `Save offline · ${formatCurrency(total, currency)}`}
      </Button>
    </div>
  )
}

export function POSTerminal({
  businessId,
  currency,
  services: initialServices,
  employees: initialEmployees,
  clients: initialClients,
  bookingContext,
  initialHasOpenRegister = false,
  requireCashRegister = true,
  isBarbero = false,
  currentEmployeeId = null,
  locationId = null,
}: POSTerminalProps) {
  const supabase = createClient()
  const router = useRouter()
  const t = useTranslations('pos')

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState(
    isBarbero && currentEmployeeId ? currentEmployeeId : '',
  )
  const [selectedClient, setSelectedClient] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [discount, setDiscount] = useState(0)
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null)
  const [membershipOptions, setMembershipOptions] = useState<
    { id: string; remaining: number; expires_at: string; membership_id: string; name?: string }[]
  >([])
  const [selectedMembership, setSelectedMembership] = useState<string>('')
  const [promoCode, setPromoCode] = useState('')
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [promoError, setPromoError] = useState('')
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(0)
  const [tipAmount, setTipAmount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'services' | 'cart'>('services')
  const [receiptNumber, setReceiptNumber] = useState('')
  const [successAmount, setSuccessAmount] = useState(0)
  const [activeBookingId] = useState(bookingContext?.bookingId ?? '')
  const [showBookingBanner, setShowBookingBanner] = useState(!!bookingContext)

  const [showSaveModal, setShowSaveModal] = useState(false)
  const [walkinTxId, setWalkinTxId] = useState('')
  const [saveForm, setSaveForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [savingClient, setSavingClient] = useState(false)

  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const [hasOpenRegister, setHasOpenRegister] = useState(initialHasOpenRegister)
  const [checkoutError, setCheckoutError] = useState('')

  const [activeServices, setActiveServices] = useState<Service[]>(initialServices)
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>(initialEmployees)
  const [activeClients, setActiveClients] = useState<Client[]>(initialClients)

  useEffect(() => {
    if (!navigator.onLine) return
    ;(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone')
        .eq('business_id', businessId)
        .order('name')
        .limit(200)
      if (data?.length) setActiveClients(data as Client[])
    })().catch(() => {})
  }, [businessId, supabase])

  const fetchRegisterStatus = useCallback(async (): Promise<void> => {
    await handleFetchRegisterStatus(setHasOpenRegister)
  }, [])

  useEffect(() => {
    void fetchRegisterStatus()
  }, [fetchRegisterStatus])

  useEffect(() => {
    if (isOnline) void fetchRegisterStatus()
  }, [isOnline, fetchRegisterStatus])

  useEffect(() => {
    if (initialServices.length) {
      cacheData<CachedService>('services_cache', initialServices).catch(() => {})
    }
    if (initialEmployees.length) {
      cacheData<CachedEmployee>('employees_cache', initialEmployees).catch(() => {})
    }
    if (initialClients.length) {
      cacheData<CachedClient>('clients_cache', initialClients).catch(() => {})
    }
  }, [initialServices, initialEmployees, initialClients])

  useEffect(() => {
    if (!bookingContext) return
    const svc = initialServices.find((s) => s.id === bookingContext.serviceId)
    if (svc) setCart([{ service: svc, qty: 1 }])
    if (bookingContext.clientId) setSelectedClient(bookingContext.clientId)
    if (isBarbero && currentEmployeeId) {
      setSelectedEmployee(currentEmployeeId)
    } else if (bookingContext.staffId) {
      setSelectedEmployee(bookingContext.staffId)
    }
  }, [bookingContext, currentEmployeeId, initialServices, isBarbero])

  useEffect(() => {
    if (!selectedClient) {
      setLoyaltyBalance(null)
      setMembershipOptions([])
      setSelectedMembership('')
      setLoyaltyRedeem(0)
      return
    }
    fetch(`/api/loyalty?client_id=${selectedClient}`)
      .then(async (r): Promise<void> => {
        if (r.ok) {
          const j: unknown = await r.json()
          const pts = getNumberField(j, 'points') ?? 0
          setLoyaltyBalance(pts)
        } else setLoyaltyBalance(0)
      })
      .catch(() => setLoyaltyBalance(0))
    supabase
      .from('client_memberships')
      .select('id, remaining, expires_at, membership_id, memberships(name)')
      .eq('client_id', selectedClient)
      .eq('status', 'active')
      .then(({ data }) => {
        const now = Date.now()
        const opts =
          (
            data as
              | {
                  id: string
                  remaining: number
                  expires_at: string
                  membership_id: string
                  memberships: { name: string } | null
                }[]
              | null
          )
            ?.filter((cm) => cm.remaining > 0 && new Date(cm.expires_at).getTime() > now)
            .map((cm) => ({
              id: cm.id,
              remaining: cm.remaining,
              expires_at: cm.expires_at,
              membership_id: cm.membership_id,
              name: cm.memberships?.name ?? cm.membership_id.slice(0, 8),
            })) ?? []
        setMembershipOptions(opts)
        // @ts-expect-error - tsc strict fix
        if (opts.length === 1) setSelectedMembership(opts[0].id)
      })
  }, [selectedClient, supabase])

  useEffect(() => {
    getPendingCount()
      .then(setPendingCount)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const setOnline = () => setIsOnline(true)
    const setOffline = () => setIsOnline(false)
    setIsOnline(navigator.onLine)
    window.addEventListener('online', setOnline)
    window.addEventListener('offline', setOffline)
    return () => {
      window.removeEventListener('online', setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  useEffect(() => {
    if (!isOnline && activeServices.length === 0) {
      getCachedData<Service>('services_cache')
        .then((s) => {
          if (s.length) setActiveServices(s)
        })
        .catch(() => {})
      getCachedData<Employee>('employees_cache')
        .then((e) => {
          if (e.length) setActiveEmployees(e)
        })
        .catch(() => {})
      getCachedData<Client>('clients_cache')
        .then((c) => {
          if (c.length) setActiveClients(c)
        })
        .catch(() => {})
    }
  }, [isOnline, activeServices.length])

  const syncQueue = useCallback(async (): Promise<void> => {
    await handleSyncQueue({ setSyncing, setSyncError, setPendingCount, setHasOpenRegister })
  }, [])

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      void syncQueue()
    }
  }, [isOnline, pendingCount, syncQueue])

  const addToCart = (service: Service) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.service.id === service.id)
      if (existing)
        return prev.map((i) => (i.service.id === service.id ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { service, qty: 1 }]
    })
  }

  const updateQty = (serviceId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.service.id === serviceId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    )
  }

  const subtotal = getCartSubtotal(cart)
  const promoDerivedDiscount = getPromoDerivedDiscount(
    subtotal,
    selectedMembership,
    promoDiscount,
    loyaltyRedeem,
  )
  const effectiveDiscount = Math.min(subtotal, discount + promoDerivedDiscount)
  const total = Math.max(0, subtotal - effectiveDiscount)
  const categories = getCategories(activeServices)

  const onEvaluatePromo = () => {
    void handleEvaluatePromo({
      promoCode,
      subtotal,
      cart,
      selectedClient,
      setPromoDiscount,
      setPromoError,
      setSelectedMembership,
      setLoyaltyRedeem,
    })
  }

  const cashRegisterRequired = requireCashRegister
  const onCheckout = () => {
    void handleCheckout({
      cart,
      paymentMethod,
      cashRegisterRequired,
      hasOpenRegister,
      selectedMembership,
      promoCode,
      loyaltyRedeem,
      isBarbero,
      currentEmployeeId,
      initialServices,
      isOnline,
      businessId,
      locationId,
      selectedClient,
      selectedEmployee,
      subtotal,
      tipAmount,
      activeBookingId,
      total,
      checkoutError,
      setCheckoutError,
      setLoading,
      setHasOpenRegister,
      setReceiptNumber,
      setPendingCount,
      setWalkinTxId,
      setSaveForm,
      setShowSaveModal,
      supabase,
      router,
      setSuccessAmount,
      setSuccess,
      setCart,
      setDiscount,
      setPromoDiscount,
      setPromoCode,
      setLoyaltyRedeem,
      setSelectedMembership,
      setTipAmount,
      setSelectedClient,
      setShowBookingBanner,
    })
  }

  const onSaveWalkin = () => {
    void handleSaveWalkin({
      supabase,
      businessId,
      saveForm,
      walkinTxId,
      setActiveClients,
      setSavingClient,
      setShowSaveModal,
      setWalkinTxId,
    })
  }

  if (success) {
    return (
      <POSSuccessScreen
        receiptNumber={receiptNumber}
        successAmount={successAmount}
        currency={currency}
        showSaveModal={showSaveModal}
        saveForm={saveForm}
        setSaveForm={setSaveForm}
        savingClient={savingClient}
        onSaveWalkin={onSaveWalkin}
        onNewSale={() => {
          setSuccess(false)
          setShowSaveModal(false)
        }}
        setShowSaveModal={setShowSaveModal}
        t={t}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {mounted && !isOnline ? <OfflineBanner pendingCount={pendingCount} /> : null}
      {mounted && isOnline && pendingCount > 0 ? (
        <SyncBanner
          pendingCount={pendingCount}
          syncing={syncing}
          syncError={syncError}
          onSync={() => void syncQueue()}
        />
      ) : null}
      {showBookingBanner && bookingContext ? (
        <BookingBanner label={bookingContext.label} t={t} />
      ) : null}
      <MobileTabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={cart.reduce((s, i) => s + i.qty, 0)}
        t={t}
      />
      <div className="flex-1 flex gap-0 min-h-0">
        <ServiceGrid
          categories={categories}
          activeServices={activeServices}
          currency={currency}
          activeTab={activeTab}
          onAddToCart={addToCart}
          t={t}
        />
        <div
          className={`bg-white border-l border-gray-200 flex flex-col md:w-80 md:shrink-0 ${activeTab !== 'cart' ? 'hidden md:flex' : 'flex w-full'}`}
        >
          <CartPanel
            activeTab={activeTab}
            cart={cart}
            currency={currency}
            t={t}
            activeClients={activeClients}
            selectedClient={selectedClient}
            setSelectedClient={setSelectedClient}
            isBarbero={isBarbero}
            currentEmployeeId={currentEmployeeId}
            activeEmployees={activeEmployees}
            selectedEmployee={selectedEmployee}
            setSelectedEmployee={setSelectedEmployee}
            onUpdateQty={updateQty}
            onRemove={(id) => setCart((c) => c.filter((i) => i.service.id !== id))}
            discount={discount}
            subtotal={subtotal}
            setDiscount={setDiscount}
            setPromoDiscount={setPromoDiscount}
            setPromoCode={setPromoCode}
            setSelectedMembership={setSelectedMembership}
            setLoyaltyRedeem={setLoyaltyRedeem}
            membershipOptions={membershipOptions}
            selectedMembership={selectedMembership}
            mounted={mounted}
            promoCode={promoCode}
            promoError={promoError}
            promoDiscount={promoDiscount}
            onEvaluatePromo={onEvaluatePromo}
            loyaltyBalance={loyaltyBalance}
            loyaltyRedeem={loyaltyRedeem}
            tipAmount={tipAmount}
            setTipAmount={setTipAmount}
            effectiveDiscount={effectiveDiscount}
          />
          <CheckoutFooter
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            setCheckoutError={setCheckoutError}
            total={total}
            currency={currency}
            tipAmount={tipAmount}
            cashRegisterRequired={cashRegisterRequired}
            hasOpenRegister={hasOpenRegister}
            checkoutError={checkoutError}
            cartLength={cart.length}
            loading={loading}
            isOnline={isOnline}
            onCheckout={onCheckout}
            t={t}
          />
        </div>
      </div>
    </div>
  )
}
