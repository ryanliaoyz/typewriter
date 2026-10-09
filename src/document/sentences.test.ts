// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createSentenceDocument, updateSentenceDocument } from './sentences'
import type { SentenceDocumentState } from './sentences'
import { segmentSentences } from './segmentation'

function expectValidState(state: SentenceDocumentState): void {
  expect(state.sentences.map(({ start, end, text, complete }) => ({
    start, end, text, complete,
  }))).toEqual(segmentSentences(state.document.text))
  expect(new Set(state.sentences.map(({ id }) => id)).size).toBe(state.sentences.length)
  for (const record of state.sentences) {
    expect(state.document.text.slice(record.start, record.end)).toBe(record.text)
    expect(record.version).toBeGreaterThanOrEqual(1)
    expect(record.status).toBe('idle')
  }
}

describe('sentence document state', () => {
  it('initializes an empty document without allocating IDs', () => {
    expect(createSentenceDocument()).toEqual({
      document: { text: '', edit: null }, sentences: [], nextSentenceId: 1,
    })
  })

  it('creates independent records for duplicate occurrences and unfinished text', () => {
    const state = createSentenceDocument('It worked. It worked. Draft')

    expect(state.sentences.map(({ id, version, complete }) => ({ id, version, complete })))
      .toEqual([
        { id: 'sentence-1', version: 1, complete: true },
        { id: 'sentence-2', version: 1, complete: true },
        { id: 'sentence-3', version: 1, complete: false },
      ])
    expect(state.nextSentenceId).toBe(4)
    expectValidState(state)
  })

  it.each([0, 1])('edits duplicate occurrence %i without changing the other ID', (index) => {
    const previous = createSentenceDocument('It worked. It worked.')
    const text = index === 0 ? 'It failed. It worked.' : 'It worked. It failed.'
    const next = updateSentenceDocument(previous, text)

    expect(next.sentences[index]).toMatchObject({
      id: previous.sentences[index].id, version: 2, text: 'It failed.',
    })
    expect(next.sentences[1 - index]).toBe(previous.sentences[1 - index])
    expect(next.nextSentenceId).toBe(previous.nextSentenceId)
    expectValidState(next)
  })

  it('keeps the following duplicate IDs when an earlier edit shifts their offsets', () => {
    const previous = createSentenceDocument('First. It worked. It worked.')
    const next = updateSentenceDocument(previous, 'A longer first. It worked. It worked.')

    expect(next.sentences.map(({ id, version }) => ({ id, version }))).toEqual([
      { id: 'sentence-1', version: 2 },
      { id: 'sentence-2', version: 1 },
      { id: 'sentence-3', version: 1 },
    ])
    expect(next.sentences[1].start).toBe(16)
    expect(next.sentences[2].start).toBe(27)
    expectValidState(next)
  })

  it.each([
    { name: 'before', text: 'Inserted. First. Last.', ids: ['sentence-3', 'sentence-1', 'sentence-2'] },
    { name: 'between', text: 'First. Inserted. Last.', ids: ['sentence-1', 'sentence-3', 'sentence-2'] },
    { name: 'after', text: 'First. Last. Inserted.', ids: ['sentence-1', 'sentence-2', 'sentence-3'] },
  ])('inserts a sentence $name existing records', ({ text, ids }) => {
    const previous = createSentenceDocument('First. Last.')
    const next = updateSentenceDocument(previous, text)

    expect(next.sentences.map(({ id }) => id)).toEqual(ids)
    expect(next.sentences.every(({ version }) => version === 1)).toBe(true)
    expect(next.nextSentenceId).toBe(4)
    expectValidState(next)
  })

  it.each([
    { name: 'first', text: 'Middle. Last.', ids: ['sentence-2', 'sentence-3'] },
    { name: 'middle', text: 'First. Last.', ids: ['sentence-1', 'sentence-3'] },
    { name: 'last', text: 'First. Middle.', ids: ['sentence-1', 'sentence-2'] },
  ])('deletes the $name sentence without reassigning survivors', ({ text, ids }) => {
    const previous = createSentenceDocument('First. Middle. Last.')
    const next = updateSentenceDocument(previous, text)

    expect(next.sentences.map(({ id }) => id)).toEqual(ids)
    expect(next.sentences.every(({ version }) => version === 1)).toBe(true)
    expect(next.nextSentenceId).toBe(previous.nextSentenceId)
    expectValidState(next)
  })

  it('retires the original ID when a sentence splits, preserving its neighbors', () => {
    const previous = createSentenceDocument('Before. Cats sleep and dogs play. After.')
    const next = updateSentenceDocument(previous, 'Before. Cats sleep. Dogs play. After.')

    expect(next.sentences.map(({ id }) => id)).toEqual([
      'sentence-1', 'sentence-4', 'sentence-5', 'sentence-3',
    ])
    expect(next.sentences.every(({ version }) => version === 1)).toBe(true)
    expect(next.sentences[0]).toBe(previous.sentences[0])
    expectValidState(next)
  })

  it('retires both original IDs when sentences merge, preserving their neighbors', () => {
    const previous = createSentenceDocument('Before. Cats sleep. Dogs play. After.')
    const next = updateSentenceDocument(previous, 'Before. Cats sleep and dogs play. After.')

    expect(next.sentences.map(({ id }) => id)).toEqual([
      'sentence-1', 'sentence-5', 'sentence-4',
    ])
    expect(next.sentences.every(({ version }) => version === 1)).toBe(true)
    expectValidState(next)
  })

  it('increments versions for successive changes, including completion and reversion', () => {
    let state = createSentenceDocument('Draft')
    const id = state.sentences[0].id

    for (const [index, text] of ['Draft grows', 'Draft grows.', 'Draft'].entries()) {
      state = updateSentenceDocument(state, text)
      expect(state.sentences[0]).toMatchObject({ id, version: index + 2, text })
      expect(state.sentences[0].complete).toBe(text.endsWith('.'))
      expectValidState(state)
    }
  })

  it('reuses records on unchanged input, clearing the latest document edit', () => {
    const previous = updateSentenceDocument(createSentenceDocument('Draft'), 'Draft.')
    const next = updateSentenceDocument(previous, 'Draft.')

    expect(next.document).toEqual({ text: 'Draft.', edit: null })
    expect(next.sentences).toBe(previous.sentences)
    expect(next.nextSentenceId).toBe(previous.nextSentenceId)
  })

  it('keeps IDs and versions when only surrounding whitespace changes', () => {
    const previous = createSentenceDocument('  First. \nSecond.  ')
    const next = updateSentenceDocument(previous, '  First. \n\n\tSecond.  ')
    const padded = updateSentenceDocument(next, '\t  First. \n\n\tSecond.  \n')

    for (const state of [next, padded]) {
      expect(state.sentences.map(({ id, version }) => ({ id, version }))).toEqual([
        { id: 'sentence-1', version: 1 }, { id: 'sentence-2', version: 1 },
      ])
      expectValidState(state)
    }
    expect(padded.document.text).toBe('\t  First. \n\n\tSecond.  \n')
  })

  it('versions internal whitespace changes, unlike surrounding whitespace', () => {
    const previous = createSentenceDocument('Cats sleep. Next.')
    const next = updateSentenceDocument(previous, 'Cats\t sleep. Next.')

    expect(next.sentences[0]).toMatchObject({ id: 'sentence-1', version: 2 })
    expect(next.sentences[1]).toMatchObject({ id: 'sentence-2', version: 1 })
    expectValidState(next)
  })

  it('preserves duplicate occurrence order across multiple whitespace-only changes', () => {
    const previous = createSentenceDocument('It worked. It worked. It worked.')
    const next = updateSentenceDocument(previous, '\tIt worked.  It worked.\nIt worked.  ')

    expect(next.sentences.map(({ id, version }) => ({ id, version })))
      .toEqual(previous.sentences.map(({ id, version }) => ({ id, version })))
    expect(next.nextSentenceId).toBe(previous.nextSentenceId)
    expectValidState(next)
  })

  it('does not recycle IDs after clearing and rewriting the document', () => {
    const previous = createSentenceDocument('First. Last.')
    const empty = updateSentenceDocument(previous, '')
    const next = updateSentenceDocument(empty, 'First. Last.')

    expect(empty.sentences).toEqual([])
    expect(next.sentences.map(({ id }) => id)).toEqual(['sentence-3', 'sentence-4'])
    expectValidState(empty)
    expectValidState(next)
  })

  it('uses inferred edit positions for ambiguous insertion and deletion of duplicates', () => {
    const previous = createSentenceDocument('It worked. It worked.')
    const inserted = updateSentenceDocument(previous, 'It worked. It worked. It worked.')
    const deleted = updateSentenceDocument(inserted, 'It worked. It worked.')

    // Snapshots cannot distinguish a leading duplicate edit from a trailing one.
    expect(inserted.document.edit?.start).toBe(previous.document.text.length)
    expect(inserted.sentences.map(({ id }) => id)).toEqual([
      'sentence-1', 'sentence-2', 'sentence-3',
    ])
    expect(deleted.sentences).toEqual(previous.sentences)
    expect(deleted.nextSentenceId).toBe(4)
    expectValidState(deleted)
  })

  it('does not match reordered sentence strings to their old IDs', () => {
    const previous = createSentenceDocument('Before. Cats sleep. Dogs play. After.')
    const next = updateSentenceDocument(previous, 'Before. Dogs play. Cats sleep. After.')

    expect(next.sentences.map(({ id }) => id)).toEqual([
      'sentence-1', 'sentence-5', 'sentence-6', 'sentence-4',
    ])
    expectValidState(next)
  })

  it('resets an ambiguous many-to-many neighborhood, not its positional anchors', () => {
    const previous = createSentenceDocument('Before. First cat. Middle. Last cat. After.')
    const next = updateSentenceDocument(previous, 'Before. First dog. Middle. Last dog. After.')

    expect(next.sentences.map(({ id }) => id)).toEqual([
      'sentence-1', 'sentence-6', 'sentence-7', 'sentence-8', 'sentence-5',
    ])
    expectValidState(next)
  })

  it('uses UTF-16 offsets and preserves Unicode without normalization', () => {
    const previous = createSentenceDocument('😀 Ready. A cafe\u0301. Draft')
    const next = updateSentenceDocument(previous, '😃 Ready now. A cafe\u0301. Draft')

    expect(next.sentences[0]).toMatchObject({ id: 'sentence-1', version: 2, end: 13 })
    expect(next.sentences[1]).toMatchObject({ id: 'sentence-2', version: 1, start: 14 })
    expect(next.sentences[2]).toMatchObject({ id: 'sentence-3', version: 1, complete: false })
    expectValidState(next)
  })

  it.each([
    ['The price is 3.14 dollars. Next.', 'The price is 3.15 dollars. Next.'],
    ['Dr. Smith arrived. Next.', 'Dr. Smith arrived safely. Next.'],
    ['Use e.g. this example. Draft', 'Use e.g. another example. Draft'],
    ['Line one\nLine two', 'Line one\nLine two.'],
    ['One. Two.', 'One.Two.'],
    ['Wait...', 'Wait.'],
    ['He said, "Go." Next.', 'He said, "Stay." Next.'],
    [' \n\t', '\tDraft\n'],
  ])('follows native segmentation across edits: %j → %j', (before, after) => {
    expectValidState(updateSentenceDocument(createSentenceDocument(before), after))
  })

  it('does not mutate previous state and allocates deterministically', () => {
    const previous = createSentenceDocument('First. Last.')
    Object.freeze(previous.document)
    previous.sentences.forEach(Object.freeze)
    Object.freeze(previous.sentences)
    Object.freeze(previous)

    const next = updateSentenceDocument(previous, 'First. Inserted. Last.')
    expect(updateSentenceDocument(previous, next.document.text)).toEqual(next)
    expect(previous).toEqual(createSentenceDocument('First. Last.'))
    expectValidState(next)
  })
})
