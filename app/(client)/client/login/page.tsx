import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { PasswordInput } from '@/components/ui/password-input'

import { loginClient } from './actions'

export default async function ClientLoginPage(props: {
  searchParams: Promise<{ redirect?: string; error?: string }>
}) {
  const searchParams = await props.searchParams
  const t = await getTranslations('auth.login')
  const redirect = searchParams.redirect ?? '/client/dashboard'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Acceso cliente</h1>
      <p className="text-sm text-gray-500 mb-6">Iniciá sesión para ver tus reservas</p>

      {searchParams.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {searchParams.error}
        </div>
      )}

      <form action={loginClient} className="space-y-4">
        <input type="hidden" name="redirect" value={redirect} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t('emailPlaceholder')}
          />
        </div>
        <div>
          <PasswordInput
            id="password"
            name="password"
            label={t('passwordLabel')}
            placeholder={t('passwordPlaceholder')}
            required
            autoComplete="current-password"
          />
          <div className="text-right mt-1">
            <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {t('submitButton')}
        </button>
      </form>

      <p className="text-sm text-gray-500 text-center mt-6">
        ¿No tenés cuenta?{' '}
        <Link
          href={`/client/register?redirect=${encodeURIComponent(redirect)}`}
          className="text-blue-600 hover:underline"
        >
          Crear cuenta
        </Link>
      </p>
    </div>
  )
}
