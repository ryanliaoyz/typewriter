import { act, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { undo, redo } from '@codemirror/commands'
import { useState } from 'react'
import SentenceEditor from './SentenceEditor'
import { acceptSentenceSuggestion, cacheSentenceResult, createSentenceDocument, updateSentenceDocument } from './document/sentences'
import { editorView, failureHighlights, fireEvent, highlights, readEditor } from './test/editor'

function suggested(text = 'They works. They works.') {
  let state = createSentenceDocument(text)
  for (const sentence of state.sentences.filter(record => record.complete)) {
    state = cacheSentenceResult(state, sentence, { status: 'suggestion', suggestion: `Correction for ${sentence.id}.` })
  }
  return state
}
const actions = { updateText: () => {}, accept: () => false, reject: () => false, failures: [], retry: () => {} }

describe('SentenceEditor', () => {
  it('shows only current unchecked failures alongside suggestions and renders error text literally', () => {
    let state = createSentenceDocument('Same. Same. Third. Fourth.')
    const failures = state.sentences.map(({ id, version, text }) => ({
      sentence: { id, version, text }, message: '<b>Server offline</b>',
    }))
    state = cacheSentenceResult(state, state.sentences[1], { status: 'suggestion', suggestion: 'Suggested.' })
    failures[2].sentence.text = 'Old text.'
    failures[3].sentence.version += 1
    failures.push({ sentence: { id: 'deleted', version: 1, text: 'Same.' }, message: 'Deleted failure' })
    render(<SentenceEditor state={state} {...actions} failures={failures} />)
    expect(failureHighlights()).toHaveLength(1)
    expect(failureHighlights()[0]).toHaveAttribute('data-sentence-id', state.sentences[0].id)
    expect(highlights()).toHaveLength(1)
    fireEvent.click(failureHighlights()[0])
    const panel = screen.getByRole('dialog', { name: 'Sentence check failed' })
    expect(panel).toHaveTextContent('<b>Server offline</b> This sentence remains unchecked.')
    expect(panel.querySelector('b')).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Accept suggestion' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close failure details' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('opens duplicate failures independently by keyboard and retries the selected capture', () => {
    const state = createSentenceDocument('Same. Same.')
    const failures = state.sentences.map(({ id, version, text }, index) => ({
      sentence: { id, version, text }, message: `Failure ${index + 1}`,
    }))
    const retry = vi.fn()
    render(<SentenceEditor state={state} {...actions} failures={failures} retry={retry} />)
    const editor = screen.getByRole('textbox')
    act(() => editorView(editor).dispatch({ selection: { anchor: state.sentences[1].start + 1 } }))
    editor.focus()
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter', altKey: true })
    expect(screen.getByRole('dialog')).toHaveTextContent('Failure 2')
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(editor).toHaveFocus()
    fireEvent.click(failureHighlights()[0])
    expect(screen.getByRole('dialog')).toHaveTextContent('Failure 1')
    fireEvent.click(failureHighlights()[1])
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledExactlyOnceWith(failures[1].sentence)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(editor).toHaveFocus()
    expect(readEditor(editor)).toBe(state.document.text)
  })

  it('keeps Retry focused through unrelated failures and offset shifts', () => {
    const state = createSentenceDocument('Same. Same.')
    const failures = state.sentences.map(({ id, version, text }) => ({
      sentence: { id, version, text }, message: 'Offline',
    }))
    const retry = vi.fn()
    const { rerender } = render(<SentenceEditor state={state} {...actions} failures={[failures[1]]} retry={retry} />)
    fireEvent.click(failureHighlights()[0])
    const button = screen.getByRole('button', { name: 'Retry' })
    button.focus()
    rerender(<SentenceEditor state={state} {...actions} failures={failures} retry={retry} />)
    expect(button).toHaveFocus()
    const shifted = updateSentenceDocument(state, `\n${state.document.text}`)
    rerender(<SentenceEditor state={shifted} {...actions} failures={failures} retry={retry} />)
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(retry).toHaveBeenCalledExactlyOnceWith(failures[1].sentence)
    expect(readEditor(screen.getByRole('textbox'))).toBe(shifted.document.text)
  })

  it.each(['They work. Last.', 'Last.', 'They. Works. Last.', 'They works Last.'])(
    'removes a stale failure card after editing to %s and does not reopen it for a new failure', text => {
      const state = createSentenceDocument('They works. Last.')
      const failure = { sentence: state.sentences[0], message: 'Offline' }
      const { rerender } = render(<SentenceEditor state={state} {...actions} failures={[failure]} />)
      fireEvent.click(failureHighlights()[0])
      const next = updateSentenceDocument(state, text)
      rerender(<SentenceEditor state={next} {...actions} failures={[failure]} />)
      expect(failureHighlights()).toHaveLength(0)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      rerender(<SentenceEditor state={next} {...actions} failures={[{ sentence: next.sentences[0], message: 'New failure' }]} />)
      expect(failureHighlights()).toHaveLength(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('closes removed failures without reopening on retry failure or switching to a suggestion card', () => {
    const state = createSentenceDocument('They works.')
    const failures = [{ sentence: state.sentences[0], message: 'Offline' }]
    const { rerender } = render(<SentenceEditor state={state} {...actions} failures={failures} />)
    fireEvent.click(failureHighlights()[0])
    rerender(<SentenceEditor state={state} {...actions} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(failureHighlights()).toHaveLength(0)
    rerender(<SentenceEditor state={state} {...actions} failures={failures} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(failureHighlights()[0])
    const next = cacheSentenceResult(state, state.sentences[0], { status: 'suggestion', suggestion: 'They work.' })
    rerender(<SentenceEditor state={next} {...actions} failures={failures} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(failureHighlights()).toHaveLength(0)
    expect(highlights()).toHaveLength(1)
  })

  it('renders only one editable document, preserving whitespace and literal Unicode text', () => {
    const text = '  😀 <b>Not markup</b> They works.\r\n\n\tThey works.  Unfinished'
    render(<SentenceEditor state={suggested(text)} {...actions} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(readEditor(screen.getByRole('textbox'))).toBe(text)
    expect(highlights()).toHaveLength(2)
    fireEvent.click(highlights()[1])
    const panel = screen.getByRole('dialog', { name: 'Sentence comparison' })
    expect(within(panel).getByText('Correction for sentence-2.')).toBeInTheDocument()
    expect(document.querySelector('.review-document')).toBeNull()
    expect(document.querySelector('.cm-content b')).toBeNull()
  })

  it.each(['Accept suggestion', 'Reject suggestion'])('sends the exact capture for %s and restores focus', label => {
    const state = suggested()
    const accept = vi.fn(() => true)
    const reject = vi.fn(() => true)
    render(<SentenceEditor state={state} {...actions} accept={accept} reject={reject} />)
    fireEvent.click(highlights()[1])
    fireEvent.click(screen.getByRole('button', { name: label }))
    const record = state.sentences[1]
    expect(label === 'Accept suggestion' ? accept : reject).toHaveBeenCalledExactlyOnceWith({
      id: record.id, version: record.version, text: record.text, suggestion: record.suggestion,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('selects duplicates independently and follows offsets without changing text or caret', () => {
    const state = suggested()
    const { rerender } = render(<SentenceEditor state={state} {...actions} />)
    const editor = screen.getByRole('textbox')
    act(() => editorView(editor).dispatch({ selection: { anchor: 3 } }))
    fireEvent.click(highlights()[0])
    expect(screen.getByText('Correction for sentence-1.')).toBeInTheDocument()
    fireEvent.click(highlights()[1])
    const next = updateSentenceDocument(state, `Inserted. ${state.document.text}`)
    rerender(<SentenceEditor state={next} {...actions} />)
    expect(screen.getByText('Correction for sentence-2.')).toBeInTheDocument()
    expect(readEditor(editor)).toBe(next.document.text)
    expect(editorView(editor).state.selection.main.head).toBe(13)
    fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
    expect(editor).toHaveFocus()
  })

  it('gives the compact close control an accessible name and dismisses without applying an action', () => {
    const state = suggested()
    const accept = vi.fn(() => false)
    const reject = vi.fn(() => false)
    render(<SentenceEditor state={state} {...actions} accept={accept} reject={reject} />)
    fireEvent.click(highlights()[0])
    const close = screen.getByRole('button', { name: 'Close comparison' })
    expect(close).toHaveTextContent('×')
    fireEvent.click(close)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(readEditor(screen.getByRole('textbox'))).toBe(state.document.text)
    expect(accept).not.toHaveBeenCalled()
    expect(reject).not.toHaveBeenCalled()
  })

  it.each(['They work. Last.', 'Last.', 'They. Works. Last.', 'They works Last.'])(
    'closes stale comparisons after editing to %s and never reopens them on new results', text => {
      const state = suggested('They works. Last.')
      const { rerender } = render(<SentenceEditor state={state} {...actions} />)
      fireEvent.click(highlights()[0])
      let next = updateSentenceDocument(state, text)
      rerender(<SentenceEditor state={next} {...actions} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      next = cacheSentenceResult(next, next.sentences[0], { status: 'suggestion', suggestion: 'Fresh result.' })
      rerender(<SentenceEditor state={next} {...actions} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('opens with Alt-Enter and closes with Escape without interfering with Enter typing', () => {
    render(<SentenceEditor state={suggested()} {...actions} />)
    const editor = screen.getByRole('textbox')
    editor.focus()
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter', altKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept suggestion' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(editor).toHaveFocus()
  })

  it('accepts as a separate undoable edit and keeps canonical state synchronized on undo/redo', () => {
    function Harness() {
      const [state, setState] = useState(() => suggested('They works.'))
      return <SentenceEditor state={state} {...actions}
        updateText={(text, edit) => setState(previous => updateSentenceDocument(previous, text, edit))}
        accept={capture => { setState(previous => acceptSentenceSuggestion(previous, capture)); return true }} />
    }
    render(<Harness />)
    const editor = screen.getByRole('textbox')
    fireEvent.click(highlights()[0])
    fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion' }))
    expect(readEditor(editor)).toBe('Correction for sentence-1.')
    act(() => { undo(editorView(editor)) })
    expect(readEditor(editor)).toBe('They works.')
    expect(highlights()).toHaveLength(0)
    act(() => { redo(editorView(editor)) })
    expect(readEditor(editor)).toBe('Correction for sentence-1.')
  })

  it('uses exact edit ranges to distinguish insertion of an identical occurrence', () => {
    const state = suggested()
    const updateText = vi.fn((text, edit) => updateSentenceDocument(state, text, edit))
    render(<SentenceEditor state={state} {...actions} updateText={updateText} />)
    act(() => editorView(screen.getByRole('textbox')).dispatch({ changes: { from: 0, insert: 'They works. ' } }))
    expect(updateText).toHaveBeenCalledExactlyOnceWith('They works. They works. They works.', {
      start: 0, end: 0, insertedText: 'They works. ',
    })
    const next = updateSentenceDocument(state, updateText.mock.calls[0][0], updateText.mock.calls[0][1])
    expect(next.sentences.map(record => [record.id, record.status])).toEqual([
      ['sentence-3', 'idle'], ['sentence-1', 'suggestion'], ['sentence-2', 'suggestion'],
    ])
  })

  it('keeps card controls focused while unrelated results arrive or offsets shift', () => {
    const state = suggested()
    const { rerender } = render(<SentenceEditor state={state} {...actions} />)
    fireEvent.click(highlights()[1])
    const button = screen.getByRole('button', { name: 'Accept suggestion' })
    button.focus()
    const next = cacheSentenceResult(state, state.sentences[0], { status: 'clean' })
    rerender(<SentenceEditor state={next} {...actions} />)
    expect(button).toHaveFocus()
    const shifted = updateSentenceDocument(next, `Inserted. ${next.document.text}`)
    rerender(<SentenceEditor state={shifted} {...actions} />)
    expect(button).toHaveFocus()
  })

  it('clears the card on loss of suggestion status and does not reopen it', () => {
    const state = suggested()
    const { rerender } = render(<SentenceEditor state={state} {...actions} />)
    fireEvent.click(highlights()[0])
    rerender(<SentenceEditor state={cacheSentenceResult(state, state.sentences[0], { status: 'clean' })} {...actions} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<SentenceEditor state={state} {...actions} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reconciles disjoint transaction edits in order with exact ranges', () => {
    const updateText = vi.fn()
    render(<SentenceEditor state={suggested('They works. Last.')} {...actions} updateText={updateText} />)
    act(() => editorView(screen.getByRole('textbox')).dispatch({ changes: [
      { from: 0, insert: 'New. ' }, { from: 12, to: 16, insert: 'Final' },
    ] }))
    expect(updateText.mock.calls).toEqual([
      ['New. They works. Last.', { start: 0, end: 0, insertedText: 'New. ' }],
      ['New. They works. Final.', { start: 17, end: 21, insertedText: 'Final' }],
    ])
  })
})
