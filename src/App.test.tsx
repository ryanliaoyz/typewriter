import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

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

  it('makes clear that grammar checking is not available yet', () => {
    render(<App />)

    expect(screen.getByText(/Grammar checking is not available yet\./)).toBeInTheDocument()
  })
})
