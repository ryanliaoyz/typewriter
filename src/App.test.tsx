import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as sentenceDocument from './document/sentences'
import type { SentenceDocumentState } from './document/sentences'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the Typewriter heading', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Typewriter', level: 1 })).toBeInTheDocument()
  })

  it('renders an empty, accessible plain-text editor', () => {
    render(<App />)

    const editor = screen.getByRole('textbox', { name: 'Your writing' })
    expect(editor).toHaveValue('')
    expect(editor).toHaveAccessibleDescription(
      'Write or paste plain text. Your draft stays in this page until you reload.',
    )
  })

  it('wires consecutive changes and deletion into the controlled editor', () => {
    render(<App />)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })

    for (const text of ['A draft.', 'A new draft.', 'A new draft. 😀', '']) {
      fireEvent.change(editor, { target: { value: text } })
      expect(editor).toHaveValue(text)
    }
  })

  it('keeps multiline plain text, whitespace, and Unicode verbatim', () => {
    render(<App />)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })
    const text = '  <b>Not markup</b> 😀\n\n\tCafe\u0301.  '

    fireEvent.change(editor, { target: { value: text } })

    expect(editor).toHaveValue(text)
    expect(screen.queryByText('Not markup')).not.toBeInTheDocument()
  })

  it('reconciles sentence records with each canonical editor update', () => {
    const reconcile = vi.spyOn(sentenceDocument, 'updateSentenceDocument')
    render(<App />)
    const editor = screen.getByRole('textbox', { name: 'Your writing' })

    for (const text of ['First. Last.', 'First. Inserted. Last.', 'First. Inserted! Last.']) {
      fireEvent.change(editor, { target: { value: text } })
      expect(editor).toHaveValue(text)
    }

    expect(reconcile).toHaveBeenCalledTimes(3)
    const first = reconcile.mock.results[0].value as SentenceDocumentState
    const inserted = reconcile.mock.results[1].value as SentenceDocumentState
    const edited = reconcile.mock.results[2].value as SentenceDocumentState
    expect(inserted.sentences.map(({ id }) => id)).toEqual([
      first.sentences[0].id, 'sentence-3', first.sentences[1].id,
    ])
    expect(edited.sentences[1]).toMatchObject({ id: 'sentence-3', version: 2 })
    expect(edited.sentences[2]).toMatchObject({ id: first.sentences[1].id, version: 1 })
    expect(reconcile.mock.calls[1][0]).toBe(first)
    expect(reconcile.mock.calls[2][0]).toBe(inserted)
  })

  it('makes clear that grammar checking is not available yet', () => {
    render(<App />)

    expect(screen.getByText(/Grammar checking is not available yet\./)).toBeInTheDocument()
  })
})
