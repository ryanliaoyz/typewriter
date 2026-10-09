import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DebugInspector from './DebugInspector'
import { createSentenceDocument, updateSentenceDocument } from './document/sentences'

describe('DebugInspector', () => {
  it('starts collapsed and shows empty state without changing the document', () => {
    const state = createSentenceDocument()
    const { container } = render(<DebugInspector state={state} />)

    expect(container.querySelector('details')).not.toHaveAttribute('open')
    expect(screen.getByText('No sentence records.')).toBeInTheDocument()
    expect(screen.getByText('No edit in the latest transition.')).toBeInTheDocument()
    expect(container.querySelector('pre')?.textContent).toBe(JSON.stringify(state, null, 2))
    expect(state).toEqual(createSentenceDocument())
  })

  it('shows UTF-16 counts, occurrence ranges, completion, and escaped whitespace', () => {
    const state = createSentenceDocument('  😀 Hello.\n\nNext\tpart')
    const { container } = render(<DebugInspector state={state} />)
    const counts = container.querySelector('.debug-counts')!
    const table = screen.getByRole('table', { name: 'Current sentence records', hidden: true })
    const rows = within(table).getAllByRole('row', { hidden: true })

    expect(Array.from(counts.querySelectorAll('dd'), (item) => item.textContent)).toEqual([
      String(state.document.text.length), '2', '1', '1',
    ])
    expect(within(rows[1]).getByText('[2, 11)')).toBeInTheDocument()
    expect(within(rows[1]).getByText('"😀 Hello."')).toBeInTheDocument()
    expect(within(rows[1]).getByText('true')).toBeInTheDocument()
    expect(within(rows[2]).getByText('[13, 22)')).toBeInTheDocument()
    expect(within(rows[2]).getByText('"Next\\tpart"')).toBeInTheDocument()
    expect(within(rows[2]).getByText('false')).toBeInTheDocument()
    expect(within(table).getAllByText('idle')).toHaveLength(2)
    expect(container.querySelector('pre')?.textContent).toBe(JSON.stringify(state, null, 2))
  })

  it('shows the latest replacement against previous offsets and clears it on an unchanged transition', () => {
    const previous = createSentenceDocument('Hello.')
    const state = updateSentenceDocument(previous, 'Hello.\n\nDraft')
    const { rerender } = render(<DebugInspector state={state} />)
    const edit = screen.getByRole('region', { name: 'Latest edit', hidden: true })

    expect(within(edit).getByText('[6, 6)')).toBeInTheDocument()
    expect(within(edit).getByText('"\\n\\nDraft"')).toBeInTheDocument()

    rerender(<DebugInspector state={updateSentenceDocument(state, state.document.text)} />)

    expect(within(edit).getByText('No edit in the latest transition.')).toBeInTheDocument()
    expect(within(edit).queryByText('[6, 6)')).not.toBeInTheDocument()
  })

  it('renders text as text, never as HTML', () => {
    const state = createSentenceDocument('<b>Not markup</b>.')
    const { container } = render(<DebugInspector state={state} />)

    expect(screen.getByText('"<b>Not markup</b>."')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })
})
