// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheSentenceResult, createSentenceDocument, updateSentenceDocument } from '../document/sentences'
import type { SentenceCheckResult } from '../document/sentences'
import { CHECK_DEBOUNCE_MS, createSentenceQueue } from './queue'
import type { SentenceCheck } from './queue'

function deferred() {
  let resolve!: (result: SentenceCheckResult) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<SentenceCheckResult>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function harness() {
  const requests: ReturnType<typeof deferred>[] = []
  const check = vi.fn((_sentence: SentenceCheck) => {
    const request = deferred()
    requests.push(request)
    return request.promise
  })
  const onResult = vi.fn()
  const onError = vi.fn()
  const queue = createSentenceQueue({ check, onResult, onError })
  return { queue, check, onResult, onError, requests }
}

async function settle() {
  // Flush async checker continuations without advancing the debounce timer.
  await Promise.resolve()
}

describe('debounced sequential sentence queue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits 400 ms and resets the timer for each actual edit', async () => {
    const { queue, check } = harness()
    let state = createSentenceDocument('First.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(300)
    state = updateSentenceDocument(state, 'First grows.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS - 1)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledExactlyOnceWith({ id: 'sentence-1', version: 2, text: 'First grows.' })
    expect(queue.getSnapshot().debouncing).toBe(false)
  })

  it('does not reset the debounce on unchanged input or cache-only updates', async () => {
    const { queue, check } = harness()
    let state = createSentenceDocument('First. Second.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(300)
    state = updateSentenceDocument(state, state.document.text)
    state = cacheSentenceResult(state, state.sentences[0], { status: 'clean' })
    queue.update(state)
    await vi.advanceTimersByTimeAsync(100)
    expect(check).toHaveBeenCalledExactlyOnceWith({ id: 'sentence-2', version: 1, text: 'Second.' })
  })

  it('schedules only complete unchecked records, including newly completed trailing text', async () => {
    const { queue, check, requests } = harness()
    let state = createSentenceDocument('Clean. Suggestion. Wait... Draft')
    state = cacheSentenceResult(state, state.sentences[0], { status: 'clean' })
    state = cacheSentenceResult(state, state.sentences[1], { status: 'suggestion', suggestion: 'A suggestion.' })
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    expect(check).not.toHaveBeenCalled()
    state = updateSentenceDocument(state, 'Clean. Suggestion. Wait... Draft.')
    queue.update(state)
    expect(queue.getSnapshot().pending).toHaveLength(1)
    expect(queue.getSnapshot().pending[0].text).toBe('Draft.')
    await vi.advanceTimersByTimeAsync(400)
    requests[0].resolve({ status: 'clean' })
    await settle()
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('replaces queued versions in place, rather than keeping every keystroke', async () => {
    const { queue, check, requests } = harness()
    let state = createSentenceDocument('First. Second. Last.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    for (const text of ['First. Second grows. Last.', 'First. Second grows again. Last.']) {
      state = updateSentenceDocument(state, text)
      queue.update(state)
    }
    expect(queue.getSnapshot().pending).toEqual([
      { id: 'sentence-2', version: 3, text: 'Second grows again.' },
      { id: 'sentence-3', version: 1, text: 'Last.' },
    ])
    await vi.advanceTimersByTimeAsync(400)
    expect(check).toHaveBeenCalledTimes(1)
    requests[0].resolve({ status: 'clean' })
    await settle()
    expect(check.mock.calls[1][0]).toEqual(queue.getSnapshot().active)
    expect(check.mock.calls[1][0].text).toBe('Second grows again.')
  })

  it('checks duplicate occurrences independently and never overlaps requests', async () => {
    const { queue, check, requests } = harness()
    const state = createSentenceDocument('Same. Same. Third.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    expect(check).toHaveBeenCalledTimes(1)
    queue.update(state)
    expect(queue.getSnapshot().pending).toHaveLength(2)
    for (const index of [0, 1, 2]) {
      expect(check).toHaveBeenCalledTimes(index + 1)
      expect(check.mock.calls[index][0].id).toBe(`sentence-${index + 1}`)
      requests[index].resolve({ status: 'clean' })
      await settle()
    }
    queue.update(state)
    await vi.advanceTimersByTimeAsync(1000)
    expect(check).toHaveBeenCalledTimes(3)
    expect(queue.getSnapshot()).toEqual({ pending: [], active: null, debouncing: false })
  })

  it('queues the latest version of an active sentence but waits for edit debounce', async () => {
    const { queue, check, requests, onResult } = harness()
    let state = createSentenceDocument('First.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    const original = { ...queue.getSnapshot().active }
    state = updateSentenceDocument(state, 'First grows.')
    queue.update(state)
    state = updateSentenceDocument(state, 'First grows again.')
    queue.update(state)
    requests[0].resolve({ status: 'clean' })
    await settle()
    expect(onResult).toHaveBeenCalledWith(original, { status: 'clean' })
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(399)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(check.mock.calls[1][0]).toEqual({ id: 'sentence-1', version: 3, text: 'First grows again.' })
  })

  it('prunes deleted, unfinished, clean, and suggestion records from pending work', async () => {
    const { queue, check, requests } = harness()
    let state = createSentenceDocument('Active. Deleted. Clean. Suggestion. Draft.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    state = updateSentenceDocument(state, 'Active. Clean. Suggestion. Draft')
    state = cacheSentenceResult(state, state.sentences[1], { status: 'clean' })
    state = cacheSentenceResult(state, state.sentences[2], { status: 'suggestion', suggestion: 'A suggestion.' })
    queue.update(state)
    expect(queue.getSnapshot().pending).toEqual([])
    requests[0].resolve({ status: 'clean' })
    await settle()
    await vi.advanceTimersByTimeAsync(400)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('keeps an active slot after deletion and admits new occurrences only after settlement', async () => {
    const { queue, check, requests } = harness()
    let state = createSentenceDocument('Old.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    state = updateSentenceDocument(state, '')
    queue.update(state)
    state = updateSentenceDocument(state, 'New.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    expect(check).toHaveBeenCalledTimes(1)
    requests[0].resolve({ status: 'clean' })
    await settle()
    expect(check.mock.calls[1][0]).toEqual({ id: 'sentence-2', version: 1, text: 'New.' })
  })

  it('replaces split/merged queued IDs with the reconciled occurrences', () => {
    const { queue } = harness()
    let state = createSentenceDocument('Cats sleep and dogs play. Last.')
    queue.update(state)
    state = updateSentenceDocument(state, 'Cats sleep. Dogs play. Last.')
    queue.update(state)
    expect(queue.getSnapshot().pending.map(({ id }) => id)).toEqual(['sentence-2', 'sentence-3', 'sentence-4'])
    state = updateSentenceDocument(state, 'Cats sleep and dogs play. Last.')
    queue.update(state)
    expect(queue.getSnapshot().pending.map(({ id }) => id)).toEqual(['sentence-2', 'sentence-5'])
  })

  it('uses current offsets when the owner caches a result after surrounding whitespace moves', async () => {
    let state = createSentenceDocument('First.')
    const request = deferred()
    const onError = vi.fn()
    const queue = createSentenceQueue({
      check: () => request.promise,
      onResult: (checked, result) => {
        state = cacheSentenceResult(state, checked, result)
        queue.update(state)
      },
      onError,
    })
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    state = updateSentenceDocument(state, ' \nFirst.  ')
    queue.update(state)
    request.resolve({ status: 'suggestion', suggestion: 'The first.' })
    await settle()
    await vi.advanceTimersByTimeAsync(400)
    expect(state.document.text).toBe(' \nFirst.  ')
    expect(state.sentences[0]).toMatchObject({ start: 2, end: 8, status: 'suggestion', suggestion: 'The first.' })
    expect(queue.getSnapshot().pending).toEqual([])
    expect(onError).not.toHaveBeenCalled()
  })

  it('forwards failures without marking clean, blocking later work, or automatically retrying', async () => {
    const { queue, check, requests, onResult, onError } = harness()
    let state = createSentenceDocument('Failed. Next.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    const error = new Error('Unavailable')
    requests[0].reject(error)
    await settle()
    expect(onError).toHaveBeenCalledExactlyOnceWith({ id: 'sentence-1', version: 1, text: 'Failed.' }, error)
    expect(onResult).not.toHaveBeenCalled()
    expect(state.sentences[0].status).toBe('idle')
    requests[1].resolve({ status: 'clean' })
    await settle()
    state = updateSentenceDocument(state, '  Failed. Next.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    expect(check).toHaveBeenCalledTimes(2)
    state = updateSentenceDocument(state, '  Changed. Next.')
    queue.update(state)
    await vi.advanceTimersByTimeAsync(400)
    expect(check).toHaveBeenCalledTimes(3)
    expect(check.mock.calls[2][0].version).toBe(2)
  })

  it('releases the slot if a checker throws synchronously', async () => {
    const onError = vi.fn()
    const check = vi.fn((_sentence: SentenceCheck): Promise<SentenceCheckResult> => {
      throw new Error('Synchronous failure')
    })
    const queue = createSentenceQueue({ check, onResult: vi.fn(), onError })
    queue.update(createSentenceDocument('First. Second.'))
    await vi.advanceTimersByTimeAsync(400)
    expect(check).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(2)
    expect(queue.getSnapshot().active).toBeNull()
  })

  it('drains a long queue of synchronous failures without recursive stack growth', async () => {
    const onError = vi.fn()
    const queue = createSentenceQueue({
      check: () => { throw new Error('Synchronous failure') },
      onResult: vi.fn(),
      onError,
    })
    queue.update(createSentenceDocument('Same. '.repeat(2000)))
    await vi.advanceTimersByTimeAsync(400)
    expect(onError).toHaveBeenCalledTimes(2000)
    expect(queue.getSnapshot().active).toBeNull()
    expect(queue.getSnapshot().pending).toEqual([])
  })

  it('dispose cancels debounce and ignores subsequent updates', async () => {
    const { queue, check } = harness()
    const state = createSentenceDocument('First.')
    queue.update(state)
    queue.dispose()
    queue.dispose()
    queue.update(state)
    await vi.advanceTimersByTimeAsync(1000)
    expect(check).not.toHaveBeenCalled()
    expect(queue.getSnapshot()).toEqual({ pending: [], active: null, debouncing: false })
  })

  it.each(['resolve', 'reject'] as const)('dispose silences an active request that will %s', async (outcome) => {
    const { queue, check, requests, onResult, onError } = harness()
    queue.update(createSentenceDocument('First. Second.'))
    await vi.advanceTimersByTimeAsync(400)
    queue.dispose()
    expect(queue.getSnapshot().active?.id).toBe('sentence-1')
    if (outcome === 'resolve') requests[0].resolve({ status: 'clean' })
    else requests[0].reject(new Error('Unavailable'))
    await settle()
    expect(check).toHaveBeenCalledTimes(1)
    expect(onResult).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(queue.getSnapshot()).toEqual({ pending: [], active: null, debouncing: false })
  })
})
