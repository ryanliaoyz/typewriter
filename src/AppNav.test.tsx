import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { formatSaveTime } from './AppNav'
import { DEFAULT_MODEL } from './checking/config'
import { draftStorageKey } from './document/draft'
import { fireEvent, readEditor } from './test/editor'

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete (navigator as { locks?: unknown }).locks
})

async function clickOpen(): Promise<void> {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open' })) })
}

function editorText(): string {
  return readEditor(screen.getByRole('textbox', { name: 'Your writing' }))
}

describe('App navigation', () => {
  it('shares the title header with last save, open, the configured model, and latency', () => {
    vi.stubEnv('VITE_OLLAMA_MODEL', '')
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Document' })
    const heading = screen.getByRole('heading', { name: 'Typewriter', level: 1 })

    expect(heading.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav.parentElement).toBe(heading.parentElement)
    expect(nav.parentElement?.tagName).toBe('HEADER')
    expect(nav).toHaveTextContent(`Last save —OpenModel ${DEFAULT_MODEL}Latency —`)
    expect(within(nav).getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'false')
  })

  it.each([true, false])('displays the same read-only model used for inference (development: %s)', async (development) => {
    vi.stubEnv('DEV', development)
    vi.stubEnv('VITE_OLLAMA_MODEL', '  gemma4:e4b  ')
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'A sentence.' }, finish_reason: 'stop' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    render(<App />)

    const nav = screen.getByRole('navigation', { name: 'Document' })
    expect(within(nav).getByText('gemma4:e4b').tagName).toBe('SPAN')
    expect(within(nav).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(nav).getAllByRole('button')).toHaveLength(1)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A sentence.' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ model: 'gemma4:e4b' })
  })

  it('opens another saved draft and keeps the current draft available', async () => {
    localStorage.setItem('typewriter:draft:closed', '\n  Closed tab   draft.\nSecond line')
    localStorage.setItem('typewriter:draft:blank', ' \n\t')
    render(<App />)
    const currentKey = draftStorageKey()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Current draft.' } })

    await clickOpen()
    const drafts = screen.getByRole('group', { name: 'Saved drafts' })
    expect(within(drafts).getAllByRole('button').map((button) => button.textContent)).toEqual(['Closed tab draft.'])

    await act(async () => { fireEvent.click(within(drafts).getByRole('button', { name: 'Closed tab draft.' })) })
    expect(screen.queryByRole('group', { name: 'Saved drafts' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
    expect(editorText()).toBe('\n  Closed tab   draft.\nSecond line')
    expect(draftStorageKey()).toBe('typewriter:draft:closed')
    expect(localStorage.getItem(currentKey)).toBe('Current draft.')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited closed draft.' } })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(localStorage.getItem('typewriter:draft:closed')).toBe('Edited closed draft.')
    expect(localStorage.getItem(currentKey)).toBe('Current draft.')

    await clickOpen()
    expect(screen.getByRole('button', { name: 'Current draft.' })).toBeInTheDocument()
  })

  it('reports when no other draft is saved and closes on Escape', async () => {
    render(<App />)
    await clickOpen()
    expect(screen.getByText('No other saved drafts.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(screen.getByText('No other saved drafts.'), { key: 'Escape' })
    expect(screen.queryByText('No other saved drafts.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('omits drafts that another open tab holds', async () => {
    localStorage.setItem('typewriter:draft:open-elsewhere', 'Held draft.')
    localStorage.setItem('typewriter:draft:closed', 'Free draft.')
    const request = vi.fn((_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) =>
      Promise.resolve(callback({ name: _name, mode: 'exclusive' })))
    const query = vi.fn(async () => ({ held: [{ name: 'typewriter:tab:open-elsewhere', mode: 'exclusive' }], pending: [] }))
    Object.defineProperty(navigator, 'locks', { value: { request, query }, configurable: true })

    render(<App />)
    await clickOpen()
    const drafts = screen.getByRole('group', { name: 'Saved drafts' })
    expect(within(drafts).getAllByRole('button').map((button) => button.textContent)).toEqual(['Free draft.'])
  })

  it('shows when this tab\'s draft was last saved, including after opening another draft', async () => {
    vi.setSystemTime(new Date(2026, 9, 19, 14, 30))
    localStorage.setItem('typewriter:draft:closed', 'Older draft.')
    localStorage.setItem('typewriter:saved:closed', String(new Date(2026, 9, 17, 8, 5).getTime()))
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Document' })
    expect(nav).toHaveTextContent(/^Last save —Open/)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Saved now.' } })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    const time = within(nav).getByText(formatSaveTime(Date.now()))
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('dateTime', new Date(2026, 9, 19, 14, 30).toISOString())

    await clickOpen()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Older draft.' })) })
    expect(within(nav).getByText(formatSaveTime(new Date(2026, 9, 17, 8, 5).getTime()))).toBeInTheDocument()
  })

  it('formats today\'s saves as a time and earlier saves with their date', () => {
    const now = new Date(2026, 9, 19, 14, 30).getTime()
    const today = new Date(2026, 9, 19, 9, 5).getTime()
    const earlier = new Date(2026, 9, 18, 23, 55).getTime()
    expect(formatSaveTime(today, now)).toBe(new Date(today).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))
    expect(formatSaveTime(earlier, now)).toBe(new Date(earlier).toLocaleString(undefined,
      { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
    expect(formatSaveTime(earlier, now)).not.toBe(formatSaveTime(today, now))
  })
})
