// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { cacheSentenceResult, createSentenceDocument, updateSentenceDocument } from './sentences'
import type { SentenceCheckResult, SentenceDocumentState } from './sentences'
import { segmentSentences } from './segmentation'

function expectValidRanges(state: SentenceDocumentState): void {
  expect(state.sentences.map(({ start, end, text, complete }) => ({
    start, end, text, complete,
  }))).toEqual(segmentSentences(state.document.text))
}

describe('caching successful sentence results', () => {
  it('marks only the checked duplicate clean without retaining response text', () => {
    const previous = createSentenceDocument('It worked. It worked.')
    const next = cacheSentenceResult(previous, previous.sentences[1], { status: 'clean' })

    expect(next.sentences[0]).toBe(previous.sentences[0])
    expect(next.sentences[1]).toEqual({ ...previous.sentences[1], status: 'clean' })
    expect(next.sentences[1]).not.toHaveProperty('suggestion')
    expect(next.document).toBe(previous.document)
    expect(next.nextSentenceId).toBe(previous.nextSentenceId)
    expect(previous.sentences[1].status).toBe('idle')
  })

  it('stores a suggestion without rewriting text or the latest edit', () => {
    const previous = updateSentenceDocument(createSentenceDocument('They works'), 'They works.  ')
    const next = cacheSentenceResult(previous, previous.sentences[0], {
      status: 'suggestion', suggestion: 'They work.',
    })

    expect(next.sentences[0]).toEqual({
      ...previous.sentences[0], status: 'suggestion', suggestion: 'They work.',
    })
    expect(next.document).toBe(previous.document)
    expect(next.document.text).toBe('They works.  ')
    expectValidRanges(next)
  })

  it('replaces results rather than retaining an old suggestion on a clean record', () => {
    const initial = createSentenceDocument('They works.')
    const checked = initial.sentences[0]
    const suggested = cacheSentenceResult(initial, checked, {
      status: 'suggestion', suggestion: 'They work.',
    })
    const clean = cacheSentenceResult(suggested, checked, { status: 'clean' })

    expect(clean.sentences[0]).toEqual({ ...checked, status: 'clean' })
    expect(clean.sentences[0]).not.toHaveProperty('suggestion')
    expect(suggested.sentences[0].suggestion).toBe('They work.')
  })

  it('uses current offsets when an otherwise unchanged checked occurrence moves', () => {
    const initial = createSentenceDocument('Before. They works.')
    const checked = initial.sentences[1]
    const moved = updateSentenceDocument(initial, 'A longer opening. They works.')
    const next = cacheSentenceResult(moved, checked, { status: 'clean' })

    expect(next.sentences[1]).toEqual({ ...moved.sentences[1], status: 'clean' })
    expect(next.sentences[1].start).not.toBe(checked.start)
    expect(next.document).toBe(moved.document)
    expectValidRanges(next)
  })

  it('ignores results for unknown IDs, mismatched versions, or mismatched input text', () => {
    const state = createSentenceDocument('They works.')
    const checked = state.sentences[0]
    for (const target of [
      { ...checked, id: 'missing' },
      { ...checked, version: checked.version + 1 },
      { ...checked, text: 'Different.' },
    ]) {
      expect(cacheSentenceResult(state, target, { status: 'clean' })).toBe(state)
    }
  })

  it('does not resurrect results after edits, reversion, deletion, or splitting', () => {
    const initial = createSentenceDocument('Cats sleep and dogs play.')
    const checked = initial.sentences[0]
    const edited = updateSentenceDocument(initial, 'Cats sleep and dogs run.')
    const reverted = updateSentenceDocument(edited, checked.text)
    const deleted = updateSentenceDocument(initial, '')
    const rewritten = updateSentenceDocument(deleted, checked.text)
    const split = updateSentenceDocument(initial, 'Cats sleep. Dogs play.')

    for (const state of [edited, reverted, deleted, rewritten, split]) {
      expect(cacheSentenceResult(state, checked, { status: 'clean' })).toBe(state)
    }
  })

  it('does not mutate frozen state while caching and invalidating a result', () => {
    const initial = createSentenceDocument('They works. Next.')
    Object.freeze(initial.document)
    initial.sentences.forEach(Object.freeze)
    Object.freeze(initial.sentences)
    Object.freeze(initial)
    const result = Object.freeze({ status: 'suggestion', suggestion: 'They work.' } as const)
    const cached = cacheSentenceResult(initial, initial.sentences[0], result)
    cached.sentences.forEach(Object.freeze)
    Object.freeze(cached.sentences)
    Object.freeze(cached)
    const edited = updateSentenceDocument(cached, 'They worked. Next.')

    expect(initial).toEqual(createSentenceDocument('They works. Next.'))
    expect(cached.sentences[0]).toMatchObject(result)
    expect(edited.sentences[0]).toMatchObject({ status: 'idle', version: 2 })
    expect(edited.sentences[0]).not.toHaveProperty('suggestion')
    expect(edited.sentences[1]).toEqual({ ...initial.sentences[1], start: 13, end: 18 })
  })
})

