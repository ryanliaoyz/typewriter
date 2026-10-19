import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftStorageKey } from '../document/draft'
import { useSentenceEditor } from './useSentenceEditor'
import { failNextSnapshotWrite, savedDraftText } from '../test/draft'

const LEASE_TTL_MS = 7 * 60_000

beforeEach(() => {
  vi.useFakeTimers()
  // Checks never settle, so only draft behavior is observed.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (navigator as { locks?: unknown }).locks
})

const tabId = () => draftStorageKey().slice('typewriter:draft:'.length)

function saveDraft(id: string, text: string, rejected: readonly object[] = []): void {
  localStorage.setItem(`typewriter:snapshot:${id}`, JSON.stringify({ schema: 1, text, rejected }))
}

/** A lease renewed by another open page. */
function lease(id: string, at = Date.now()): void {
  localStorage.setItem(`typewriter:lease:${id}`, JSON.stringify({ owner: 'another-page', at }))
}

function pagehide(): void {
  act(() => { window.dispatchEvent(new Event('pagehide')) })
}

function snapshotWrites(setItem: { mock: { calls: unknown[][] } }): number {
  return setItem.mock.calls.filter(([key]) => String(key).startsWith('typewriter:snapshot:')).length
}

describe('draft sessions without Web Locks', () => {
  it('forks a duplicated tab whose draft another page leases, without its save time', async () => {
    const original = tabId()
    saveDraft(original, 'Original draft')
    localStorage.setItem(`typewriter:saved:${original}`, '1000')
    lease(original)
    const { result } = renderHook(() => useSentenceEditor())
    expect(result.current.state.document.text).toBe('Original draft')
    await act(async () => {})

    expect(tabId()).not.toBe(original)
    expect(result.current.saveStatus.savedAt).toBeNull()
    act(() => { result.current.updateText('Duplicate edit') })
    pagehide()
    expect(savedDraftText(draftStorageKey())).toBe('Duplicate edit')
    expect(savedDraftText(`typewriter:draft:${original}`)).toBe('Original draft')
  })

  it('keeps a draft whose lease expired with a closed or crashed page', async () => {
    const original = tabId()
    saveDraft(original, 'Recovered draft')
    lease(original, Date.now() - LEASE_TTL_MS)
    renderHook(() => useSentenceEditor())
    await act(async () => {})
    expect(tabId()).toBe(original)
  })

  it('forks instead of overwriting when another page takes over the draft', async () => {
    const original = tabId()
    const { result } = renderHook(() => useSentenceEditor())
    await act(async () => {})
    act(() => { result.current.updateText('Mine') })
    lease(original)
    pagehide()
    expect(tabId()).not.toBe(original)
    expect(localStorage.getItem(`typewriter:snapshot:${original}`)).toBeNull()
    expect(savedDraftText(draftStorageKey())).toBe('Mine')
  })

  it('releases its lease when the page hides, even if visibilitychange follows', () => {
    renderHook(() => useSentenceEditor())
    const key = `typewriter:lease:${tabId()}`
    expect(localStorage.getItem(key)).not.toBeNull()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(localStorage.getItem(key)).toBeNull()

    act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })) })
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('lists only drafts no other page leases, until a lease expires', async () => {
    saveDraft('free', 'Free draft.')
    saveDraft('busy', 'Busy draft.')
    lease('busy')
    const { result } = renderHook(() => useSentenceEditor())
    expect((await result.current.listDrafts()).map(({ preview }) => preview)).toEqual(['Free draft.'])
    vi.setSystemTime(Date.now() + LEASE_TTL_MS)
    expect((await result.current.listDrafts()).map(({ preview }) => preview)).toEqual(['Busy draft.', 'Free draft.'])
  })
})

describe('draft storage housekeeping', () => {
  it('removes blank, orphaned, and superseded entries while listing, and deletes drafts on request', async () => {
    saveDraft('blank', '  \n\t')
    localStorage.setItem('typewriter:saved:blank', '1')
    localStorage.setItem('typewriter:saved:orphan', '1')
    saveDraft('kept', 'Kept draft.')
    localStorage.setItem('typewriter:draft:kept', 'Old text-only copy')
    localStorage.setItem('typewriter:saved:kept', '1')
    const { result } = renderHook(() => useSentenceEditor())

    expect((await result.current.listDrafts()).map(({ preview }) => preview)).toEqual(['Kept draft.'])
    for (const key of ['snapshot:blank', 'saved:blank', 'saved:orphan', 'draft:kept']) {
      expect(localStorage.getItem(`typewriter:${key}`)).toBeNull()
    }
    expect(localStorage.getItem('typewriter:snapshot:kept')).not.toBeNull()

    let removed = false
    await act(async () => { removed = await result.current.removeDraft('kept') })
    expect(removed).toBe(true)
    expect(Object.keys(localStorage).filter((key) => key.endsWith(':kept'))).toEqual([])
    expect(await result.current.listDrafts()).toEqual([])
  })

  it('stores a preview with each save so listing need not parse drafts', () => {
    const { result } = renderHook(() => useSentenceEditor())
    act(() => { result.current.updateText('  First line\nSecond line') })
    pagehide()
    expect(localStorage.getItem(`typewriter:preview:${tabId()}`)).toBe('First line')
  })

  it('never deletes the current tab\'s draft', async () => {
    const { result } = renderHook(() => useSentenceEditor())
    act(() => { result.current.updateText('Current.') })
    pagehide()
    let removed = true
    await act(async () => { removed = await result.current.removeDraft(tabId()) })
    expect(removed).toBe(false)
    expect(savedDraftText(draftStorageKey())).toBe('Current.')
  })
})

