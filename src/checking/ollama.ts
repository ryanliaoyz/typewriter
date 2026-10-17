import prompt from '../../prompt.txt?raw'
import type { SentenceCheckResult } from '../document/sentences'
import type { SentenceCheck } from './queue'

export const REQUEST_TIMEOUT_MS = 120_000

export class UnusableResponseError extends Error {
  readonly details: string

  constructor(value: unknown, reason: string) {
    super('Ollama returned an unusable response; expected completed, corrected text.')
    this.name = 'UnusableResponseError'
    this.details = `${reason}\n\n${JSON.stringify(value, null, 2)}`
  }
}

type OllamaOptions = {
  readonly model: string
  readonly serverUrl: string
  readonly signal?: AbortSignal
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

/** Validate the chat envelope, not the linguistic quality of a proposed edit. */
function correctedText(value: unknown): string {
  const body = object(value)
  const choices = body?.choices
  const choice = Array.isArray(choices) && choices.length === 1 ? object(choices[0]) : null
  const message = object(choice?.message)
  const content = message?.content
  if (
    body?.error || choice?.finish_reason !== 'stop' || message?.role !== 'assistant' ||
    message?.tool_calls || message?.refusal || typeof content !== 'string' ||
    !/[\p{L}\p{N}]/u.test(content) || content.includes('```')
  ) {
    const reason = body?.error ? 'The server returned an error.'
      : !choice ? 'Expected exactly one response choice.'
      : choice.finish_reason !== 'stop' ? `Generation did not complete normally (finish_reason: ${JSON.stringify(choice.finish_reason)}).`
      : message?.role !== 'assistant' ? 'Expected an assistant message.'
      : message?.tool_calls || message?.refusal ? 'The response contains tool calls or a refusal.'
      : typeof content !== 'string' || !/[\p{L}\p{N}]/u.test(content) ? 'Corrected text is missing or empty.'
      : 'The response contains a code fence.'
    throw new UnusableResponseError(value, reason)
  }
  return content.trim()
}

/** Runtime-specific HTTP stays outside the editor and scheduling logic. */
export function createOllamaChecker({ model, serverUrl, signal }: OllamaOptions) {
  return async ({ text }: SentenceCheck): Promise<SentenceCheckResult> => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: text },
          ],
          stream: false,
          temperature: 0,
          max_tokens: 2048,
        }),
      })
      if (!response.ok) throw new Error(`Ollama request failed (HTTP ${response.status}). Check the server and model name.`)
      const corrected = correctedText(await response.json())
      return corrected === text ? { status: 'clean' } : { status: 'suggestion', suggestion: corrected }
    } catch (error) {
      if (timedOut) throw new Error('Ollama request timed out after 120 seconds.')
      if (controller.signal.aborted) throw error
      if (error instanceof TypeError) throw new Error('Cannot reach Ollama. Check the server URL and browser CORS settings.')
      if (error instanceof SyntaxError) throw new Error('Ollama returned invalid JSON.')
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
}
