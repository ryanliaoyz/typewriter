export type DocumentEdit = {
  /** Half-open replacement range in the previous text, in UTF-16 code units. */
  readonly start: number
  readonly end: number
  readonly insertedText: string
}

export type DocumentState = {
  readonly text: string
  /** The latest transition, not an edit history; null when no text changed. */
  readonly edit: DocumentEdit | null
}

export function createDocument(text = ''): DocumentState {
  return { text, edit: null }
}

function splitsSurrogatePair(text: string, offset: number): boolean {
  const before = text.charCodeAt(offset - 1)
  const after = text.charCodeAt(offset)
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
}

/** Infer one contiguous replacement from editor snapshots, without normalizing text. */
export function updateDocument(previous: DocumentState, text: string): DocumentState {
  if (previous.text === text) {
    return { text, edit: null }
  }

  let start = 0
  while (
    start < previous.text.length &&
    start < text.length &&
    previous.text[start] === text[start]
  ) {
    start += 1
  }

  // Keep intact Unicode characters within the replacement, while retaining UTF-16 offsets.
  if (splitsSurrogatePair(previous.text, start) || splitsSurrogatePair(text, start)) {
    start -= 1
  }

  let end = previous.text.length
  let nextEnd = text.length
  while (end > start && nextEnd > start && previous.text[end - 1] === text[nextEnd - 1]) {
    end -= 1
    nextEnd -= 1
  }

  if (splitsSurrogatePair(previous.text, end) || splitsSurrogatePair(text, nextEnd)) {
    end += 1
    nextEnd += 1
  }

  return { text, edit: { start, end, insertedText: text.slice(start, nextEnd) } }
}
