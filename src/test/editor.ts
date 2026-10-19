import { act, fireEvent as domEvents } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { Text } from '@codemirror/state'
import { updateDocument } from '../document/document'

export function editorView(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element)
  if (!view) throw new Error('Missing editor view')
  return view
}

export function readEditor(element: HTMLElement): string {
  return editorView(element).state.doc.toString()
}

// Snapshot-based fixtures still simulate one localized edit, not replacing the
// entire document (which would correctly retire every affected occurrence).
export const fireEvent = {
  ...domEvents,
  change(element: HTMLElement, event: { target: { value: string } }) {
    const view = editorView(element)
    const { edit } = updateDocument({ text: readEditor(element), edit: null }, event.target.value)
    if (!edit) return
    act(() => view.dispatch({ changes: {
      from: edit.start, to: edit.end, insert: Text.of(edit.insertedText.split('\n')),
    } }))
  },
}

export function highlights() {
  return Array.from(document.querySelectorAll<HTMLElement>('.cm-content .sentence-highlight'))
}

export function failureHighlights() {
  return Array.from(document.querySelectorAll<HTMLElement>('.cm-content .sentence-failure'))
}
