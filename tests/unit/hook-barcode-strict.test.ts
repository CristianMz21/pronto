import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'

describe('useBarcodeScanner strict 100%', () => {
  let onScan: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onScan = vi.fn()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function fireKey(key: string, targetTag = 'DIV', dataset: any = {}) {
    const target = { tagName: targetTag, dataset } as any
    const event = new KeyboardEvent('keydown', { key })
    Object.defineProperty(event, 'target', { value: target })
    window.dispatchEvent(event)
  }

  it('calls onScan when buffer >3 and Enter', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('a')
    fireKey('b')
    fireKey('c')
    fireKey('d')
    fireKey('Enter')
    expect(onScan).toHaveBeenCalledWith('abcd')
    unmount()
  })

  it('does not call if buffer <=3', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('a')
    fireKey('b')
    fireKey('Enter')
    expect(onScan).not.toHaveBeenCalled()
    unmount()
  })

  it('ignores INPUT without data-barcode-input', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('a', 'INPUT', {})
    fireKey('b', 'INPUT', {})
    fireKey('Enter', 'DIV')
    // buffer should still be empty because INPUT ignored? Actually handler returns early for INPUT without barcode true, so no buffer build? But Enter from DIV will check buffer length 0 -> no call
    expect(onScan).not.toHaveBeenCalled()
    unmount()
  })

  it('allows INPUT with data-barcode-input true', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('x', 'INPUT', { barcodeInput: 'true' })
    fireKey('y', 'INPUT', { barcodeInput: 'true' })
    fireKey('z', 'INPUT', { barcodeInput: 'true' })
    fireKey('w', 'INPUT', { barcodeInput: 'true' })
    fireKey('Enter', 'INPUT', { barcodeInput: 'true' })
    expect(onScan).toHaveBeenCalledWith('xyzw')
    unmount()
  })

  it('ignores TEXTAREA', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('a', 'TEXTAREA')
    fireKey('b', 'TEXTAREA')
    fireKey('Enter', 'TEXTAREA')
    expect(onScan).not.toHaveBeenCalled()
    unmount()
  })

  it('single char key length 1 appends, other keys ignored', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('Shift') // length 5 -> ignored
    fireKey('a')
    fireKey('Enter')
    // buffer length 1 -> no call
    expect(onScan).not.toHaveBeenCalled()
    // add 4 chars
    fireKey('a')
    fireKey('b')
    fireKey('c')
    fireKey('d')
    fireKey('Enter')
    expect(onScan).toHaveBeenCalledWith('abcd')
    unmount()
  })

  it('clears buffer after 100ms timeout', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('a')
    fireKey('b')
    act(() => { vi.advanceTimersByTime(100) })
    fireKey('c')
    fireKey('d')
    fireKey('e')
    fireKey('f')
    fireKey('Enter')
    // buffer after timeout should be 'cdef' not 'abcdef'
    expect(onScan).toHaveBeenCalledWith('cdef')
    unmount()
  })

  it('enabled false does not add listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, false))
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function))
    fireKey('a')
    fireKey('b')
    fireKey('c')
    fireKey('d')
    fireKey('Enter')
    expect(onScan).not.toHaveBeenCalled()
    unmount()
    addSpy.mockRestore()
  })

  it('cleanup removes listener and clears timer', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const clearSpy = vi.spyOn(global, 'clearTimeout')
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('a')
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(clearSpy).toHaveBeenCalled()
    removeSpy.mockRestore()
    clearSpy.mockRestore()
  })

  it('buffer cleared on Enter', () => {
    const { unmount } = renderHook(() => useBarcodeScanner(onScan, true))
    fireKey('a')
    fireKey('b')
    fireKey('c')
    fireKey('d')
    fireKey('Enter')
    expect(onScan).toHaveBeenCalledTimes(1)
    // next Enter without new chars should not call again
    fireKey('Enter')
    expect(onScan).toHaveBeenCalledTimes(1)
    unmount()
  })
})
