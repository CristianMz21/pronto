import { redirect } from 'next/navigation'

import { getAdminSecretPath } from '@/lib/admin-secret'
import { createClient } from '@/lib/supabase/server'

import { OnboardingWizard } from './OnboardingWizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const isSelfhosted = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
    redirect(isSelfhosted ? `${getAdminSecretPath()}/login` : '/login')
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, slug, name, onboarding_completed')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!business) {
    const isSelfhosted = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
    redirect(isSelfhosted ? `${getAdminSecretPath()}/login` : '/login')
  }

  // Guard: already onboarded → go straight to dashboard
  if (business.onboarding_completed) {
    const isSaas = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'saas'
    if (isSaas && business.slug) {
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'trypronto.app'
      redirect(`https://${business.slug}.${rootDomain}/dashboard`)
    }
    const isSelfhosted = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
    redirect(isSelfhosted ? `${getAdminSecretPath()}/dashboard` : '/dashboard')
  }

  const isSaas = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'saas'

  return (
    <OnboardingWizard
      initialSlug={business.slug ?? ''}
      initialName={business.name ?? ''}
      isSaas={isSaas}
      rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'trypronto.app'}
    />
  )
}
