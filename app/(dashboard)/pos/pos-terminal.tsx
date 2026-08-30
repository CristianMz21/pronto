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
  /** When false, cash sales do NOT require an open register (055 configurable) */
  requireCashRegister?: boolean
  isBarbero?: boolean
  currentEmployeeId?: string | null
  locationId?: string | null
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

  // ─── POS state ────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState(
    isBarbero && currentEmployeeId ? currentEmployeeId : '',
  )
  const [selectedClient, setSelectedClient] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [discount, setDiscount] = useState(0)
  // US5 loyalty state
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
  // bookingId to update appointment status after checkout
  const [activeBookingId] = useState(bookingContext?.bookingId ?? '')
  const [showBookingBanner, setShowBookingBanner] = useState(!!bookingContext)

  // Walk-in → save as client
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [walkinTxId, setWalkinTxId] = useState('')
  const [saveForm, setSaveForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [savingClient, setSavingClient] = useState(false)

  // ─── Offline state ────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  // Hydration-safe: server and initial client both render with isOnline=true / pendingCount=0 (no banners)
  // so hydration matches. After mount we sync real navigator.onLine and IndexedDB count.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // ─── Cash register state ────────────────────────────────────────────────────
  const [hasOpenRegister, setHasOpenRegister] = useState(initialHasOpenRegister)
  const [checkoutError, setCheckoutError] = useState('')

  // Active data — switches between server-loaded props and IndexedDB cache
  const [activeServices, setActiveServices] = useState<Service[]>(initialServices)
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>(initialEmployees)
  const [activeClients, setActiveClients] = useState<Client[]>(initialClients)

  // ─── On mount (online): refresh clients from Supabase ───────────────────
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

  // ─── Fetch cash register status ────────────────────────────────────────────
  const fetchRegisterStatus = useCallback(async () => {
    if (!navigator.onLine) return
    try {
      const res = await fetch('/api/cash/current')
      if (res.ok) {
        const json = await res.json()
        setHasOpenRegister(!!json.register)
      }
    } catch {}
  }, [])

  useEffect(() => {
    void fetchRegisterStatus()
  }, [fetchRegisterStatus])

  useEffect(() => {
    if (isOnline) void fetchRegisterStatus()
  }, [isOnline, fetchRegisterStatus])

  // ─── On mount: cache POS data to IndexedDB ──────────────────────────────
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

  // ─── On mount: prefill from booking context ──────────────────────────────
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
  }, [bookingContext, currentEmployeeId, initialServices, isBarbero]) // only once on mount

  // ─── US5: fetch loyalty & membership when client changes ─────────────────
  useEffect(() => {
    if (!selectedClient) {
      setLoyaltyBalance(null)
      setMembershipOptions([])
      setSelectedMembership('')
      setLoyaltyRedeem(0)
      return
    }
    // loyalty balance
    fetch(`/api/loyalty?client_id=${selectedClient}`)
      .then(async (r) => {
        if (r.ok) {
          const j = await r.json()
          setLoyaltyBalance(j.points ?? 0)
        } else setLoyaltyBalance(0)
      })
      .catch(() => setLoyaltyBalance(0))
    // memberships
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

  // ─── On mount: load pending count ──────────────────────────────────────
  useEffect(() => {
    getPendingCount()
      .then(setPendingCount)
      .catch(() => {})
  }, [])

  // ─── Online / offline detection ──────────────────────────────────────────
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

  // ─── When going offline: load data from IndexedDB if props are empty ───
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

  // ─── Sync queue when coming back online ──────────────────────────────────
  const syncQueue = useCallback(async () => {
    setSyncing(true)
    setSyncError('')
    try {
      const pending = await getPendingTransactions()
      for (const tx of pending) {
        // Use API so cash_register check is enforced even for offline sales
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
          const j = await res.json().catch(() => ({}))
          setSyncError(
            j.message ?? 'Caja cerrada: abre caja para sincronizar ventas en efectivo pendientes.',
          )
          break
        }
      }
      const remaining = await getPendingCount()
      setPendingCount(remaining)
      // Refresh register status after sync (maybe cash transactions changed expected)
      void fetchRegisterStatus()
    } catch {
      setSyncError('Sync failed. Will retry automatically.')
    } finally {
      setSyncing(false)
    }
  }, [fetchRegisterStatus])

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      void syncQueue()
    }
  }, [isOnline, pendingCount, syncQueue])

  // ─── Cart helpers ─────────────────────────────────────────────────────────
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

  const subtotal = cart.reduce((sum, i) => sum + i.service.price * i.qty, 0)
  // US5: total with membership/promo/loyalty stacking guard (only one non-manual discount)
  const promoDerivedDiscount = selectedMembership
    ? subtotal
    : promoDiscount > 0
      ? promoDiscount
      : loyaltyRedeem > 0
        ? Math.min(subtotal, Math.round(loyaltyRedeem * 100))
        : 0
  const effectiveDiscount = Math.min(subtotal, discount + promoDerivedDiscount)
  const total = Math.max(0, subtotal - effectiveDiscount)
  const categories = Array.from(new Set(activeServices.map((s) => s.category ?? 'Other')))

  async function evaluatePromo() {
    if (!promoCode.trim()) {
      setPromoError('Ingresa código')
      return
    }
    setPromoError('')
    try {
      const res = await fetch('/api/promotions/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promo_code: promoCode.trim(),
          amount: subtotal,
          service_ids: cart.map((i) => i.service.id),
          client_id: selectedClient || null,
          date: new Date().toISOString().slice(0, 10),
        }),
      })
      const j = await res.json()
      if (res.ok && j.eligible) {
        setPromoDiscount(j.discount)
        setPromoError('')
        setSelectedMembership('')
        setLoyaltyRedeem(0)
      } else {
        setPromoDiscount(0)
        setPromoError(j.reason ?? j.error ?? 'No elegible')
      }
    } catch {
      setPromoError('Error evaluando promo')
    }
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────
  // Cash register requirement is configurable per business (055): when requireCashRegister false, cash allowed without caja
  const cashRegisterRequired = requireCashRegister
  async function checkout() {
    if (cart.length === 0) return
    if (paymentMethod === 'cash' && cashRegisterRequired && !hasOpenRegister) {
      setCheckoutError('Debes abrir caja antes de cobrar en efectivo. Ve a Caja → Abrir caja.')
      return
    }
    setCheckoutError('')
    setLoading(true)
    const items = cart.map((i) => ({
      service_id: i.service.id,
      name: i.service.name,
      price: i.service.price,
      qty: i.qty,
    }))

    // US5: stack guard for checkout (only one benefit)
    const benefitCount = [
      selectedMembership,
      promoCode.trim(),
      loyaltyRedeem > 0 ? 'loyalty' : null,
    ].filter(Boolean).length
    if (benefitCount > 1) {
      setCheckoutError('Solo un beneficio por venta (membresía, promo o puntos)')
      setLoading(false)
      return
    }

    const effectiveEmployeeId =
      isBarbero && currentEmployeeId ? currentEmployeeId : selectedEmployee || null
    // Guard: barbero cannot submit a transaction with a service not assigned (defense-in-depth, RLS also enforces via app filter)
    if (isBarbero && currentEmployeeId) {
      const allowedServiceIds = new Set(initialServices.map((s) => s.id))
      const hasDisallowed = items.some((it) => !allowedServiceIds.has(it.service_id))
      if (hasDisallowed) {
        setCheckoutError(
          'No puedes vender un servicio no asignado a tu perfil. Contacta al administrador.',
        )
        setLoading(false)
        return
      }
    }
    try {
      if (!isOnline) {
        // ── Offline: save to IndexedDB queue ──────────────────────────────
        const queued = await queueTransaction({
          business_id: businessId,
          client_id: selectedClient || null,
          employee_id: effectiveEmployeeId,
          amount: subtotal,
          payment_method: paymentMethod,
          items,
        })
        setReceiptNumber(queued.local_receipt)
        setPendingCount((n) => n + 1)
      } else {
        // ── Online: via API (service_role + my_business_ids check, no direct RLS)
        const wasWalkin = !selectedClient
        const res = await fetch('/api/pos/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            location_id: locationId ?? null,
            client_id: selectedClient || null,
            employee_id: effectiveEmployeeId,
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
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (json.error === 'cash_register_closed') {
            setCheckoutError(json.message ?? 'Debes abrir caja antes de cobrar en efectivo')
            setHasOpenRegister(false)
            throw new Error(json.message)
          }
          throw new Error(json.error ?? 'transaction failed')
        }
        const data = json as { receipt_number: string; id: string }
        setReceiptNumber(data.receipt_number ?? '')
        router.refresh()

        // ── If came from Booking: mark appointment as paid ────────────────
        if (activeBookingId) {
          supabase
            .from('appointments')
            .update({ status: 'paid' })
            .eq('id', activeBookingId)
            .then(({ error: apptErr }) => {
              if (apptErr) {
                // eslint-disable-next-line no-console
                console.error('[POS] Failed to update booking status:', apptErr)
              }
            })
        }

        if (wasWalkin && data.id) {
          setWalkinTxId(data.id)
          setSaveForm({ name: '', phone: '', email: '', notes: '' })
          setShowSaveModal(true)
        }
      }

      setSuccessAmount(total)
      setSuccess(true)
      setCart([])
      setDiscount(0)
      setPromoDiscount(0)
      setPromoCode('')
      setLoyaltyRedeem(0)
      setSelectedMembership('')
      setTipAmount(0)
      setSelectedClient('')
      setShowBookingBanner(false)
    } catch (err) {
      // console.error(err)
      if (!checkoutError) {
        const msg = err instanceof Error ? err.message : 'Error al procesar el pago'
        if (!msg.includes('cash_register_closed')) {
          setCheckoutError(msg)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  // ─── Save walk-in as client ───────────────────────────────────────────────
  async function saveWalkinAsClient() {
    if (!saveForm.name.trim()) return
    setSavingClient(true)
    const { data: client } = await supabase
      .from('clients')
      .insert({
        business_id: businessId,
        name: saveForm.name.trim(),
        phone: saveForm.phone || null,
        email: saveForm.email || null,
        notes: saveForm.notes || null,
      })
      .select('id')
      .single()

    if (client) {
      if (walkinTxId) {
        await supabase.from('transactions').update({ client_id: client.id }).eq('id', walkinTxId)
      }
      setActiveClients((prev) => [
        ...prev,
        { id: client.id, name: saveForm.name.trim(), phone: saveForm.phone || null },
      ])
    }
    setSavingClient(false)
    setShowSaveModal(false)
    setWalkinTxId('')
  }

  // ─── Success screen ───────────────────────────────────────────────────────
  if (success) {
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
              {isOfflineReceipt && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-3">
                  Saved offline. Will sync when internet is restored.
                </p>
              )}
              <p className="text-2xl font-bold text-gray-900 mb-6">
                {formatCurrency(successAmount, currency)}
              </p>
              <Button
                onClick={() => {
                  setSuccess(false)
                  setShowSaveModal(false)
                }}
                className="w-full"
              >
                {t('success.newSale')}
              </Button>
            </CardContent>
          </Card>

          {/* Walk-in → save as client prompt */}
          {showSaveModal && (
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
                    onClick={saveWalkinAsClient}
                    disabled={!saveForm.name.trim() || savingClient}
                    className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {savingClient ? '…' : 'Save client'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ─── Main POS UI ──────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Offline / sync banners — hydration-safe: only render after mount so server (no navigator/IndexedDB) and initial client match (no banner) */}
      {mounted && !isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-200 text-orange-800 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span className="font-medium">Offline mode</span>
          <span className="text-orange-600">
            — Sales will sync automatically when you reconnect.
          </span>
          {pendingCount > 0 && (
            <span className="ml-auto font-semibold">{pendingCount} pending</span>
          )}
        </div>
      )}

      {mounted && isOnline && pendingCount > 0 && (
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
          {!syncing && (
            <button
              type="button"
              onClick={syncQueue}
              className="ml-auto text-blue-600 hover:text-blue-800 font-medium underline"
            >
              Sync now
            </button>
          )}
          {syncError && <span className="text-red-600 text-xs ml-2">{syncError}</span>}
        </div>
      )}

      {/* Booking context banner */}
      {showBookingBanner && bookingContext && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border-b border-indigo-200 text-indigo-900 text-sm">
          <CalendarDays className="w-4 h-4 shrink-0 text-indigo-500" />
          <span>
            {t('bookingBanner')} <strong>{bookingContext.label}</strong>
          </span>
        </div>
      )}

      {/* Mobile tab bar */}
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
          {cart.length > 0 && (
            <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center leading-none">
              {cart.reduce((s, i) => s + i.qty, 0)}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 flex gap-0 min-h-0">
        {/* ── Service grid ──────────────────────────────────────────────── */}
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
                        onClick={() => addToCart(s)}
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
            {activeServices.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {t('noServices')}{' '}
                <a href="/settings?tab=services" className="text-blue-600 hover:underline">
                  {t('addServices')}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ── Cart ──────────────────────────────────────────────────────── */}
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
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                {t('clientLabel')}
              </label>
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

            {!isBarbero && activeEmployees.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">
                  {t('employeeLabel')}
                </label>
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
            )}
            {isBarbero && currentEmployeeId && activeEmployees.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">
                  {t('employeeLabel')}
                </label>
                <div className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {activeEmployees[0]?.name ?? 'Mi perfil'}
                </div>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-6">{t('emptyCart')}</div>
            ) : (
              cart.map((item) => (
                <div key={item.service.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {item.service.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatCurrency(item.service.price, currency)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQty(item.service.id, -1)}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.service.id, 1)}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((c) => c.filter((i) => i.service.id !== item.service.id))
                      }
                      className="p-1 rounded hover:bg-red-50 text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}

            {cart.length > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    {t('discountLabel')}
                  </label>
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
                {/* US5: Membership selector */}
                {selectedClient && membershipOptions.length > 0 && (
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
                            ? new Date(m.expires_at).toLocaleDateString('es-CO', {
                                timeZone: 'America/Bogota',
                              })
                            : new Date(m.expires_at).toISOString().slice(0, 10)}
                        </option>
                      ))}
                    </select>
                    {selectedMembership && (
                      <p className="text-xs text-green-600 mt-1">
                        Se consumirá 1 uso. Descuento {formatCurrency(subtotal, currency)}
                      </p>
                    )}
                  </div>
                )}
                {/* US5: Promo code */}
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
                      onClick={evaluatePromo}
                      type="button"
                      className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs"
                    >
                      Validar
                    </button>
                  </div>
                  {promoError && <p className="text-xs text-red-600 mt-1">{promoError}</p>}
                  {promoDiscount > 0 && (
                    <p className="text-xs text-green-600 mt-1">
                      Descuento {formatCurrency(promoDiscount, currency)}
                    </p>
                  )}
                </div>
                {/* US5: Loyalty */}
                {selectedClient && loyaltyBalance !== null && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">
                      Puntos fidelización ({loyaltyBalance} pts ·{' '}
                      {formatCurrency(loyaltyBalance * 100, currency)} valor)
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
                    {loyaltyRedeem > 0 &&
                      loyaltyBalance !== null &&
                      loyaltyRedeem > loyaltyBalance && (
                        <p className="text-xs text-red-600">Puntos insuficientes</p>
                      )}
                  </div>
                )}
                {/* Tip */}
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
                {/* Discount breakdown */}
                {effectiveDiscount > 0 && (
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
                )}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 space-y-3">
            <div className="grid grid-cols-3 gap-1">
              {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => {
                    setPaymentMethod(m)
                    setCheckoutError('')
                  }}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                    paymentMethod === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t(`paymentMethods.${m}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{t('totalLabel')}</span>
              <span className="text-xl font-bold text-gray-900">
                {formatCurrency(total, currency)}
              </span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Propina</span>
                <span>{formatCurrency(tipAmount, currency)}</span>
              </div>
            )}
            {paymentMethod === 'cash' && cashRegisterRequired && !hasOpenRegister && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Debes abrir caja antes de cobrar en efectivo.{' '}
                <a href="/caja" className="font-semibold underline hover:text-amber-900">
                  Ir a Caja
                </a>
              </div>
            )}
            {checkoutError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {checkoutError}
              </div>
            )}
            <Button
              onClick={checkout}
              disabled={
                cart.length === 0 ||
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
        </div>
      </div>
    </div>
  )
}
