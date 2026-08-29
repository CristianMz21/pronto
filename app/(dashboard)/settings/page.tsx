import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { getTranslations } from 'next-intl/server'
import { SettingsTabs } from './settings-tabs'
import { WhatsAppSection } from './whatsapp-section'
import { ConfigSection } from './config-section'
import { getAuthUser } from '@/lib/auth-user'

export default async function SettingsPage() {
  const supabase = await createClient()
  const t = await getTranslations('settings')
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id, name, slug, type, phone, email, address, timezone, currency, plan, plan_expires_at, telegram_bot_token, telegram_chat_id, viber_bot_token, viber_chat_id, owner_whatsapp, email_provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, resend_api_key, meta_whatsapp_phone_number_id, meta_whatsapp_access_token, wa_template_confirmation, wa_template_reminder, wa_template_thankyou, wa_template_reactivation, wa_template_birthday, wa_template_language, brand_color, notification_language, logo_url, enabled_modules, min_advance_minutes, booking_lead_time_enabled, require_cash_register_for_cash, allow_guest_bookings')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!business) redirect('/onboarding')

  const [
    { data: services },
    { data: employees },
    { data: businessHours },
    { data: locations },
  ] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, price, duration_min, category, is_active, capacity')
      .eq('business_id', business.id)
      .order('name'),
    supabase
      .from('employees')
      .select('id, name, role, email, phone, is_active, color, specialties, commission_rate, commission_fixed, bio, avatar_url')
      .eq('business_id', business.id)
      .order('name'),
    supabase
      .from('business_hours')
      .select('day_of_week, is_open, open_time, close_time, break_start, break_end')
      .eq('business_id', business.id)
      .order('day_of_week'),
    supabase.from('locations').select('id, name').eq('business_id', business.id).order('name'),
  ])

  return (
    <>
      <Header title={t('title')} />
      <SettingsTabs
        business={business}
        services={services ?? []}
        employees={employees ?? []}
        workingHours={businessHours ?? []}
        userEmail={user.email ?? ''}
        userId={user.id}
      />
      <div className="px-6 pb-6 max-w-5xl mx-auto space-y-6">
        <WhatsAppSection
          businessId={business.id}
          initialPhoneNumberId={business.meta_whatsapp_phone_number_id}
          initialAccessToken={business.meta_whatsapp_access_token}
        />
        <ConfigSection
          businessId={business.id}
          initial={{
            tax_rate: (business as unknown as { tax_rate?: number }).tax_rate,
            payment_methods: (business as unknown as { payment_methods?: string[] }).payment_methods,
            cancel_lead_time: (business as unknown as { cancel_lead_time?: number }).cancel_lead_time,
            min_advance_minutes: business.min_advance_minutes,
            booking_lead_time_enabled: business.booking_lead_time_enabled ?? true,
            loyalty_earn_rate: (business as unknown as { loyalty_earn_rate?: number }).loyalty_earn_rate,
            loyalty_redeem_rate: (business as unknown as { loyalty_redeem_rate?: number }).loyalty_redeem_rate,
            loyalty_redeem_value: (business as unknown as { loyalty_redeem_value?: number }).loyalty_redeem_value,
          }}
          locations={locations ?? []}
        />
      </div>
    </>
  )
}
