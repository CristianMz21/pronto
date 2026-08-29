'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export async function registerClient(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = (formData.get('name') as string).trim()
  const phone = (formData.get('phone') as string)?.trim() || null
  const redirectTo = (formData.get('redirect') as string) || '/client/dashboard'

  if (!name) {
    redirect(
      `/client/register?error=${encodeURIComponent('El nombre es obligatorio')}&redirect=${encodeURIComponent(redirectTo)}`,
    )
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, phone },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
    },
  })

  if (error || !data.user) {
    redirect(
      `/client/register?error=${encodeURIComponent(error?.message ?? 'Error al crear cuenta')}&redirect=${encodeURIComponent(redirectTo)}`,
    )
  }

  // Selfhosted: auto-login if no session
  if (!data.session) {
    const { data: signIn } = await supabase.auth.signInWithPassword({ email, password })
    if (signIn.session) {
      redirect(redirectTo)
    }
    redirect('/check-email')
  }

  redirect(redirectTo)
}
