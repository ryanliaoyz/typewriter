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
function correctedText(value: unknown, input: string): string {
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
  const commentary = /^\s*(?:#{1,6}\s*|\*{1,2})?(?:correction|corrected (?:text|sentence|version)|changes made|explanation|here(?:'s| is) (?:the|your) corrected)[\s:*]/im
  const list = /^\s*(?:\d+[.)]|[-*])\s+/m
  if ((commentary.test(content) && !commentary.test(input)) || (list.test(content) && !list.test(input))) {
    throw new UnusableResponseError(value, 'The response adds commentary or a change list instead of only corrected text.')
  }
  return content.trim()
}

/** Runtime-specific HTTP stays outside the editor and scheduling logic. */
export function createOllamaChecker({ model, serverUrl, signal }: OllamaOptions) {
  async function request(text: string): Promise<string> {
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
          reasoning_effort: 'none',
        }),
      })
      if (!response.ok) throw new Error(`Ollama request failed (HTTP ${response.status}). Check the server and model name.`)
      return correctedText(await response.json(), text)
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

  return async ({ text }: SentenceCheck): Promise<SentenceCheckResult> => {
    const corrected = await request(text)
    if (corrected === text) return { status: 'clean' }
    const verified = await request(corrected)
    if (verified !== corrected) {
      throw new UnusableResponseError(
        { input: text, candidate: corrected, verification: verified },
        'The model changed its own correction on verification. No intermediate suggestion was saved.',
      )
    }
    return { status: 'suggestion', suggestion: corrected }
  }
}
