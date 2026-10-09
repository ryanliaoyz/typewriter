import type { SentenceCheckResult, SentenceDocumentState, SentenceRecord } from '../document/sentences'

export const CHECK_DEBOUNCE_MS = 400

/** Capture occurrence identity and input, never offsets that an edit can move. */
export type SentenceCheck = Pick<SentenceRecord, 'id' | 'version' | 'text'>

export type SentenceQueueSnapshot = {
  readonly pending: readonly SentenceCheck[]
  readonly active: SentenceCheck | null
  readonly debouncing: boolean
}

type SentenceQueueOptions = {
  readonly check: (sentence: SentenceCheck) => Promise<SentenceCheckResult>
  /** The owner must validate against current state, e.g. with cacheSentenceResult. */
  readonly onResult: (sentence: SentenceCheck, result: SentenceCheckResult) => void
  readonly onError: (sentence: SentenceCheck, error: unknown) => void
}

function sameCheck(left: SentenceCheck | undefined | null, right: SentenceCheck): boolean {
  return left?.id === right.id && left.version === right.version && left.text === right.text
}

function capture(record: SentenceRecord): SentenceCheck {
  return { id: record.id, version: record.version, text: record.text }
}

/**
 * One queue per document session. Feed every document/cache transition to update.
 * Results belong to the owner; this module never rewrites text or caches results.
 * Callbacks should not throw. Dispose silences callbacks but does not pretend an
 * in-flight request has finished or cancel a checker that has no abort interface.
 */
export function createSentenceQueue({ check, onResult, onError }: SentenceQueueOptions) {
  const pending = new Map<string, SentenceCheck>()
  // Only current attempted versions, not successful results or version history.
  // Prevent unchanged idle/failed records from being retried on every state update.
  const attempted = new Map<string, SentenceCheck>()
  let active: SentenceCheck | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let documentText: string | undefined
  let ready = false
  let disposed = false

  async function run(sentence: SentenceCheck): Promise<void> {
    try {
      let result: SentenceCheckResult
      try {
        result = await check(sentence)
      } catch (error) {
        if (!disposed) onError(sentence, error)
        return
      }
      if (!disposed) onResult(sentence, result)
    } finally {
      active = null
      // A synchronously throwing checker must not recurse through a long queue.
      queueMicrotask(drain)
    }
  }

  function drain(): void {
    if (disposed || !ready || active !== null) return
    const sentence = pending.values().next().value
    if (!sentence) return
    pending.delete(sentence.id)
    attempted.set(sentence.id, sentence)
    active = sentence
    void run(sentence)
  }

  function update(state: SentenceDocumentState): void {
    if (disposed) return
    const eligible = new Map(state.sentences
      .filter((record) => record.complete && record.status === 'idle')
      .map((record) => [record.id, record]))

    for (const [id, sentence] of attempted) {
      const record = eligible.get(id)
      if (!record || !sameCheck(sentence, record)) attempted.delete(id)
    }
    for (const id of pending.keys()) {
      if (!eligible.has(id)) pending.delete(id)
    }
    for (const record of eligible.values()) {
      if (sameCheck(active, record) || sameCheck(attempted.get(record.id), record)) {
        pending.delete(record.id)
      } else {
        // Map.set replaces a queued version without losing its FIFO position.
        pending.set(record.id, capture(record))
      }
    }

    if (documentText !== state.document.text) {
      documentText = state.document.text
      ready = false
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        ready = true
        drain()
      }, CHECK_DEBOUNCE_MS)
    }
    // Cache-only transitions neither reset the document debounce nor bypass it.
    drain()
  }

  function getSnapshot(): SentenceQueueSnapshot {
    return { pending: [...pending.values()], active, debouncing: timer !== undefined }
  }

  function dispose(): void {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending.clear()
    attempted.clear()
  }

  return { update, getSnapshot, dispose }
}
