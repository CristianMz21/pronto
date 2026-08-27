import { describe, it, expect } from 'vitest'
import { formatCurrency } from '@/lib/utils'

describe('formatCurrency — Colombia COP parametrizado (T008)', () => {
  it('COP 30.000 con es-CO usa punto como separador miles y $', () => {
    const v = formatCurrency(30000, 'COP')
    // es-CO: "$ 30.000" (NBSP normalizado a space)
    expect(v).toBe('$ 30.000')
  })

  it('COP 45.000', () => {
    expect(formatCurrency(45000, 'COP')).toBe('$ 45.000')
  })

  it('COP 15.000,5 con decimales usa coma', () => {
    const v = formatCurrency(15000.5, 'COP')
    expect(v).toBe('$ 15.000,5')
  })

  it('USD mantiene en-US con coma miles y punto decimal', () => {
    expect(formatCurrency(30000, 'USD')).toBe('$30,000')
    expect(formatCurrency(15000.5, 'USD')).toBe('$15,000.5')
  })

  it('default sigue siendo USD', () => {
    expect(formatCurrency(1000)).toBe('$1,000')
  })

  it('locale override explícito', () => {
    // COP forzado a en-US (no recomendado, solo para verificar override)
    const v = formatCurrency(30000, 'COP', 'en-US')
    expect(v).toContain('COP') // en-US con COP muestra "COP"
  })

  it('EUR es-ES y BRL pt-BR no explota', () => {
    expect(formatCurrency(1000, 'EUR')).toBeTruthy()
    expect(formatCurrency(1000, 'BRL')).toBeTruthy()
  })
})