describe('opening drafts', () => {
  it('waits for a pending duplicate-tab fork, so the opened draft keeps its key', async () => {
    const original = tabId()
    saveDraft('target', 'Target draft.')
    let refuse!: () => void
    const request = vi.fn((name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) =>
      name === `typewriter:tab:${original}`
        ? new Promise((resolve) => { refuse = () => resolve(callback(null)) })
        : Promise.resolve(callback({ name, mode: 'exclusive' })))
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
    const { result } = renderHook(() => useSentenceEditor())

    let opened!: Promise<boolean>
    act(() => { opened = result.current.openDraft('target') })
    await act(async () => { refuse() })
    expect(await opened).toBe(true)
    expect(tabId()).toBe('target')
    act(() => { result.current.updateText('Target edited.') })
    pagehide()
    expect(savedDraftText('typewriter:draft:target')).toBe('Target edited.')
  })

  it('does not save an opened draft again until it changes', async () => {
    saveDraft('target', 'They works. Fine.', [
      { start: 0, end: 11, text: 'They works.', note: 'extra field' },
      { start: 0, end: 4, text: 'They' },
    ])
    localStorage.setItem('typewriter:saved:target', '1000')
    const { result } = renderHook(() => useSentenceEditor())
    await act(async () => { await result.current.openDraft('target') })
    expect(result.current.state.sentences.map(({ status }) => status)).toEqual(['rejected', 'idle'])

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    act(() => { vi.advanceTimersByTime(180_000) })
    pagehide()
    expect(snapshotWrites(setItem)).toBe(0)
    expect(result.current.saveStatus.savedAt).toBe(1000)
  })
})

describe('legacy draft migration', () => {
  it('shows the legacy draft when moving it fails and retries on reload', () => {
    sessionStorage.clear()
    localStorage.setItem('typewriter:draft', 'Legacy draft')
    const setItem = Storage.prototype.setItem
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith('typewriter:snapshot:')) throw new DOMException('Storage full', 'QuotaExceededError')
      setItem.call(this, key, value)
    })
    const first = renderHook(() => useSentenceEditor())
    expect(first.result.current.state.document.text).toBe('Legacy draft')
    first.unmount()
    expect(localStorage.getItem('typewriter:draft')).toBe('Legacy draft')

    full.mockRestore()
    const reloaded = renderHook(() => useSentenceEditor())
    expect(reloaded.result.current.state.document.text).toBe('Legacy draft')
    expect(savedDraftText(draftStorageKey())).toBe('Legacy draft')
    expect(localStorage.getItem('typewriter:draft')).toBeNull()
  })

  it('moves an unsaved legacy draft at this tab\'s next successful save', () => {
    sessionStorage.clear()
    localStorage.setItem('typewriter:draft', 'Legacy draft')
    failNextSnapshotWrite()
    renderHook(() => useSentenceEditor())
    expect(localStorage.getItem('typewriter:draft')).toBe('Legacy draft')
    pagehide()
    expect(savedDraftText(draftStorageKey())).toBe('Legacy draft')
    expect(localStorage.getItem('typewriter:draft')).toBeNull()
  })
})

describe('save status and failures', () => {
  it('reports failed saves until the next successful one', () => {
    vi.setSystemTime(new Date('2026-10-19T09:00:00Z'))
    const { result } = renderHook(() => useSentenceEditor())
    failNextSnapshotWrite()
    act(() => { result.current.updateText('Unsaved.') })
    pagehide()
    expect(result.current.saveStatus).toEqual({ savedAt: null, failed: true })
    pagehide()
    expect(result.current.saveStatus).toEqual({ savedAt: Date.parse('2026-10-19T09:00:00Z'), failed: false })
  })

  it('keeps the failure list identity when an edit changes nothing in it', () => {
    const { result } = renderHook(() => useSentenceEditor())
    const failures = result.current.failures
    act(() => { result.current.updateText('A new sentence.') })
    expect(result.current.failures).toBe(failures)
  })
})
