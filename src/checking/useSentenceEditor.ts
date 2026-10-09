import { useEffect, useRef, useState } from 'react'
import { cacheSentenceResult, createSentenceDocument, updateSentenceDocument } from '../document/sentences'
import type { SentenceDocumentState } from '../document/sentences'
import { readModelConfig } from './config'
import { createOllamaChecker } from './ollama'
import { createSentenceQueue } from './queue'
import type { SentenceCheck } from './queue'

type Failure = { readonly sentence: SentenceCheck, readonly message: string }

function isCurrent(state: SentenceDocumentState, checked: SentenceCheck): boolean {
  return state.sentences.some((record) => record.id === checked.id &&
    record.version === checked.version && record.text === checked.text)
}

/** Own one document session and queue; publish transitions before more work runs. */
export function useSentenceEditor() {
  const [state, setState] = useState(() => createSentenceDocument())
  const [failure, setFailure] = useState<Failure | null>(null)
  const current = useRef(state)
  const queue = useRef<ReturnType<typeof createSentenceQueue> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const config = readModelConfig({
      VITE_OLLAMA_MODEL: import.meta.env.VITE_OLLAMA_MODEL,
      VITE_OLLAMA_SERVER_URL: import.meta.env.VITE_OLLAMA_SERVER_URL,
    }, import.meta.env.DEV)
    const sessionQueue = createSentenceQueue({
      check: createOllamaChecker({ model: config.model, serverUrl: config.requestUrl, signal: controller.signal }),
      onResult: (sentence, result) => {
        const next = cacheSentenceResult(current.current, sentence, result)
        current.current = next
        setState(next)
        sessionQueue.update(next)
      },
      onError: (sentence, error) => {
        if (isCurrent(current.current, sentence)) {
          setFailure({ sentence, message: error instanceof Error ? error.message : 'Ollama check failed.' })
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
    const next = updateSentenceDocument(current.current, text)
    current.current = next
    setState(next)
    queue.current?.update(next)
  }

  return { state, updateText, error: failure && isCurrent(state, failure.sentence) ? failure.message : null }
}
