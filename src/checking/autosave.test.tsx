import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_STORAGE_KEY } from '../document/draft'
import { useSentenceEditor } from './useSentenceEditor'

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('draft autosave', () => {
  it('saves every three minutes during continuous typing, without waiting for idle time', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useSentenceEditor())
    let edits = 0
    act(() => { vi.advanceTimersByTime(1) })
    const typing = window.setInterval(() => {
      result.current.updateText(`Draft ${++edits}`)
    }, 200)

    act(() => { vi.advanceTimersByTime(179_998) })
    expect(setItem).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(result.current.state.document.text)

    act(() => { vi.advanceTimersByTime(180_000) })
    expect(setItem).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(result.current.state.document.text)
    window.clearInterval(typing)
  })

  it.each(['', 'Saved draft'])('skips writes for unchanged or reverted text (initial: %j)', (text) => {
    localStorage.setItem(DRAFT_STORAGE_KEY, text)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useSentenceEditor())
    act(() => { vi.advanceTimersByTime(180_000) })
    act(() => {
      result.current.updateText('Temporary edit')
      result.current.updateText(text)
      window.dispatchEvent(new Event('pagehide'))
    })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(setItem).not.toHaveBeenCalled()

    act(() => { result.current.updateText('Changed draft') })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(setItem).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(180_000) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('persists partial deletion, whitespace-only text, and an empty document', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, 'A longer draft')
    const { result, unmount } = renderHook(() => useSentenceEditor())
    for (const text of ['A draft', ' \r\n\t ', '']) {
      act(() => { result.current.updateText(text) })
      act(() => { vi.advanceTimersByTime(180_000) })
      expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(text)
    }
    unmount()
    const reopened = renderHook(() => useSentenceEditor())
    expect(reopened.result.current.state.document.text).toBe('')
    expect(reopened.result.current.state.sentences).toEqual([])
  })

  it.each(['Latest draft', ''])('flushes the latest edit on pagehide before React renders (%j)', (text) => {
    localStorage.setItem(DRAFT_STORAGE_KEY, 'Previous draft')
    const { result } = renderHook(() => useSentenceEditor())
    act(() => {
      result.current.updateText(text)
      window.dispatchEvent(new Event('pagehide'))
      expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(text)
    })
  })

  it('flushes on becoming hidden and continues autosaving after the page returns', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useSentenceEditor())
    act(() => {
      result.current.updateText('First draft')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(setItem).not.toHaveBeenCalled()

    act(() => {
      result.current.updateText('Latest draft')
      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('Latest draft')
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(setItem).toHaveBeenCalledTimes(1)

    act(() => {
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      result.current.updateText('Resumed draft')
    })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(setItem).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('Resumed draft')
  })

  it('keeps editing usable when storage is unavailable and retries after recovery', () => {
    const storage = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    const { result } = renderHook(() => useSentenceEditor())
    expect(result.current.state.document.text).toBe('')
    act(() => { result.current.updateText('Unsaved draft') })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(result.current.state.document.text).toBe('Unsaved draft')

    storage.mockRestore()
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('Unsaved draft')
  })

  it('retains pending changes after a failed write, including a subsequent deletion', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, 'Saved draft')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useSentenceEditor())
    act(() => { result.current.updateText('Changed draft') })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('Saved draft')

    act(() => {
      result.current.updateText('')
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('')
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(setItem).toHaveBeenCalledTimes(2)
  })

  it('keeps one autosave timer in Strict Mode and flushes and stops on unmount', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, 'Restored draft')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result, unmount } = renderHook(() => useSentenceEditor(), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    })
    act(() => { vi.advanceTimersByTime(400) })
    expect(setItem).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
    act(() => { result.current.updateText('Last edit') })
    unmount()
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('Last edit')
    expect(setItem).toHaveBeenCalledTimes(1)
    // jsdom dispatches storage events on a zero-delay timer after the final save.
    vi.advanceTimersByTime(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
