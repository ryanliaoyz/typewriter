// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { acceptSentenceSuggestion as accept, rejectSentenceSuggestion as reject, cacheSentenceResult, createSentenceDocument, updateSentenceDocument } from './sentences'
import { segmentSentences } from './segmentation'

function setup(text = 'They works. They works.', suggestion = 'They work.') {
  const initial = createSentenceDocument(text)
  const capture = { ...initial.sentences[0], suggestion }
  return { state: cacheSentenceResult(initial, capture, { status: 'suggestion', suggestion }), capture }
}

describe('suggestion actions', () => {
  it('accepts at current offsets, preserving whitespace, Unicode and the other duplicate', () => {
    const { state, capture } = setup()
    const spaced = updateSentenceDocument(state, '\tThey works.  They works.\n')
    const moved = updateSentenceDocument(spaced, '😀 Opening.\n\tThey works.  They works.\n')
    const next = accept(moved, capture)
    expect(next.document.text).toBe('😀 Opening.\n\tThey work.  They works.\n')
    expect(next.sentences[1]).toMatchObject({ id: capture.id, version: 2, status: 'idle' })
    expect(next.sentences[2]).toMatchObject({ id: state.sentences[1].id, version: 1 })
    expect(accept(next, capture)).toBe(next)
    expect(state.document.text).toBe('They works. They works.')
  })

  it('uses the explicit occurrence range when accepted text repeats its neighbors', () => {
    const { state, capture } = setup('Same. Same.', 'Same. Same.')
    const next = accept(state, capture)
    expect(next.document.text).toBe('Same. Same. Same.')
    expect(next.sentences[2]).toMatchObject({ id: state.sentences[1].id, version: 1 })
    expect(next.sentences.slice(0, 2).every((record) => record.id !== capture.id && record.status === 'idle')).toBe(true)
    expect(next.sentences.map(({ start, end, text, complete }) => ({ start, end, text, complete })))
      .toEqual(segmentSentences(next.document.text))
  })

  it.each([accept, reject])('ignores stale captures and targets without suggestions', (action) => {
    const { state, capture } = setup('They works. Last.')
    for (const target of [
      { ...capture, id: 'missing' }, { ...capture, version: 99 },
      { ...capture, text: 'Other.' }, { ...capture, suggestion: 'Other.' },
    ]) expect(action(state, target)).toBe(state)
    for (const text of ['They worked. Last.', 'Last.', 'They. Works. Last.', 'They works Last.']) {
      const changed = updateSentenceDocument(state, text)
      expect(action(changed, capture)).toBe(changed)
    }
    const reverted = updateSentenceDocument(updateSentenceDocument(state, 'They work. Last.'), state.document.text)
    expect(action(reverted, capture)).toBe(reverted)
    const clean = cacheSentenceResult(state, capture, { status: 'clean' })
    expect(action(clean, capture)).toBe(clean)
  })

  it('reconciles an acceptance that merges with the following sentence', () => {
    const { state, capture } = setup('They works. Last.', 'They work')
    const next = accept(state, capture)
    expect(next.document.text).toBe('They work Last.')
    expect(next.sentences).toHaveLength(1)
    expect(next.sentences[0]).toMatchObject({ text: 'They work Last.', status: 'idle', version: 1 })
    expect(state.sentences.some((record) => record.id === next.sentences[0].id)).toBe(false)
  })

  it('rejects only one version and retains rejection through offset and whitespace changes', () => {
    const { state, capture } = setup()
    const next = reject(state, capture)
    expect(next.document).toBe(state.document)
    expect(next.sentences[0]).toMatchObject({ status: 'rejected', version: 1 })
    expect(next.sentences[0]).not.toHaveProperty('suggestion')
    expect(next.sentences[1]).toBe(state.sentences[1])
    expect(reject(next, capture)).toBe(next)
    const moved = updateSentenceDocument(next, '\n They works.\t They works. ')
    expect(moved.sentences[0]).toMatchObject({ status: 'rejected', version: 1 })
    const edited = updateSentenceDocument(moved, '\n They works!\t They works. ')
    expect(edited.sentences[0]).toMatchObject({ status: 'idle', version: 2 })
  })
})
