import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Review from './SuggestionReview'
import { cacheSentenceResult, createSentenceDocument, updateSentenceDocument } from './document/sentences'

function SuggestionReview({ state }: { state: Parameters<typeof Review>[0]['state'] }) {
  return <Review state={state} accept={() => false} reject={() => false} focusEditor={() => {}} />
}

function suggested(text = 'They works. They works.') {
  let state = createSentenceDocument(text)
  for (const sentence of state.sentences.filter((record) => record.complete)) {
    state = cacheSentenceResult(state, sentence, { status: 'suggestion', suggestion: `Correction for ${sentence.id}.` })
  }
  return state
}

describe('SuggestionReview', () => {
  it.each(['Accept suggestion', 'Reject suggestion'])('sends the displayed capture for %s and restores editor focus', (label) => {
    const state = suggested()
    const accept = vi.fn(() => true)
    const reject = vi.fn(() => true)
    const focusEditor = vi.fn()
    render(<Review state={state} accept={accept} reject={reject} focusEditor={focusEditor} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'They works.' })[1])
    fireEvent.click(screen.getByRole('button', { name: label }))
    const record = state.sentences[1]
    expect(label === 'Accept suggestion' ? accept : reject).toHaveBeenCalledExactlyOnceWith({
      id: record.id, version: record.version, text: record.text, suggestion: record.suggestion,
    })
    expect(focusEditor).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Sentence comparison' })).not.toBeInTheDocument()
  })

  it('preserves document whitespace and Unicode and treats suggestions as text', () => {
    const text = '  They works.\n\n\tThey works.  😀 Unfinished'
    const state = suggested(text)
    const { container } = render(<SuggestionReview state={state} />)
    expect(screen.queryByText(/Select a highlighted sentence/)).not.toBeInTheDocument()
    expect(container.querySelector('.review-document')?.textContent).toBe(text)
    expect(screen.getAllByRole('button', { name: 'They works.' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'They works.' })[1])
    const panel = screen.getByRole('region', { name: 'Sentence comparison' })
    expect(within(panel).getByText('They works.')).toBeInTheDocument()
    expect(within(panel).getByText('Correction for sentence-2.')).toBeInTheDocument()
    expect(state.document.text).toBe(text)
  })

  it('selects duplicate occurrences independently and returns focus on close', () => {
    render(<SuggestionReview state={suggested()} />)
    const buttons = screen.getAllByRole('button', { name: 'They works.' })
    buttons[0].focus()
    expect(buttons[0]).toHaveFocus()
    // Native buttons supply Enter/Space activation in the browser.
    fireEvent.click(buttons[0])
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Correction for sentence-1.')).toBeInTheDocument()
    fireEvent.click(buttons[1])
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Correction for sentence-2.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
    expect(screen.queryByRole('region', { name: 'Sentence comparison' })).not.toBeInTheDocument()
    expect(buttons[1]).toHaveFocus()
  })

  it('retains selection when only offsets move', () => {
    const state = suggested()
    const { rerender, container } = render(<SuggestionReview state={state} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'They works.' })[1])
    const next = updateSentenceDocument(state, `Inserted.\n ${state.document.text}`)
    rerender(<SuggestionReview state={next} />)
    expect(screen.getByText('Correction for sentence-2.')).toBeInTheDocument()
    expect(container.querySelector('.review-document')?.textContent).toBe(next.document.text)
  })

  it.each([
    ['edit', 'They work. Last.'],
    ['deletion', 'Last.'],
    ['split', 'They. Works. Last.'],
    ['merge', 'They works Last.'],
  ])('closes a comparison after %s and does not reopen on fresh results', (_, text) => {
    const state = suggested('They works. Last.')
    const { rerender } = render(<SuggestionReview state={state} />)
    fireEvent.click(screen.getByRole('button', { name: 'They works.' }))
    let next = updateSentenceDocument(state, text)
    rerender(<SuggestionReview state={next} />)
    expect(screen.queryByRole('region', { name: 'Sentence comparison' })).not.toBeInTheDocument()
    next = cacheSentenceResult(next, next.sentences[0], { status: 'suggestion', suggestion: 'Fresh result.' })
    rerender(<SuggestionReview state={next} />)
    expect(screen.queryByRole('region', { name: 'Sentence comparison' })).not.toBeInTheDocument()
  })

  it('clears selection when a suggestion is removed and shows an empty state', () => {
    const state = suggested('They works.')
    const { rerender } = render(<SuggestionReview state={state} />)
    fireEvent.click(screen.getByRole('button', { name: 'They works.' }))
    rerender(<SuggestionReview state={cacheSentenceResult(state, state.sentences[0], { status: 'clean' })} />)
    expect(screen.getByText('No suggestions to review.')).toBeInTheDocument()
    rerender(<SuggestionReview state={state} />)
    expect(screen.queryByRole('region', { name: 'Sentence comparison' })).not.toBeInTheDocument()
  })
})
