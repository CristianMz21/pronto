'use client'

import { useState } from 'react'

import type { AppointmentSummary } from '@/lib/client-360'

const TIMELINE = [
  { key: 'pending', label: 'Reservada' },
  { key: 'scheduled', label: 'Reservada' },
  { key: 'confirmed', label: 'Confirmada' },
  { key: 'checked_in', label: 'En espera' },
  { key: 'in_service', label: 'En servicio' },
  { key: 'completed', label: 'Completada' },
] as const

function statusIdx(status: string): number {
  const order: Record<string, number> = {
    pending: 0,
    scheduled: 0,
    confirmed: 1,
    checked_in: 2,
    in_service: 3,
    completed: 4,
    cancelled: -1,
    cancelled_late: -1,
    no_show: -1,
    paid: 4,
  }
  return order[status] ?? 0
}

function formatBogota(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso.slice(0, 16)
  }
}

export function UpcomingCard({
  appointment,
  onCancel,
  onReprogram,
  onCheckin,
  checkingIn,
}: {
  appointment: AppointmentSummary
  onCancel: (id: string) => void
  onReprogram: (id: string, date: string, time: string) => Promise<void>
  onCheckin: ((id: string) => void | Promise<void>) | undefined
  checkingIn?: boolean
}) {
  const idx = statusIdx(appointment.status)
  const isCancelled = appointment.status === 'cancelled' || appointment.status === 'cancelled_late'
  const [showReprogram, setShowReprogram] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [reprogramError, setReprogramError] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Estimate ~10min wait if checked_in — simple placeholder
  const waitEstimate = appointment.status === 'checked_in' ? '~10min' : null

  async function handleReprogramSubmit() {
    if (!date || !time) {
      setReprogramError('Elegí fecha y hora')
      return
    }
    setSaving(true)
    setReprogramError(null)
    try {
      await onReprogram(appointment.id, date, time)
      setShowReprogram(false)
    } catch (e) {
      setReprogramError(String((e as Error).message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900">TU PRÓXIMA CITA</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
            isCancelled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {isCancelled
            ? 'Cancelada'
            : appointment.status === 'completed'
              ? 'Completada'
              : appointment.status === 'checked_in'
                ? 'En espera'
                : appointment.status === 'in_service'
                  ? 'En servicio'
                  : 'Confirmada'}
        </span>
      </div>

      <div className="text-sm font-medium text-gray-900">
        {appointment.service_name ?? 'Servicio'}{' '}
        {appointment.employee_name ? `· ${appointment.employee_name}` : ''}
      </div>
      <div className="text-sm text-gray-600 mt-1">{formatBogota(appointment.starts_at)}</div>
      {appointment.price != null && (
        <div className="text-sm text-gray-700 mt-1">
          ${Number(appointment.price).toLocaleString('es-CO')} COP
        </div>
      )}

      {/* Timeline */}
      {!isCancelled && appointment.status !== 'completed' && (
        <div className="mt-4 flex items-center gap-1 text-[11px] text-gray-500">
          {TIMELINE.map((step, i) => {
            const done = i < idx
            const active = i === idx
            return (
              <div key={step.key + i} className="flex items-center gap-1 flex-1">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] border ${
                    done
                      ? 'bg-green-600 text-white border-green-600'
                      : active
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-400 border-gray-300'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={active ? 'text-gray-900 font-medium' : ''}>{step.label}</span>
                {i < TIMELINE.length - 1 && (
                  <span className="flex-1 border-t border-dashed border-gray-200 mx-1" />
                )}
              </div>
            )
          })}
        </div>
      )}
      {waitEstimate && (
        <div className="text-xs text-amber-700 mt-2">
          En espera {waitEstimate} — te llamamos pronto
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-wrap gap-2 mt-4">
        <a
          href={`/book/escuderia?service=${appointment.service_id ?? ''}&employee=${appointment.employee_id ?? ''}`}
          className="text-xs font-medium px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
        >
          Reservar nuevamente
        </a>
        {!isCancelled && appointment.status !== 'completed' && (
          <>
            <button
              type="button"
              onClick={() => setShowReprogram((v) => !v)}
              className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              Reprogramar
            </button>
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs font-medium px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              Cancelar
            </button>
            {onCheckin && (
              <button
                type="button"
                onClick={() => onCheckin(appointment.id)}
                disabled={!!checkingIn}
                className="text-xs font-medium px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {checkingIn ? '...' : 'Estoy aquí'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Policy text */}
      <p className="text-[11px] text-gray-400 mt-3">
        Política: cancelación gratis hasta 2h antes, luego cargo $10.000.
      </p>

      {/* Reprogram modal inline */}
      {showReprogram && (
        <div className="mt-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="text-xs font-medium text-gray-900 mb-2">Elegí nueva fecha y hora</div>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 border rounded-lg px-2 py-2 text-xs"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="flex-1 border rounded-lg px-2 py-2 text-xs"
            />
          </div>
          {reprogramError && <div className="text-xs text-red-600 mt-2">{reprogramError}</div>}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleReprogramSubmit}
              disabled={saving}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => setShowReprogram(false)}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border bg-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Cancel confirm */}
      {showCancelConfirm && (
        <div className="mt-4 border border-red-200 rounded-lg p-3 bg-red-50">
          <div className="text-xs font-medium text-red-900">¿Cancelar cita?</div>
          <div className="text-xs text-red-700 mt-1">
            Se libera el slot y avisa a lista de espera.
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                setShowCancelConfirm(false)
                onCancel(appointment.id)
              }}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-red-600 text-white"
            >
              Sí, cancelar
            </button>
            <button
              type="button"
              onClick={() => setShowCancelConfirm(false)}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border bg-white"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
