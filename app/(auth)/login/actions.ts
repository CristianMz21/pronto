'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const isSelfhosted = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
  const dashboardDefault = isSelfhosted
    ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/dashboard`
    : '/dashboard'
  const loginDefault = isSelfhosted
    ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/login`
    : '/login'
  const redirectTo = (formData.get('redirectTo') as string) || dashboardDefault

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    redirect(`${loginDefault}?error=${encodeURIComponent('Invalid email or password')}`)
  }

  redirect(redirectTo)
}

export async function loginWithGoogle(formData: FormData) {
  const supabase = await createClient()
  const isSelfhosted = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
  const loginDefault = isSelfhosted
    ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/login`
    : '/login'
  const redirectTo =
    (formData.get('redirectTo') as string) ||
    (isSelfhosted
      ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/dashboard`
      : '/dashboard')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${redirectTo}`,
    },
  })

  if (error || !data.url) {
    redirect(`${loginDefault}?error=${encodeURIComponent('Google sign-in failed')}`)
  }

  redirect(data.url)
}
