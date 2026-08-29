import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { PasswordInput } from '@/components/ui/password-input'

import { registerClient } from './actions'

export default async function ClientRegisterPage(props: {
  searchParams: Promise<{ redirect?: string; error?: string }>
}) {
  const searchParams = await props.searchParams
  const t = await getTranslations('auth.register')
  const redirectParam = searchParams.redirect ?? '/client/dashboard'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Crear cuenta de cliente</h1>
      <p className="text-sm text-gray-500 mb-6">Reservá online sin repetir tus datos</p>

      {searchParams.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {searchParams.error}
        </div>
      )}

      <form action={registerClient} className="space-y-4">
        <input type="hidden" name="redirect" value={redirectParam} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
            Nombre completo *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Tu nombre"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
            Correo electrónico *
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
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">
            Teléfono
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="+54 11 1234 5678"
          />
        </div>
        <PasswordInput
          id="password"
          name="password"
          label={t('passwordLabel')}
          placeholder={t('passwordPlaceholder')}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {t('submitButton')}
        </button>
      </form>

      <p className="text-sm text-gray-500 text-center mt-4">
        ¿Ya tenés cuenta?{' '}
        <Link
          href={`/client/login?redirect=${encodeURIComponent(redirectParam)}`}
          className="text-blue-600 hover:underline"
        >
          Iniciar sesión
        </Link>
      </p>
    </div>
  )
}
