// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import actualPrompt from '../../prompt.txt?raw'
import { createOllamaChecker, MAX_EDIT_PASSES, REQUEST_TIMEOUT_MS } from './ollama'

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
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response('  They work.\n')))
    vi.stubGlobal('fetch', fetch)

    expect(await createOllamaChecker(options)(sentence)).toEqual({ status: 'suggestion', suggestion: 'They work.' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/ollama/v1/chat/completions')
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual({
      model: 'test-model', stream: false, temperature: 0, max_tokens: 2048,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: actualPrompt },
        { role: 'user', content: sentence.text },
      ],
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[1][1].body).messages[1].content).toBe('They work.')
  })

  it('classifies identical text as clean without storing another copy', async () => {
    const fetch = vi.fn().mockResolvedValue(response(`\n${sentence.text}  `))
    vi.stubGlobal('fetch', fetch)
    expect(await createOllamaChecker(options)(sentence)).toEqual({ status: 'clean' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not reject labels already present in the original prose', async () => {
    const text = 'Correction: They work.'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(text)))
    expect(await createOllamaChecker(options)({ ...sentence, text })).toEqual({ status: 'clean' })
  })

  it('supports direct server URLs and preserves internal whitespace and Unicode', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response('😀 They\twork.\nNext line.')))
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

  it.each(['They work.\n\n**Correction:**\nThey work.\n\n**Changes made:**\n1. Fixed grammar.', 'Corrected sentence: They work.'])('rejects added commentary: %s', async (content) => {
    const fetch = vi.fn().mockResolvedValue(response(content))
    vi.stubGlobal('fetch', fetch)
    await expect(createOllamaChecker(options)(sentence)).rejects.toMatchObject({ details: expect.stringContaining('commentary') })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refines each candidate until stable and returns only the final suggestion', async () => {
    const text = 'They is able to work.'
    const fetch = vi.fn().mockResolvedValueOnce(response('They are able to work.'))
      .mockResolvedValueOnce(response('They can work.')).mockResolvedValueOnce(response('They can work.'))
    vi.stubGlobal('fetch', fetch)
    await expect(createOllamaChecker(options)({ ...sentence, text })).resolves.toEqual({
      status: 'suggestion', suggestion: 'They can work.',
    })
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body).messages[1].content)).toEqual([
      text, 'They are able to work.', 'They can work.',
    ])
  })

  it.each([
    ['They work.', sentence.text],
    ['They work.', 'They do work.', 'They work.'],
  ])('stops a cycle with its trace instead of publishing a result: %j', async (...outputs) => {
    const fetch = vi.fn()
    for (const text of outputs) fetch.mockResolvedValueOnce(response(text))
    vi.stubGlobal('fetch', fetch)
    await expect(createOllamaChecker(options)(sentence)).rejects.toMatchObject({
      message: expect.stringContaining('cycle'),
      details: expect.stringContaining(JSON.stringify({ input: sentence.text, passes: outputs }, null, 2)),
    })
    expect(fetch).toHaveBeenCalledTimes(outputs.length)
  })

  it('stops non-repeating edits at the pass limit', async () => {
    const fetch = vi.fn()
    for (let pass = 1; pass <= MAX_EDIT_PASSES; pass += 1) {
      fetch.mockResolvedValueOnce(response(`Revision ${pass}.`))
    }
    vi.stubGlobal('fetch', fetch)
    await expect(createOllamaChecker(options)(sentence)).rejects.toThrow(`did not stabilize within ${MAX_EDIT_PASSES} passes`)
    expect(fetch).toHaveBeenCalledTimes(MAX_EDIT_PASSES)
  })

  it('allows convergence on the final permitted pass', async () => {
    const fetch = vi.fn()
    for (let pass = 1; pass < MAX_EDIT_PASSES; pass += 1) {
      fetch.mockResolvedValueOnce(response(`Revision ${pass}.`))
    }
    const final = `Revision ${MAX_EDIT_PASSES - 1}.`
    fetch.mockResolvedValueOnce(response(final))
    vi.stubGlobal('fetch', fetch)
    await expect(createOllamaChecker(options)(sentence)).resolves.toEqual({ status: 'suggestion', suggestion: final })
    expect(fetch).toHaveBeenCalledTimes(MAX_EDIT_PASSES)
  })

  it('does not start another pass after disposal even if an active fetch resolves', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementationOnce(async () => {
      controller.abort()
      return response('They work.')
    })
    vi.stubGlobal('fetch', fetch)
    await expect(createOllamaChecker({ ...options, signal: controller.signal })(sentence)).rejects.toThrow('abort')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('propagates refinement failure instead of saving a partial success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('They work.')).mockRejectedValueOnce(new Error('offline')))
    await expect(createOllamaChecker(options)(sentence)).rejects.toThrow('offline')
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
