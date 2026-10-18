import { useEffect, useRef, useState } from 'react'
import { acceptSentenceSuggestion, rejectSentenceSuggestion, cacheSentenceResult, createSentenceDocument, updateSentenceDocument } from '../document/sentences'
import type { SentenceDocumentState, SuggestionCapture } from '../document/sentences'
import { readModelConfig } from './config'
import { createOllamaChecker, UnusableResponseError } from './ollama'
import { createSentenceQueue } from './queue'
import type { SentenceCheck } from './queue'

type Failure = { readonly sentence: SentenceCheck, readonly message: string, readonly details?: string }

function isCurrent(state: SentenceDocumentState, checked: SentenceCheck): boolean {
  return state.sentences.some((record) => record.id === checked.id &&
    record.version === checked.version && record.text === checked.text)
}

/** Own one document session and queue; publish transitions before more work runs. */
export function useSentenceEditor() {
  const [state, setState] = useState(() => createSentenceDocument())
  const [failures, setFailures] = useState<readonly Failure[]>([])
  const currentFailures = useRef<readonly Failure[]>([])
  const current = useRef(state)
  const queue = useRef<ReturnType<typeof createSentenceQueue> | null>(null)

  function publishFailures(next: readonly Failure[]): void {
    currentFailures.current = next
    setFailures(next)
  }

  useEffect(() => {
    const controller = new AbortController()
    const config = readModelConfig({
      VITE_OLLAMA_MODEL: import.meta.env.VITE_OLLAMA_MODEL,
      VITE_OLLAMA_SERVER_URL: import.meta.env.VITE_OLLAMA_SERVER_URL,
    }, import.meta.env.DEV)
    const sessionQueue = createSentenceQueue({
      check: createOllamaChecker({ model: config.model, serverUrl: config.requestUrl, signal: controller.signal }),
      onResult: (sentence, result) => {
        if (!isCurrent(current.current, sentence)) return
        const next = cacheSentenceResult(current.current, sentence, result)
        current.current = next
        setState(next)
        publishFailures(currentFailures.current.filter((failure) => failure.sentence.id !== sentence.id))
        sessionQueue.update(next)
      },
      onError: (sentence, error) => {
        if (isCurrent(current.current, sentence)) {
          publishFailures([
            ...currentFailures.current.filter((failure) => failure.sentence.id !== sentence.id),
            {
              sentence,
              message: error instanceof Error ? error.message : 'Ollama check failed.',
              ...(error instanceof UnusableResponseError ? { details: error.details } : {}),
            },
          ])
        }
      },
    })
    queue.current = sessionQueue
    sessionQueue.update(current.current)
    return () => {
      sessionQueue.dispose()
      controller.abort()
      queue.current = null
    }
  }, [])

  function updateText(text: string): void {
    publish(updateSentenceDocument(current.current, text))
  }

  function publish(next: SentenceDocumentState): void {
    if (next === current.current) return
    current.current = next
    setState(next)
    publishFailures(currentFailures.current.filter((failure) => isCurrent(next, failure.sentence)))
    queue.current?.update(next)
  }

  function retry(sentence: SentenceCheck): void {
    if (!isCurrent(current.current, sentence)) return
    if (queue.current?.retry(sentence)) {
      publishFailures(currentFailures.current.filter((failure) => failure.sentence.id !== sentence.id))
    }
  }

  function accept(capture: SuggestionCapture): boolean {
    const next = acceptSentenceSuggestion(current.current, capture)
    if (next === current.current) return false
    publish(next)
    return true
  }

  function reject(capture: SuggestionCapture): boolean {
    const next = rejectSentenceSuggestion(current.current, capture)
    if (next === current.current) return false
    publish(next)
    return true
  }

  return { state, updateText, failures, retry, accept, reject }
}
