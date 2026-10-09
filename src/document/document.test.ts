// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createDocument, updateDocument } from './document'

describe('canonical document state', () => {
  it('starts empty without a pending edit', () => {
    expect(createDocument()).toEqual({ text: '', edit: null })
  })

  it('preserves initial text exactly', () => {
    const text = '  A draft.\n\n\tAnother line.  '
    expect(createDocument(text)).toEqual({ text, edit: null })
  })

  it.each([
    {
      name: 'insert into an empty document',
      before: '', after: 'Hello', start: 0, end: 0, insertedText: 'Hello',
    },
    {
      name: 'insert at the beginning',
      before: 'world', after: 'Hello world', start: 0, end: 0, insertedText: 'Hello ',
    },
    {
      name: 'insert in the middle',
      before: 'Hello world', after: 'Hello kind world', start: 6, end: 6, insertedText: 'kind ',
    },
    {
      name: 'append at the end',
      before: 'Hello', after: 'Hello!', start: 5, end: 5, insertedText: '!',
    },
    {
      name: 'delete at the beginning',
      before: 'Hello world', after: 'world', start: 0, end: 6, insertedText: '',
    },
    {
      name: 'delete in the middle',
      before: 'Hello kind world', after: 'Hello world', start: 6, end: 11, insertedText: '',
    },
    {
      name: 'delete at the end',
      before: 'Hello!', after: 'Hello', start: 5, end: 6, insertedText: '',
    },
    {
      name: 'replace a range',
      before: 'The cat naps.', after: 'The dog naps.', start: 4, end: 7, insertedText: 'dog',
    },
    {
      name: 'replace the entire document',
      before: 'old', after: 'NEW', start: 0, end: 3, insertedText: 'NEW',
    },
    {
      name: 'clear the document',
      before: 'A draft.', after: '', start: 0, end: 8, insertedText: '',
    },
    {
      name: 'preserve inserted whitespace',
      before: 'A.B.', after: 'A. \n\n\tB.  ', start: 2, end: 4, insertedText: ' \n\n\tB.  ',
    },
    {
      name: 'preserve carriage returns and line feeds in the pure module',
      before: 'A\r\nB', after: 'A\r\n\tB', start: 3, end: 3, insertedText: '\t',
    },
    {
      name: 'measure offsets after emoji in UTF-16 code units',
      before: '😀 cat', after: '😀 dog', start: 3, end: 6, insertedText: 'dog',
    },
    {
      name: 'replace an emoji without splitting a shared high surrogate',
      before: 'A😀B', after: 'A😃B', start: 1, end: 3, insertedText: '😃',
    },
    {
      name: 'replace an emoji without splitting a shared low surrogate',
      before: 'A\u{1f600}B', after: 'A\u{1fa00}B', start: 1, end: 3, insertedText: '\u{1fa00}',
    },
    {
      name: 'keep combining marks without Unicode normalization',
      before: 'café', after: 'cafe\u0301', start: 3, end: 4, insertedText: 'e\u0301',
    },
    {
      name: 'edit one of two identical sentences',
      before: 'It worked. It worked.', after: 'It worked. It failed.',
      start: 14, end: 18, insertedText: 'fail',
    },
    {
      name: 'enclose multiple changed portions in one replacement',
      before: 'cat and cat', after: 'dog and dog', start: 0, end: 11, insertedText: 'dog and dog',
    },
  ])('$name', ({ before, after, start, end, insertedText }) => {
    const previous = Object.freeze(createDocument(before))
    const next = updateDocument(previous, after)

    expect(next).toEqual({ text: after, edit: { start, end, insertedText } })
    expect(before.slice(0, start) + insertedText + before.slice(end)).toBe(after)
    expect(previous).toEqual({ text: before, edit: null })
  })

  it('returns no changed range for identical input, including after an edit', () => {
    const previous = updateDocument(createDocument('draft'), 'draft!')

    expect(updateDocument(previous, 'draft!')).toEqual({ text: 'draft!', edit: null })
    expect(previous.edit).toEqual({ start: 5, end: 5, insertedText: '!' })
  })

  it('measures successive edits against the immediately previous text', () => {
    const first = updateDocument(createDocument('AB'), 'A😀B')
    const second = updateDocument(first, 'A😀!B')
    const third = updateDocument(second, 'A!B')

    expect(first.edit).toEqual({ start: 1, end: 1, insertedText: '😀' })
    expect(second.edit).toEqual({ start: 3, end: 3, insertedText: '!' })
    expect(third).toEqual({ text: 'A!B', edit: { start: 1, end: 3, insertedText: '' } })
  })
})
