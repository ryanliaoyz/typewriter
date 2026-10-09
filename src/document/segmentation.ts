export type SentenceSegment = {
  /** Half-open content range in the canonical text, in UTF-16 code units. */
  readonly start: number
  readonly end: number
  /** Exact content slice, excluding surrounding document whitespace. */
  readonly text: string
  readonly complete: boolean
}

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
const terminalPunctuation = /[.!?][\p{Pe}\p{Pf}"']*$/u
const trailingEllipsis = /(?:\.{2,}|…)[\p{Pe}\p{Pf}"']*$/u
const proseContent = /[\p{L}\p{N}]/u

/** A scheduling policy, not a guarantee that punctuation ends a real sentence. */
export function isSentenceComplete(text: string): boolean {
  const content = text.trim()
  return proseContent.test(content) &&
    terminalPunctuation.test(content) &&
    !trailingEllipsis.test(content)
}

/** Derive occurrences without changing canonical text or repairing native boundaries. */
export function segmentSentences(text: string): SentenceSegment[] {
  const sentences: SentenceSegment[] = []

  for (const { segment, index } of segmenter.segment(text)) {
    const content = segment.trim()
    if (content.length === 0) {
      continue
    }

    const start = index + segment.length - segment.trimStart().length
    sentences.push({
      start,
      end: start + content.length,
      text: content,
      complete: isSentenceComplete(content),
    })
  }

  return sentences
}
