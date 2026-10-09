// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { isSentenceComplete, segmentSentences } from './segmentation'

describe('sentence completion policy', () => {
  it.each([
    'A sentence.',
    'A question?',
    'An exclamation!',
    'Really?!',
    'He said, "Go."',
    'She said, “Go!”',
    "He said, 'Go.'",
    'She said, ‘Go?’',
    'He said, «Go.»',
    '(An aside.)',
    '[An aside!]',
    'He said, “(Go.)”',
    '  A sentence. \n\t',
    'The value is 3.14.',
    '你好.',
  ])('recognizes a punctuated ending: %j', (text) => {
    expect(isSentenceComplete(text)).toBe(true)
  })

  it.each([
    '',
    ' \n\t',
    'An unfinished sentence',
    'An unfinished sentence\n',
    'A sentence; ',
    'A sentence:',
    'The value is 3.14',
    'Wait..',
    'Wait...',
    'Wait…',
    'He said, "Wait..."',
    'She said, “Wait…”',
    '(Wait...)',
    '...',
    '.',
    '?!',
    '😀!',
    'A period. followed by more text',
  ])('keeps unfinished or non-prose input incomplete: %j', (text) => {
    expect(isSentenceComplete(text)).toBe(false)
  })

  it('does not claim to distinguish terminal abbreviations from full stops', () => {
    expect(isSentenceComplete('Dr.')).toBe(true)
  })
})

describe('sentence segmentation', () => {
  it.each(['', ' ', '\n\n', ' \r\n\t\u00a0 '])(
    'omits empty and whitespace-only segments: %j', (text) => {
      expect(segmentSentences(text)).toEqual([])
    },
  )

  it('keeps completed sentences and unfinished trailing text', () => {
    expect(segmentSentences('One. Two! Last draft')).toEqual([
      { start: 0, end: 4, text: 'One.', complete: true },
      { start: 5, end: 9, text: 'Two!', complete: true },
      { start: 10, end: 20, text: 'Last draft', complete: false },
    ])
  })

  it('recognizes a completed trailing sentence without requiring whitespace', () => {
    expect(segmentSentences('Finished.')).toEqual([
      { start: 0, end: 9, text: 'Finished.', complete: true },
    ])
  })

  it('excludes surrounding whitespace from ranges without losing document whitespace', () => {
    const text = '  First. \n\tSecond!  '
    const sentences = segmentSentences(text)

    expect(sentences).toEqual([
      { start: 2, end: 8, text: 'First.', complete: true },
      { start: 11, end: 18, text: 'Second!', complete: true },
    ])
    expect(text.slice(0, sentences[0].start)).toBe('  ')
    expect(text.slice(sentences[0].end, sentences[1].start)).toBe(' \n\t')
    expect(text.slice(sentences[1].end)).toBe('  ')
  })

  it('retains duplicate occurrences at independent ranges', () => {
    expect(segmentSentences('It worked. It worked.')).toEqual([
      { start: 0, end: 10, text: 'It worked.', complete: true },
      { start: 11, end: 21, text: 'It worked.', complete: true },
    ])
  })

  it('measures offsets in UTF-16 code units, including emoji', () => {
    expect(segmentSentences('😀 Ready. Next?')).toEqual([
      { start: 0, end: 9, text: '😀 Ready.', complete: true },
      { start: 10, end: 15, text: 'Next?', complete: true },
    ])
  })

  it('does not split decimal punctuation into sentences', () => {
    expect(segmentSentences('The price is 3.14 dollars. Next.')).toEqual([
      { start: 0, end: 26, text: 'The price is 3.14 dollars.', complete: true },
      { start: 27, end: 32, text: 'Next.', complete: true },
    ])
    expect(segmentSentences('The value is 3.14')).toEqual([
      { start: 0, end: 17, text: 'The value is 3.14', complete: false },
    ])
  })

  it('keeps quoted endings inside content ranges', () => {
    expect(segmentSentences('He said, "Go." Then left.')).toEqual([
      { start: 0, end: 14, text: 'He said, "Go."', complete: true },
      { start: 15, end: 25, text: 'Then left.', complete: true },
    ])
  })

  it.each(['Wait...', 'Wait…'])('retains trailing ellipses as incomplete: %j', (text) => {
    expect(segmentSentences(text)).toEqual([
      { start: 0, end: text.length, text, complete: false },
    ])
  })

  it('does not treat a native newline boundary as completion', () => {
    expect(segmentSentences('Line one\nLine two')).toEqual([
      { start: 0, end: 8, text: 'Line one', complete: false },
      { start: 9, end: 17, text: 'Line two', complete: false },
    ])
  })

  it.each(['Dr. Smith arrived. Next.', 'Use e.g. this example. Next.', 'One.Two.'])(
    'uses native boundaries without punctuation or abbreviation overrides: %j', (text) => {
      // ICU versions may disagree about abbreviations; preserve the runtime's decision.
      const native = new Intl.Segmenter('en', { granularity: 'sentence' })
      const expected = [...native.segment(text)].map(({ segment, index }) => {
        const content = segment.trim()
        const start = index + segment.length - segment.trimStart().length
        return { start, end: start + content.length, text: content }
      })

      expect(segmentSentences(text).map(({ start, end, text: content }) => ({
        start, end, text: content,
      }))).toEqual(expected)
    },
  )

  it.each([
    '\u00a0\tHello.\r\n\r\nDraft\u00a0',
    'A cafe\u0301. Another café.',
    '😀 First!\n\n😃 Last draft',
    'A sentence with\ninternal whitespace.',
  ])('keeps exact canonical slices without Unicode or whitespace normalization: %j', (text) => {
    const sentences = segmentSentences(text)
    let cursor = 0
    let reconstructed = ''

    for (const sentence of sentences) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text)
      expect(sentence.start).toBeGreaterThanOrEqual(cursor)
      reconstructed += text.slice(cursor, sentence.start) + sentence.text
      cursor = sentence.end
    }

    reconstructed += text.slice(cursor)
    expect(reconstructed).toBe(text)
  })
})
