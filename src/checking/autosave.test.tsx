import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { draftStorageKey } from '../document/draft'
import { useSentenceEditor } from './useSentenceEditor'
import { savedDraftText } from '../test/draft'

beforeEach(() => {
  vi.useFakeTimers()
  // Open the tab session before spies so tab-ID writes are not counted as saves.
  draftStorageKey()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Count draft-text writes; each save also records its time under another key. */
function draftWrites(setItem: MockInstance<Storage['setItem']>): number {
  return setItem.mock.calls.filter(([key]) => key.startsWith('typewriter:snapshot:')).length
}

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
    expect(draftWrites(setItem)).toBe(0)
    act(() => { vi.advanceTimersByTime(1) })
    expect(draftWrites(setItem)).toBe(1)
    expect(savedDraftText(draftStorageKey())).toBe(result.current.state.document.text)

    act(() => { vi.advanceTimersByTime(180_000) })
    expect(draftWrites(setItem)).toBe(2)
    expect(savedDraftText(draftStorageKey())).toBe(result.current.state.document.text)
    window.clearInterval(typing)
  })

  it.each(['', 'Saved draft'])('skips writes for unchanged or reverted text (initial: %j)', (text) => {
    localStorage.setItem(draftStorageKey(), text)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useSentenceEditor())
    act(() => { vi.advanceTimersByTime(180_000) })
    act(() => {
      result.current.updateText('Temporary edit')
      result.current.updateText(text)
      window.dispatchEvent(new Event('pagehide'))
    })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(draftWrites(setItem)).toBe(0)

    act(() => { result.current.updateText('Changed draft') })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(draftWrites(setItem)).toBe(1)
    act(() => { vi.advanceTimersByTime(180_000) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(draftWrites(setItem)).toBe(1)
  })

  it('persists partial deletion, whitespace-only text, and an empty document', () => {
    localStorage.setItem(draftStorageKey(), 'A longer draft')
    const { result, unmount } = renderHook(() => useSentenceEditor())
    for (const text of ['A draft', ' \r\n\t ', '']) {
      act(() => { result.current.updateText(text) })
      act(() => { vi.advanceTimersByTime(180_000) })
      expect(savedDraftText(draftStorageKey())).toBe(text)
    }
    unmount()
    const reopened = renderHook(() => useSentenceEditor())
    expect(reopened.result.current.state.document.text).toBe('')
    expect(reopened.result.current.state.sentences).toEqual([])
  })

  it.each(['Latest draft', ''])('flushes the latest edit on pagehide before React renders (%j)', (text) => {
    localStorage.setItem(draftStorageKey(), 'Previous draft')
    const { result } = renderHook(() => useSentenceEditor())
    act(() => {
      result.current.updateText(text)
      window.dispatchEvent(new Event('pagehide'))
      expect(savedDraftText(draftStorageKey())).toBe(text)
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
    expect(draftWrites(setItem)).toBe(0)

    act(() => {
      result.current.updateText('Latest draft')
      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(savedDraftText(draftStorageKey())).toBe('Latest draft')
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(draftWrites(setItem)).toBe(1)

    act(() => {
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      result.current.updateText('Resumed draft')
    })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(draftWrites(setItem)).toBe(2)
    expect(savedDraftText(draftStorageKey())).toBe('Resumed draft')
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
    expect(savedDraftText(draftStorageKey())).toBe('Unsaved draft')
  })

  it('retains pending changes after a failed write, including a subsequent deletion', () => {
    localStorage.setItem(draftStorageKey(), 'Saved draft')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useSentenceEditor())
    act(() => { result.current.updateText('Changed draft') })
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(savedDraftText(draftStorageKey())).toBe('Saved draft')

    act(() => {
      result.current.updateText('')
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(savedDraftText(draftStorageKey())).toBe('')
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(draftWrites(setItem)).toBe(2)
  })

  it('keeps one autosave timer in Strict Mode and flushes and stops on unmount', () => {
    localStorage.setItem(draftStorageKey(), 'Restored draft')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result, unmount } = renderHook(() => useSentenceEditor(), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    })
    act(() => { vi.advanceTimersByTime(400) })
    expect(draftWrites(setItem)).toBe(0)
    expect(vi.getTimerCount()).toBe(1)
    act(() => { result.current.updateText('Last edit') })
    unmount()
    expect(savedDraftText(draftStorageKey())).toBe('Last edit')
    expect(draftWrites(setItem)).toBe(1)
    // jsdom dispatches storage events on a zero-delay timer after the final save.
    vi.advanceTimersByTime(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps each tab\'s draft separate so a stale tab cannot overwrite another', () => {
    const first = renderHook(() => useSentenceEditor())
    const firstKey = draftStorageKey()
    act(() => {
      first.result.current.updateText('First tab')
      window.dispatchEvent(new Event('pagehide'))
    })

    // A new tab has a new session.
    sessionStorage.clear()
    const second = renderHook(() => useSentenceEditor())
    const secondKey = draftStorageKey()
    expect(secondKey).not.toBe(firstKey)
    expect(second.result.current.state.document.text).toBe('')

    act(() => {
      second.result.current.updateText('Second tab, with much more writing')
      first.result.current.updateText('First tab!')
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(savedDraftText(firstKey)).toBe('First tab!')
    expect(savedDraftText(secondKey)).toBe('Second tab, with much more writing')

    second.unmount()
    const reloaded = renderHook(() => useSentenceEditor())
    expect(reloaded.result.current.state.document.text).toBe('Second tab, with much more writing')
  })

  it('moves the pre-per-tab draft into the first new tab only', () => {
    sessionStorage.clear()
    localStorage.setItem('typewriter:draft', 'Legacy draft')
    const first = renderHook(() => useSentenceEditor())
    expect(first.result.current.state.document.text).toBe('Legacy draft')
    expect(localStorage.getItem(draftStorageKey())).toBe('Legacy draft')
    expect(localStorage.getItem('typewriter:draft')).toBeNull()

    sessionStorage.clear()
    const second = renderHook(() => useSentenceEditor())
    expect(second.result.current.state.document.text).toBe('')
  })

  it('forks a duplicated tab to a new key, keeping its copied text', async () => {
    const originalKey = draftStorageKey()
    const originalLock = `typewriter:tab:${originalKey.slice('typewriter:draft:'.length)}`
    localStorage.setItem(originalKey, 'Original draft')
    const request = vi.fn((name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) =>
      Promise.resolve(callback(name === originalLock ? null : { name, mode: 'exclusive' })))
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
    try {
      const { result } = renderHook(() => useSentenceEditor())
      expect(result.current.state.document.text).toBe('Original draft')
      await act(async () => {})
      const forkedKey = draftStorageKey()
      expect(forkedKey).not.toBe(originalKey)

      act(() => { window.dispatchEvent(new Event('pagehide')) })
      expect(savedDraftText(forkedKey)).toBe('Original draft')
      act(() => {
        result.current.updateText('Forked edit')
        window.dispatchEvent(new Event('pagehide'))
      })
      expect(savedDraftText(forkedKey)).toBe('Forked edit')
      expect(localStorage.getItem(originalKey)).toBe('Original draft')
    } finally {
      delete (navigator as { locks?: unknown }).locks
    }
  })

  it('reports and records the time of each successful save', () => {
    vi.setSystemTime(new Date('2026-10-19T09:00:00Z'))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result, unmount } = renderHook(() => useSentenceEditor())
    const savedKey = draftStorageKey().replace('typewriter:draft:', 'typewriter:saved:')
    expect(result.current.lastSavedAt).toBeNull()

    act(() => { result.current.updateText('First save') })
    act(() => { vi.advanceTimersByTime(180_000) })
    const firstSave = Date.parse('2026-10-19T09:03:00Z')
    expect(result.current.lastSavedAt).toBe(firstSave)
    expect(localStorage.getItem(savedKey)).toBe(String(firstSave))

    // Nothing changed, so nothing was saved.
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(result.current.lastSavedAt).toBe(firstSave)

    setItem.mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    act(() => {
      result.current.updateText('Unsaved change')
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(result.current.lastSavedAt).toBe(firstSave)

    unmount()
    const reloaded = renderHook(() => useSentenceEditor())
    expect(reloaded.result.current.lastSavedAt).toBe(Date.parse('2026-10-19T09:06:00Z'))
  })
})
