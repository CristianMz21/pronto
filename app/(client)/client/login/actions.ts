'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginClient(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = (formData.get('redirect') as string) || '/client/dashboard'

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    redirect(`/client/login?error=${encodeURIComponent('Correo o contraseña incorrectos')}&redirect=${encodeURIComponent(redirectTo)}`)
  }

  redirect(redirectTo)
}
