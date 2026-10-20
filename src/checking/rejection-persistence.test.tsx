import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftStorageKey } from '../document/draft'
import { useSentenceEditor } from './useSentenceEditor'
import { failNextSnapshotWrite } from '../test/draft'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_url, options) => {
    const body = JSON.parse(options?.body as string)
    const input = body.messages[1].content as string
    return new Response(JSON.stringify({ choices: [{
      message: { role: 'assistant', content: input.replace('They works', 'They work') }, finish_reason: 'stop',
    }] }))
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (navigator as { locks?: unknown }).locks
})

async function check(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
}

function flush(): void {
  window.dispatchEvent(new Event('pagehide'))
}

describe('persistent per-occurrence rejections', () => {
  it.each([true, false])('restores rejection-only changes before checking, preserving duplicates (Strict Mode: %s)', async (strict) => {
    localStorage.setItem(draftStorageKey(), '\tThey works.  They works.\r\n')
    const editor = renderHook(() => useSentenceEditor(), {
      wrapper: ({ children }) => strict ? <StrictMode>{children}</StrictMode> : children,
    })
    await check()
    const record = editor.result.current.state.sentences[0]
    expect(record.suggestion).toBe('They work.')
    act(() => {
      expect(editor.result.current.reject({ ...record, suggestion: record.suggestion! })).toBe(true)
      // No render or text edit between reject and the reload flush.
      flush()
    })
    editor.unmount()
    vi.mocked(fetch).mockClear()
    const reopened = renderHook(() => useSentenceEditor())
    expect(reopened.result.current.state.document.text).toBe('\tThey works.  They works.\r\n')
    expect(reopened.result.current.state.sentences.map((record) => record.status)).toEqual(['rejected', 'idle'])
    await check()
    expect(fetch).toHaveBeenCalledTimes(2) // Only the other duplicate, including its confirmation pass.
    expect(reopened.result.current.state.sentences.map((record) => record.status)).toEqual(['rejected', 'suggestion'])
  })

  it('saves rejection-only changes at the interval and retries failed atomic writes', async () => {
    const editor = renderHook(() => useSentenceEditor())
    act(() => { editor.result.current.updateText('They works.') })
    await check()
    act(flush)
    const key = draftStorageKey().replace('typewriter:draft:', 'typewriter:snapshot:')
    const saved = localStorage.getItem(key)
    const record = editor.result.current.state.sentences[0]
    act(() => { editor.result.current.reject({ ...record, suggestion: record.suggestion! }) })
    const write = failNextSnapshotWrite()
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(localStorage.getItem(key)).toBe(saved)
    act(() => { vi.advanceTimersByTime(180_000) })
    expect(JSON.parse(localStorage.getItem(key)!).rejected).toEqual([{ start: 0, end: 11, text: 'They works.' }])
    expect(editor.result.current.saveStatus.savedAt).toBe(Date.now() - 400)
    write.mockRestore()
  })

  it.each([
    ['\nOpening.  They works.', true],
    ['\n  They works.\t', true],
    ['They worked.', false],
    ['They. Works.', false],
    ['They works Last.', false],
    ['', false],
  ] as const)('persists only still-current rejections after an edit to %j', async (text, retained) => {
    const editor = renderHook(() => useSentenceEditor())
    act(() => { editor.result.current.updateText(text === 'They works Last.' ? 'They works. Last.' : 'They works.') })
    await check()
    const record = editor.result.current.state.sentences[0]
    act(() => {
      editor.result.current.reject({ ...record, suggestion: record.suggestion! })
      editor.result.current.updateText(text)
      flush()
    })
    editor.unmount()
    const reopened = renderHook(() => useSentenceEditor())
    expect(reopened.result.current.state.sentences.some((record) => record.status === 'rejected')).toBe(retained)
  })

  it('does not resurrect rejection after editing back to the original text', async () => {
    const editor = renderHook(() => useSentenceEditor())
    act(() => { editor.result.current.updateText('They works.') })
    await check()
    const record = editor.result.current.state.sentences[0]
    act(() => {
      editor.result.current.reject({ ...record, suggestion: record.suggestion! })
      flush()
      editor.result.current.updateText('They worked.')
      editor.result.current.updateText('They works.')
      flush()
    })
    editor.unmount()
    expect(renderHook(() => useSentenceEditor()).result.current.state.sentences[0].status).toBe('idle')
  })

  it('keeps rejection state isolated between tab drafts', async () => {
    const first = renderHook(() => useSentenceEditor())
    act(() => { first.result.current.updateText('They works.') })
    await check()
    const record = first.result.current.state.sentences[0]
    act(() => {
      first.result.current.reject({ ...record, suggestion: record.suggestion! })
      flush()
    })
    const firstId = sessionStorage.getItem('typewriter:tab')!
    first.unmount()
    sessionStorage.clear()
    const second = renderHook(() => useSentenceEditor())
    expect(second.result.current.state.document.text).toBe('')
    act(() => { second.result.current.updateText('They works.') })
    await check()
    expect(second.result.current.state.sentences[0].status).toBe('suggestion')
    second.unmount()
    sessionStorage.setItem('typewriter:tab', firstId)
    expect(renderHook(() => useSentenceEditor()).result.current.state.sentences[0].status).toBe('rejected')
  })

  it('restores rejection when opening a saved draft and ignores late results from the previous draft', async () => {
    const editor = renderHook(() => useSentenceEditor())
    act(() => { editor.result.current.updateText('They works.') })
    await check()
    const record = editor.result.current.state.sentences[0]
    act(() => {
      editor.result.current.reject({ ...record, suggestion: record.suggestion! })
      flush()
    })
    const savedId = sessionStorage.getItem('typewriter:tab')!
    localStorage.setItem('typewriter:draft:other', 'They works.')
    let complete!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    await act(async () => { expect(await editor.result.current.openDraft('other')).toBe(true) })
    await check()
    await act(async () => { expect(await editor.result.current.openDraft(savedId)).toBe(true) })
    expect(editor.result.current.state.sentences[0].status).toBe('rejected')
    await act(async () => {
      complete(new Response(JSON.stringify({ choices: [{
        message: { role: 'assistant', content: 'They works.' }, finish_reason: 'stop',
      }] })))
    })
    await check()
    expect(editor.result.current.state.sentences[0].status).toBe('rejected')
    expect((await editor.result.current.listDrafts()).filter(({ id }) => id === 'other')).toHaveLength(1)
  })

  it('forks a duplicated tab with its rejections without changing the original', async () => {
    const key = draftStorageKey().replace('typewriter:draft:', 'typewriter:snapshot:')
    const snapshot = JSON.stringify({ schema: 1, text: 'They works.', rejected: [{ start: 0, end: 11, text: 'They works.' }] })
    localStorage.setItem(key, snapshot)
    const lockName = `typewriter:tab:${sessionStorage.getItem('typewriter:tab')}`
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: vi.fn((name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) =>
        Promise.resolve(callback(name === lockName ? null : { name, mode: 'exclusive' }))),
    } })
    const editor = renderHook(() => useSentenceEditor())
    await act(async () => {})
    act(flush)
    const forkedKey = draftStorageKey().replace('typewriter:draft:', 'typewriter:snapshot:')
    expect(forkedKey).not.toBe(key)
    expect(localStorage.getItem(forkedKey)).toBe(snapshot)
    expect(localStorage.getItem(key)).toBe(snapshot)
    expect(editor.result.current.state.sentences[0].status).toBe('rejected')
  })

  it('keeps JSON-looking legacy prose literal and ignores malformed or mismatched markers', () => {
    const key = draftStorageKey()
    const prose = '{"schema":1,"text":"They works.","rejected":[]}'
    localStorage.setItem(key, prose)
    const legacy = renderHook(() => useSentenceEditor())
    expect(legacy.result.current.state.document.text).toBe(prose)
    legacy.unmount()
    localStorage.setItem(key.replace('typewriter:draft:', 'typewriter:snapshot:'), JSON.stringify({
      schema: 1, text: 'They works. They works.', rejected: [
        null, { start: -1, end: 10, text: 'They works.' },
        { start: 0, end: 11, text: 'Other text.' },
        { start: 0, end: 4, text: 'They' }, // Valid slice, but not a sentence occurrence.
        { start: 12, end: 23, text: 'They works.' },
      ],
    }))
    const restored = renderHook(() => useSentenceEditor())
    expect(restored.result.current.state.sentences.map((record) => record.status)).toEqual(['idle', 'rejected'])
  })
})
