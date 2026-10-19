import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { draftStorageKey } from './document/draft'
import { fireEvent, readEditor } from './test/editor'

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (navigator as { locks?: unknown }).locks
})

async function clickOpen(): Promise<void> {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open' })) })
}

function editorText(): string {
  return readEditor(screen.getByRole('textbox', { name: 'Your writing' }))
}

describe('App navigation', () => {
  it('follows the header with last save, open, model, and latency', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Document' })
    const heading = screen.getByRole('heading', { name: 'Typewriter', level: 1 })

    expect(heading.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav).toHaveTextContent(/^Last save —Open\s*Model —Latency —$/)
    expect(within(nav).getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'false')
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
})
