// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import actualPrompt from '../../prompt.txt?raw'
import { createOllamaChecker, REQUEST_TIMEOUT_MS } from './ollama'

const sentence = { id: 'sentence-1', version: 2, text: 'They works.' }
const options = { model: 'test-model', serverUrl: '/ollama/' }

function response(content: unknown, finishReason = 'stop') {
  return Response.json({ choices: [{ finish_reason: finishReason, message: { role: 'assistant', content } }] })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Ollama checker', () => {
  it('sends the actual prompt.txt and only sentence content through the chat API', async () => {
    const fetch = vi.fn().mockResolvedValue(response('  They work.\n'))
    vi.stubGlobal('fetch', fetch)

    expect(await createOllamaChecker(options)(sentence)).toEqual({ status: 'suggestion', suggestion: 'They work.' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/ollama/v1/chat/completions')
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual({
      model: 'test-model', stream: false, temperature: 0, max_tokens: 1024,
      messages: [
        { role: 'system', content: actualPrompt },
        { role: 'user', content: sentence.text },
      ],
    })
  })

  it('classifies identical text as clean without storing another copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(`\n${sentence.text}  `)))
    expect(await createOllamaChecker(options)(sentence)).toEqual({ status: 'clean' })
  })

  it('supports direct server URLs and preserves internal whitespace and Unicode', async () => {
    const fetch = vi.fn().mockResolvedValue(response('😀 They\twork.\nNext line.'))
    vi.stubGlobal('fetch', fetch)
    expect(await createOllamaChecker({ ...options, serverUrl: 'http://localhost:11434/' })(sentence)).toEqual({
      status: 'suggestion', suggestion: '😀 They\twork.\nNext line.',
    })
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions')
  })

  it.each([null, '', ' \n ', 7, {}, '...', '```text\nThey work.\n```'])('rejects unusable content %j rather than marking it clean', async (content) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(content)))
    await expect(createOllamaChecker(options)(sentence)).rejects.toThrow('unusable response')
  })

  it.each([
    {}, { choices: [] }, { choices: [null] },
    { error: 'failed', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'They work.' } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'user', content: 'They work.' } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'They work.', tool_calls: [{}] } }] },
  ])('rejects malformed chat envelopes %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
    await expect(createOllamaChecker(options)(sentence)).rejects.toThrow('unusable response')
  })

  it.each(['length', 'tool_calls', null])('rejects incomplete/unsupported completion reason %s', async (reason) => {
    const result = { choices: [{ finish_reason: reason, message: { role: 'assistant', content: sentence.text } }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)))
    await expect(createOllamaChecker(options)(sentence)).rejects.toThrow('unusable response')
  })

  it.each([404, 500])('reports HTTP %s errors', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('failure', { status })))
    await expect(createOllamaChecker(options)(sentence)).rejects.toThrow(`HTTP ${status}`)
  })

  it('reports unavailable servers and invalid JSON', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('not JSON'))
    vi.stubGlobal('fetch', fetch)
    const check = createOllamaChecker(options)
    await expect(check(sentence)).rejects.toThrow('Cannot reach Ollama')
    await expect(check(sentence)).rejects.toThrow('invalid JSON')
  })

  it('aborts a timed-out request and clears the timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const result = createOllamaChecker(options)(sentence)
    const rejection = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels active fetches on document-session disposal and removes listeners', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const result = createOllamaChecker({ ...options, signal: controller.signal })(sentence)
    const rejection = expect(result).rejects.toThrow('Aborted')
    controller.abort()
    await rejection
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })
})
