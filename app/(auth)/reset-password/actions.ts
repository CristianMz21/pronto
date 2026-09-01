'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (password.length < 8) {
    redirect(
      (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
        ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/reset-password`
        : '/reset-password') + '?error=Password+must+be+at+least+8+characters',
    )
  }

  if (password !== confirm) {
    redirect(
      (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
        ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/reset-password`
        : '/reset-password') + '?error=Passwords+don%27t+match',
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(
      `${process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas' ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/reset-password` : '/reset-password'}?error=${encodeURIComponent(error.message)}`,
    )
  }

  redirect(
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas'
      ? `${process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || '/escuderito-admin'}/dashboard`
      : '/dashboard',
  )
}
