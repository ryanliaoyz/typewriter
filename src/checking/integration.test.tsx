import { StrictMode } from 'react'
import { redo, undo } from '@codemirror/commands'
import { act, render, screen } from '@testing-library/react'
import { editorView, fireEvent, highlights, readEditor } from '../test/editor'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { SentenceDocumentState } from '../document/sentences'

function response(content: string) {
  return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] })
}

function deferred() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}

function readState(container: HTMLElement): SentenceDocumentState {
  return JSON.parse(container.querySelector('pre')!.textContent!) as SentenceDocumentState
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('DEV', true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('editor → queue → Ollama integration', () => {
  it('does not transfer an in-flight suggestion to an identical reinserted duplicate', async () => {
    const first = deferred()
    const fetch = vi.fn().mockReturnValueOnce(first.promise)
      .mockImplementation((_url, options) => response(JSON.parse(options.body).messages[1].content))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'They works. They works.' } })
    const [removed, survivor] = readState(container).sentences
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })

    // Delete the first occurrence, then insert identical text at that exact spot.
    act(() => editorView(editor).dispatch({ changes: { from: 0, to: 12 } }))
    act(() => editorView(editor).dispatch({ changes: { from: 0, insert: 'They works. ' } }))
    const [inserted, retained] = readState(container).sentences
    expect(inserted.id).not.toBe(removed.id)
    expect(inserted.id).not.toBe(survivor.id)
    expect(retained).toEqual(survivor)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(1)

    first.resolve(response('They work.'))
    await settle()
    expect(fetch.mock.calls.map(([, options]) => JSON.parse(options.body).messages[1].content))
      .toEqual(['They works.', 'They work.', 'They works.', 'They works.'])
    expect(readState(container).sentences.map(record => [record.id, record.status]))
      .toEqual([[inserted.id, 'clean'], [survivor.id, 'clean']])
    expect(highlights()).toHaveLength(0)
    expect(readEditor(editor)).toBe('They works. They works.')
  })

  it.each([
    { name: 'split', before: 'Cats sleep and dogs play.', after: 'Cats sleep. Dogs play.', pending: ['Cats sleep.', 'Dogs play.'] },
    { name: 'merge', before: 'Cats sleep. Dogs play.', after: 'Cats sleep and dogs play.', pending: ['Cats sleep and dogs play.'] },
  ])('retires $name captures during inference and checks new occurrences sequentially', async ({ before, after, pending }) => {
    const active = deferred()
    const requests: ReturnType<typeof deferred>[] = []
    const fetch = vi.fn().mockReturnValueOnce(active.promise).mockImplementation(() => {
      const request = deferred()
      requests.push(request)
      return request.promise
    })
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: `${before} Next.` } })
    const previous = readState(container).sentences
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    act(() => editorView(editor).dispatch({ changes: { from: 0, to: before.length, insert: after } }))
    const current = readState(container).sentences
    expect(current.at(-1)?.id).toBe(previous.at(-1)?.id)
    for (const record of current.slice(0, -1)) {
      expect(previous.some(old => old.id === record.id)).toBe(false)
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(1)

    // A retired occurrence's error must not attach to any new sentence.
    active.resolve(new Response('late failure', { status: 500 }))
    await settle()
    const expected = ['Next.', ...pending]
    for (const [index, text] of expected.entries()) {
      expect(fetch).toHaveBeenCalledTimes(index + 2)
      expect(JSON.parse(fetch.mock.calls[index + 1][1].body).messages[1].content).toBe(text)
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(fetch).toHaveBeenCalledTimes(index + 2)
      requests[index].resolve(response(text))
      await settle()
    }
    expect(readState(container).sentences.every(record => record.status === 'clean')).toBe(true)
    fireEvent.click(screen.getByText('Debug state'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readEditor(editor)).toBe(`${after} Next.`)
  })

  it('does not reuse an in-flight result after editing back to identical text', async () => {
    const first = deferred()
    const latest = deferred()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise)
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'They work.' } })
    const original = readState(container).sentences[0]
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.change(editor, { target: { value: 'They work!' } })
    fireEvent.change(editor, { target: { value: 'They work.' } })
    first.resolve(response('They work.'))
    await settle()
    expect(readState(container).sentences[0]).toMatchObject({ id: original.id, version: 3, status: 'idle' })
    await act(async () => { await vi.advanceTimersByTimeAsync(399) })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetch).toHaveBeenCalledTimes(2)
    latest.resolve(response('They work.'))
    await settle()
    expect(readState(container).sentences[0]).toMatchObject({ id: original.id, version: 3, status: 'clean' })
    expect(readEditor(editor)).toBe('They work.')
  })

  it('queues only the current version after acceptance and undo/redo during another check', async () => {
    // Undo scrolls the selection into view; jsdom has no text-range layout API.
    const createRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => Object.assign(createRange(), {
      getClientRects: () => [],
      getBoundingClientRect: () => new DOMRect(),
    }))
    const active = deferred()
    const fetch = vi.fn().mockResolvedValueOnce(response('They work.'))
      .mockResolvedValueOnce(response('They work.')).mockReturnValueOnce(active.promise)
      .mockImplementation((_url, options) => response(JSON.parse(options.body).messages[1].content))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'They works. Next.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    fireEvent.click(highlights()[0])
    fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion' }))
    expect(readEditor(editor)).toBe('They work. Next.')
    act(() => { expect(undo(editorView(editor))).toBe(true) })
    expect(readEditor(editor)).toBe('They works. Next.')
    expect(highlights()).toHaveLength(0)
    act(() => { expect(redo(editorView(editor))).toBe(true) })
    expect(readEditor(editor)).toBe('They work. Next.')
    expect(readState(container).document.text).toBe(readEditor(editor))
    expect(readState(container).sentences[0]).toMatchObject({ version: 4, status: 'idle' })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    active.resolve(response('Next.'))
    await settle()
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(JSON.parse(fetch.mock.calls[3][1].body).messages[1].content).toBe('They work.')
    expect(readState(container).sentences.map(record => record.status)).toEqual(['clean', 'clean'])
    expect(readState(container).sentences[0].version).toBe(4)
    expect(readState(container).document.text).toBe(readEditor(editor))
  })

  it.each(['Accept suggestion', 'Reject suggestion'])('applies %s and keeps the queue sequential', async (action) => {
    const active = deferred()
    const fetch = vi.fn().mockResolvedValueOnce(response('They work.'))
      .mockResolvedValueOnce(response('They work.')).mockReturnValueOnce(active.promise)
      .mockResolvedValue(response('They work.'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'They works. Next.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    fireEvent.click(highlights()[0])
    fireEvent.click(screen.getByRole('button', { name: action }))
    expect(screen.queryByRole('dialog', { name: 'Sentence comparison' })).not.toBeInTheDocument()
    expect(editor).toHaveFocus()
    const accepted = action === 'Accept suggestion'
    expect(readEditor(editor)).toBe(accepted ? 'They work. Next.' : 'They works. Next.')
    expect(readState(container).sentences[0].status).toBe(accepted ? 'idle' : 'rejected')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    active.resolve(response('Next.'))
    await settle()
    expect(fetch).toHaveBeenCalledTimes(accepted ? 4 : 3)
    if (!accepted) {
      fireEvent.change(editor, { target: { value: 'They work. Next.' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(400) })
      expect(fetch).toHaveBeenCalledTimes(4)
    }
    expect(readState(container).sentences[0].status).toBe('clean')
  })

  it('holds the queue through multiple refinements and discards a suggestion deleted during a later pass', async () => {
    const verification = deferred()
    const fetch = vi.fn().mockResolvedValueOnce(response('They work.'))
      .mockResolvedValueOnce(response('They do work.'))
      .mockReturnValueOnce(verification.promise).mockResolvedValueOnce(response('Next.'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'They works. Next.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(readState(container).sentences[0].status).toBe('idle')
    expect(highlights()).toHaveLength(0)
    fireEvent.change(editor, { target: { value: 'Next.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    verification.resolve(response('They do work.'))
    await settle()
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(readState(container).sentences.map((record) => record.status)).toEqual(['clean'])
    expect(readEditor(editor)).toBe('Next.')
  })

  it('publishes only the converged result and keeps the editor unchanged', async () => {
    const finalPass = deferred()
    const fetch = vi.fn().mockResolvedValueOnce(response('They are able to work.'))
      .mockResolvedValueOnce(response('They can work.')).mockReturnValueOnce(finalPass.promise)
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'They is able to work.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(readState(container).sentences[0].status).toBe('idle')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    finalPass.resolve(response('They can work.'))
    await settle()
    expect(readState(container).sentences[0]).toMatchObject({ status: 'suggestion', suggestion: 'They can work.' })
    expect(readEditor(editor)).toBe('They is able to work.')
  })

  it('continues the queue after a cycle and lets Retry start a fresh refinement', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response('They work.'))
      .mockResolvedValueOnce(response('They works.')).mockResolvedValueOnce(response('Next.'))
      .mockResolvedValueOnce(response('They work.')).mockResolvedValueOnce(response('They work.'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'They works. Next.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.click(screen.getByText('Debug state'))
    expect(screen.getByRole('alert')).toHaveTextContent('cycle')
    expect(readState(container).sentences.map((record) => record.status)).toEqual(['idle', 'clean'])
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await settle()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readState(container).sentences[0]).toMatchObject({ status: 'suggestion', suggestion: 'They work.' })
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('reveals rejected responses and their reason without changing the draft', async () => {
    const body = { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: '<b>Partial correction</b>' } }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'They works.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.click(screen.getByText('Debug state'))
    expect(screen.queryByText(/Generation did not complete normally/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show response' }))
    expect(container.querySelector('.debug-response')).toHaveTextContent('finish_reason: "length"')
    expect(container.querySelector('.debug-response')).toHaveTextContent('<b>Partial correction</b>')
    expect(container.querySelector('.debug-response b')).toBeNull()
    expect(readEditor(editor)).toBe('They works.')
    expect(readState(container).sentences[0].status).toBe('idle')
    fireEvent.click(screen.getByRole('button', { name: 'Hide response' }))
    expect(container.querySelector('.debug-response')).toBeNull()
    fireEvent.change(editor, { target: { value: 'They work.' } })
    expect(screen.queryByRole('button', { name: 'Show response' })).not.toBeInTheDocument()
  })

  it.each([true, false])('uses configured model and the correct request URL (development: %s)', async (development) => {
    vi.stubEnv('DEV', development)
    vi.stubEnv('VITE_OLLAMA_MODEL', 'custom-model')
    vi.stubEnv('VITE_OLLAMA_SERVER_URL', 'http://localhost:12345')
    const fetch = vi.fn().mockResolvedValue(response('First.'))
    vi.stubGlobal('fetch', fetch)
    render(<App />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe(`${development ? '/ollama' : 'http://localhost:12345'}/v1/chat/completions`)
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('custom-model')
  })

  it('debounces, sends duplicates separately, skips unfinished text, and caches without rewriting', async () => {
    const first = deferred()
    const fetch = vi.fn().mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(response('They work.')).mockResolvedValueOnce(response('They work.'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<StrictMode><App /></StrictMode>)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })
    const text = '  They works.\n\nThey works.  Unfinished'
    fireEvent.change(editor, { target: { value: text } })
    await act(async () => { await vi.advanceTimersByTimeAsync(399) })
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fetch).toHaveBeenCalledTimes(1)
    first.resolve(response('They works.'))
    await settle()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[1].content).toBe('They works.')
    expect(readState(container).sentences.map((record) => record.status)).toEqual(['clean', 'suggestion', 'idle'])
    expect(readState(container).sentences[1].suggestion).toBe('They work.')
    expect(readEditor(editor)).toBe(text)
    fireEvent.click(highlights()[0])
    expect(screen.getByRole('dialog', { name: 'Sentence comparison' })).toHaveTextContent('They work.')
    expect(readEditor(editor)).toBe(text)

    fireEvent.change(editor, { target: { value: `\n${text}` } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(readState(container).sentences[1].status).toBe('suggestion')
  })

  it('discards an edited response and checks only the latest queued version', async () => {
    const first = deferred()
    const fetch = vi.fn().mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(response('They work.')).mockResolvedValueOnce(response('They work!'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })
    fireEvent.change(editor, { target: { value: 'They works.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.change(editor, { target: { value: 'They work.' } })
    fireEvent.change(editor, { target: { value: 'They work!' } })
    first.resolve(response('They work.'))
    await settle()
    expect(readState(container).sentences[0]).toMatchObject({ version: 3, status: 'idle' })
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[2][1].body).messages[1].content).toBe('They work!')
    expect(readState(container).sentences[0]).toMatchObject({ version: 3, status: 'clean' })
    expect(readEditor(editor)).toBe('They work!')
  })

  it('ignores responses for deleted occurrences', async () => {
    const first = deferred()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(response('They work.'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })
    fireEvent.change(editor, { target: { value: 'They works.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.change(editor, { target: { value: '' } })
    first.resolve(response('They work.'))
    await settle()
    expect(readState(container).sentences).toEqual([])
    expect(readEditor(editor)).toBe('')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not show a server error for an occurrence deleted during inference', async () => {
    const first = deferred()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(first.promise))
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })
    fireEvent.change(editor, { target: { value: 'First.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.change(editor, { target: { value: '' } })
    first.resolve(new Response('failure', { status: 500 }))
    await settle()
    expect(readState(container).sentences).toEqual([])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps failures unchecked, continues the queue, and does not automatically retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('missing model', { status: 404 }))
      .mockResolvedValueOnce(response('Next.'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })
    fireEvent.change(editor, { target: { value: 'First. Next.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    await settle()
    expect(readState(container).sentences.map((record) => record.status)).toEqual(['idle', 'clean'])
    expect(screen.getByRole('alert')).not.toBeVisible()
    fireEvent.click(screen.getByText('Debug state'))
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 404')
    fireEvent.change(editor, { target: { value: '  First. Next.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.change(editor, { target: { value: 'Next.' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tracks duplicate failures independently and retries without changing the draft', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ choices: [] }))
      .mockResolvedValueOnce(response('Same.'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValueOnce(response('Changed.'))
      .mockResolvedValueOnce(response('Changed.'))
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'Same. Same.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    await settle()
    fireEvent.click(screen.getByText('Debug state'))
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    fireEvent.change(editor, { target: { value: '  Same. Same.' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0])
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(readState(container).sentences.map((record) => record.status)).toEqual(['clean', 'idle'])
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('still offline')
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fetch).toHaveBeenCalledTimes(4)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await settle()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readState(container).sentences.map((record) => record.status)).toEqual(['clean', 'suggestion'])
    expect(readEditor(editor)).toBe('  Same. Same.')
  })

  it('removes edited failures and ignores late errors from old versions', async () => {
    const late = deferred()
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(late.promise)
    vi.stubGlobal('fetch', fetch)
    render(<App />)
    const editor = screen.getByRole('textbox')
    fireEvent.change(editor, { target: { value: 'First.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.click(screen.getByText('Debug state'))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.change(editor, { target: { value: 'Changed.' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    fireEvent.change(editor, { target: { value: 'Changed again' } })
    late.resolve(new Response('failure', { status: 500 }))
    await settle()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readEditor(editor)).toBe('Changed again')
  })

  it('aborts fetch on unmount and suppresses disposed results', async () => {
    const first = deferred()
    const fetch = vi.fn().mockReturnValue(first.promise)
    vi.stubGlobal('fetch', fetch)
    const { unmount } = render(<StrictMode><App /></StrictMode>)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    const signal = fetch.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    first.resolve(response('First.'))
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