describe.each<SentenceCheckResult>([
  { status: 'clean' },
  { status: 'suggestion', suggestion: 'They work.' },
])('retaining and invalidating $status records', (result) => {
  function createCachedDocument(text = 'Before. They works. They works. After.') {
    const state = createSentenceDocument(text)
    return cacheSentenceResult(state, state.sentences[1], result)
  }

  it('keeps the sentence array and cached results on unchanged input', () => {
    const previous = createCachedDocument()
    const next = updateSentenceDocument(previous, previous.document.text)

    expect(next.sentences).toBe(previous.sentences)
  })

  it.each([
    'A longer opening. They works. They works. After.',
    'Inserted. Before. They works. They works. After.',
    'Before. Inserted. They works. They works. After.',
    'Before. They works. They works. Inserted. After.',
    'They works. They works. After.',
    'Before. They works. After.',
    '\tBefore.\n They works.  They works.\nAfter.  ',
  ])('retains the result after unrelated edits: %j', (text) => {
    const previous = createCachedDocument()
    const checked = previous.sentences[1]
    const next = updateSentenceDocument(previous, text)
    const retained = next.sentences.find(({ id }) => id === checked.id)!

    expect(retained).toEqual({ ...checked, start: retained.start, end: retained.end })
    expect(retained).toMatchObject(result)
    expectValidRanges(next)
    expect(next.document.text).toBe(text)
  })

  it('does not invalidate the cached duplicate when the other occurrence changes', () => {
    const previous = createCachedDocument()
    const next = updateSentenceDocument(previous, 'Before. They works. They worked. After.')

    expect(next.sentences[1]).toBe(previous.sentences[1])
    expect(next.sentences[2]).toMatchObject({
      id: previous.sentences[2].id, status: 'idle', version: 2,
    })
  })

  it.each([
    'They worked.',
    'They\t works.',
    'They works!',
  ])('invalidates a content change to %j and leaves the other duplicate alone', (replacement) => {
    const previous = createCachedDocument()
    const next = updateSentenceDocument(previous, `Before. ${replacement} They works. After.`)

    expect(next.sentences[1]).toMatchObject({
      id: previous.sentences[1].id, version: 2, status: 'idle', text: replacement,
    })
    expect(next.sentences[2]).toMatchObject({
      id: previous.sentences[2].id, version: 1, status: 'idle',
    })
    expect(next.sentences[1]).not.toHaveProperty('suggestion')
    expect(next.sentences[1].status).toBe('idle')
    expectValidRanges(next)
  })

  it('invalidates an incomplete trailing sentence and does not reuse a result after reversion', () => {
    const previous = createCachedDocument('Before. They works.')
    const incomplete = updateSentenceDocument(previous, 'Before. They works')
    const reverted = updateSentenceDocument(incomplete, previous.document.text)

    expect(incomplete.sentences[1]).toMatchObject({
      id: previous.sentences[1].id, version: 2, status: 'idle', complete: false,
    })
    expect(reverted.sentences[1]).toMatchObject({
      id: previous.sentences[1].id, version: 3, status: 'idle', complete: true,
    })
    expect(incomplete.sentences[1]).not.toHaveProperty('suggestion')
    expect(reverted.sentences[1]).not.toHaveProperty('suggestion')
  })

  it('retires deleted cached records rather than reusing results for new text', () => {
    const previous = createCachedDocument('Before. They works. After.')
    const deleted = updateSentenceDocument(previous, 'Before. After.')
    const reinserted = updateSentenceDocument(deleted, previous.document.text)

    expect(deleted.sentences.some(({ id }) => id === previous.sentences[1].id)).toBe(false)
    expect(reinserted.sentences[1].id).not.toBe(previous.sentences[1].id)
    expect(reinserted.sentences[1].status).toBe('idle')
    expect(reinserted.sentences[1]).not.toHaveProperty('suggestion')
  })

  it.each([
    ['Before. Cats sleep and dogs play. After.', 'Before. Cats sleep. Dogs play. After.'],
    ['Before. Cats sleep. Dogs play. After.', 'Before. Cats sleep and dogs play. After.'],
    ['Before. First cat. Middle. Last cat. After.', 'Before. First dog. Middle. Last dog. After.'],
  ])('resets split, merged, or ambiguous records while retaining anchors: %j', (before, after) => {
    let previous = createSentenceDocument(before)
    for (const record of previous.sentences) {
      previous = cacheSentenceResult(previous, record, result)
    }
    const next = updateSentenceDocument(previous, after)
    const last = next.sentences[next.sentences.length - 1]

    expect(next.sentences[0]).toBe(previous.sentences[0])
    expect(last).toEqual({
      ...previous.sentences[previous.sentences.length - 1], start: last.start, end: last.end,
    })
    for (const record of next.sentences.slice(1, -1)) {
      expect(previous.sentences.some(({ id }) => id === record.id)).toBe(false)
      expect(record.status).toBe('idle')
      expect(record.version).toBe(1)
      expect(record).not.toHaveProperty('suggestion')
    }
    expectValidRanges(next)
  })
})
