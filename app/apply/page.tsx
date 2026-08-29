import { ApplyForm } from './apply-form'

export const metadata = {
  title: 'Solicitar alta de barbería — Escudería',
  description: 'Solicita el alta de tu barbería con verificación y licenciamiento. Proceso controlado y seguro.',
  robots: { index: false, follow: false },
}

export default function ApplyPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Solicitar alta de barbería</h1>
        <p className="text-sm text-gray-500 mb-6">Proceso controlado con verificación. Te contactaremos en 24h.</p>
        <ApplyForm />
      </div>
    </div>
  )
}
