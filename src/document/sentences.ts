import { createDocument, updateDocument } from './document'
import type { DocumentEdit, DocumentState } from './document'
import { segmentSentences } from './segmentation'
import type { SentenceSegment } from './segmentation'

/** Successful results only; scheduling and failures are separate concerns. */
export type SentenceCheckResult =
  | { readonly status: 'clean', readonly suggestion?: never }
  | { readonly status: 'suggestion', readonly suggestion: string }

export type SentenceRecord = SentenceSegment & {
  readonly id: string
  readonly version: number
} & (SentenceCheckResult | { readonly status: 'idle' | 'rejected', readonly suggestion?: never })

export type SuggestionCapture = Pick<SentenceRecord, 'id' | 'version' | 'text'> & {
  readonly suggestion: string
}

function currentSuggestion(state: SentenceDocumentState, capture: SuggestionCapture) {
  return state.sentences.find((record) => record.id === capture.id &&
    record.version === capture.version && record.text === capture.text &&
    record.status === 'suggestion' && record.suggestion === capture.suggestion &&
    state.document.text.slice(record.start, record.end) === record.text)
}

/** Apply the displayed suggestion using its occurrence's current range. */
export function acceptSentenceSuggestion(
  previous: SentenceDocumentState,
  capture: SuggestionCapture,
): SentenceDocumentState {
  const record = currentSuggestion(previous, capture)
  if (!record) return previous
  const edit = { start: record.start, end: record.end, insertedText: capture.suggestion }
  const text = previous.document.text.slice(0, edit.start) + edit.insertedText + previous.document.text.slice(edit.end)
  return reconcileDocument(previous, { text, edit })
}

/** Suppress this version without treating it as a model-verified clean result. */
export function rejectSentenceSuggestion(
  previous: SentenceDocumentState,
  capture: SuggestionCapture,
): SentenceDocumentState {
  const record = currentSuggestion(previous, capture)
  if (!record) return previous
  const { suggestion: _suggestion, ...rest } = record
  return { ...previous, sentences: previous.sentences.map((sentence) =>
    sentence === record ? { ...rest, status: 'rejected' } : sentence) }
}

export type SentenceDocumentState = {
  readonly document: DocumentState
  readonly sentences: readonly SentenceRecord[]
  /** Session-local allocation; deleted IDs are never reused. */
  readonly nextSentenceId: number
}

function createRecord(segment: SentenceSegment, id: number): SentenceRecord {
  return { ...segment, id: `sentence-${id}`, version: 1, status: 'idle' }
}

function moveRecord(record: SentenceRecord, segment: SentenceSegment): SentenceRecord {
  return record.start === segment.start ? record : { ...record, ...segment }
}

export function createSentenceDocument(text = ''): SentenceDocumentState {
  const segments = segmentSentences(text)
  return {
    document: createDocument(text),
    sentences: segments.map((segment, index) => createRecord(segment, index + 1)),
    nextSentenceId: segments.length + 1,
  }
}

/** Cache a classified successful result without changing canonical document text. */
export function cacheSentenceResult(
  previous: SentenceDocumentState,
  checked: Pick<SentenceRecord, 'id' | 'version' | 'text'>,
  result: SentenceCheckResult,
): SentenceDocumentState {
  const index = previous.sentences.findIndex((record) => record.id === checked.id)
  const record = previous.sentences[index]
  if (!record || record.version !== checked.version || record.text !== checked.text) {
    return previous
  }

  // Build from current occurrence data, not captured offsets or previous results.
  const { id, version, start, end, text, complete } = record
  const sentences = [...previous.sentences]
  sentences[index] = { id, version, start, end, text, complete, ...result }
  return { ...previous, sentences }
}

/** Map untouched content only. Native segmentation can still change its boundaries. */
function unchangedStart(record: SentenceRecord, edit: DocumentEdit): number | null {
  if (record.end <= edit.start) {
    return record.start
  }
  if (record.start >= edit.end) {
    return record.start + edit.insertedText.length - (edit.end - edit.start)
  }
  return null
}

/** Reconcile occurrences using an exact edit when supplied, otherwise infer it. */
export function updateSentenceDocument(
  previous: SentenceDocumentState,
  text: string,
  edit?: DocumentEdit,
): SentenceDocumentState {
  const document = edit ? { text, edit } : updateDocument(previous.document, text)
  return reconcileDocument(previous, document)
}

function reconcileDocument(previous: SentenceDocumentState, document: DocumentState): SentenceDocumentState {
  const { text } = document
  const edit = document.edit
  if (edit === null) {
    return { ...previous, document }
  }

  const segments = segmentSentences(text)
  // If every content slice is unchanged in occurrence order, only document gaps
  // changed. This also handles a broad snapshot edit enclosing several whitespace
  // changes without matching duplicates to arbitrary occurrences by string.
  if (
    segments.length === previous.sentences.length &&
    segments.every((segment, index) => segment.text === previous.sentences[index].text)
  ) {
    return {
      document,
      sentences: segments.map((segment, index) => moveRecord(previous.sentences[index], segment)),
      nextSentenceId: previous.nextSentenceId,
    }
  }

  const byStart = new Map(segments.map((segment, index) => [segment.start, index]))
  const anchors: { oldIndex: number, newIndex: number }[] = []

  previous.sentences.forEach((record, oldIndex) => {
    const start = unchangedStart(record, edit)
    if (start === null) {
      return
    }
    const newIndex = byStart.get(start)
    if (newIndex === undefined) {
      return
    }
    const segment = segments[newIndex]
    if (segment.end === start + record.text.length && segment.text === record.text) {
      anchors.push({ oldIndex, newIndex })
    }
  })

  const sentences: SentenceRecord[] = []
  let nextSentenceId = previous.nextSentenceId
  let oldCursor = 0
  let newCursor = 0

  // Unchanged positional anchors bound the edited neighborhood. Only an unambiguous
  // one-to-one gap inherits an ID; splits, merges, and many-to-many edits retire IDs.
  function appendGap(oldEnd: number, newEnd: number): void {
    if (oldEnd - oldCursor === 1 && newEnd - newCursor === 1) {
      const record = previous.sentences[oldCursor]
      const segment = segments[newCursor]
      sentences.push(record.text === segment.text ? moveRecord(record, segment) : {
        ...segment,
        id: record.id,
        version: record.version + 1,
        status: 'idle',
      })
    } else {
      for (let index = newCursor; index < newEnd; index += 1) {
        sentences.push(createRecord(segments[index], nextSentenceId))
        nextSentenceId += 1
      }
    }
  }

  for (const { oldIndex, newIndex } of anchors) {
    appendGap(oldIndex, newIndex)
    const record = previous.sentences[oldIndex]
    const segment = segments[newIndex]
    sentences.push(moveRecord(record, segment))
    oldCursor = oldIndex + 1
    newCursor = newIndex + 1
  }
  appendGap(previous.sentences.length, segments.length)

  return { document, sentences, nextSentenceId }
}
