import { useLayoutEffect, useRef } from 'react'
import { Annotation, EditorState, StateEffect, StateField, Text } from '@codemirror/state'
import { Decoration, EditorView, keymap, showTooltip } from '@codemirror/view'
import type { Tooltip } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands'
import type { DocumentEdit } from './document/document'
import type { SentenceDocumentState, SentenceRecord, SuggestionCapture } from './document/sentences'

type Props = {
  state: SentenceDocumentState
  updateText: (text: string, edit?: DocumentEdit) => void
  accept: (capture: SuggestionCapture) => boolean
  reject: (capture: SuggestionCapture) => boolean
}
type Selection = { id: string, version: number } | null
const sync = Annotation.define<boolean>()
const setRecords = StateEffect.define<readonly SentenceRecord[]>()
const select = StateEffect.define<Selection>()
// Split only on LF: retaining CR characters keeps canonical UTF-16 offsets exact.
const plainText = (text: string) => Text.of(text.split('\n'))

export default function SentenceEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const latest = useRef(props)
  latest.current = props

  useLayoutEffect(() => {
    const records = StateField.define<readonly SentenceRecord[]>({
      create: () => latest.current.state.sentences,
      update(value, transaction) {
        for (const effect of transaction.effects) if (effect.is(setRecords)) return effect.value
        // Never leave stale marks available between a keystroke and React's render.
        return transaction.docChanged ? [] : value
      },
      provide: field => EditorView.decorations.from(field, sentences => Decoration.set(
        sentences.filter(record => record.status === 'suggestion').map(record => Decoration.mark({
          class: 'sentence-highlight',
          attributes: { 'data-sentence-id': record.id },
        }).range(record.start, record.end)),
      )),
    })
    const selection = StateField.define<Selection>({
      create: () => null,
      update(value, transaction) {
        for (const effect of transaction.effects) if (effect.is(select)) value = effect.value
        // Records are briefly cleared during editing, so validate against the latest
        // canonical records once they arrive, not against that intermediate empty set.
        const updated = transaction.effects.find(effect => effect.is(setRecords))
        if (updated && value && !updated.value.some(record => record.id === value.id &&
          record.version === value.version && record.status === 'suggestion')) return null
        return value
      },
    })
    function selected(state: EditorState) {
      const capture = state.field(selection)
      return state.field(records).find(record => record.id === capture?.id &&
        record.version === capture.version && record.status === 'suggestion')
    }
    function open(view: EditorView, record: SentenceRecord) {
      view.dispatch({ effects: select.of({ id: record.id, version: record.version }) })
    }
    function makeTooltip(state: EditorState): Tooltip | null {
      const record = selected(state)
      if (!record || record.status !== 'suggestion') return null
      const capture: SuggestionCapture = {
        id: record.id, version: record.version, text: record.text, suggestion: record.suggestion,
      }
      return {
        pos: record.start, end: record.end, above: false, arrow: true,
        create(view) {
          const dom = document.createElement('section')
          dom.className = 'suggestion-comparison'
          dom.setAttribute('role', 'dialog')
          dom.setAttribute('aria-label', 'Sentence comparison')
          for (const [heading, text] of [['Original', capture.text], ['Suggested', capture.suggestion]]) {
            const label = dom.appendChild(document.createElement('h4'))
            label.textContent = heading
            const paragraph = dom.appendChild(document.createElement('p'))
            paragraph.textContent = text
          }
          function close() {
            view.dispatch({ effects: select.of(null) })
            view.focus()
          }
          for (const [label, action] of [
            ['Accept suggestion', () => latest.current.accept(capture)],
            ['Reject suggestion', () => latest.current.reject(capture)],
            ['Close comparison', () => true],
          ] as const) {
            const button = dom.appendChild(document.createElement('button'))
            button.type = 'button'
            button.textContent = label
            button.onclick = () => { if (action()) close() }
          }
          dom.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); close() }
          })
          return { dom }
        },
      } satisfies Tooltip
    }
    const tooltip = StateField.define<Tooltip | null>({
      create: () => null,
      update(value, transaction) {
        const before = selected(transaction.startState)
        const after = selected(transaction.state)
        if (value && before && after && before.id === after.id && before.version === after.version &&
          before.suggestion === after.suggestion) {
          // Keep the same create function so unrelated results and shifted offsets
          // do not recreate the card or steal focus from its controls.
          return before.start === after.start && before.end === after.end ? value :
            { ...value, pos: after.start, end: after.end }
        }
        return makeTooltip(transaction.state)
      },
      provide: field => showTooltip.from(field),
    })
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: plainText(latest.current.state.document.text),
        extensions: [
          EditorState.lineSeparator.of('\n'), EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': 'Your writing', 'aria-keyshortcuts': 'Alt+Enter', spellcheck: 'false',
          }),
          history(), records, selection, tooltip,
          keymap.of([
            { key: 'Alt-Enter', run(view) {
              const record = view.state.field(records).find(record => record.status === 'suggestion' &&
                record.start <= view.state.selection.main.head && record.end >= view.state.selection.main.head)
              if (!record) return false
              open(view, record)
              view.dom.querySelector<HTMLButtonElement>('.suggestion-comparison button')?.focus()
              return true
            } },
            { key: 'Escape', run(view) {
              if (!view.state.field(selection)) return false
              view.dispatch({ effects: select.of(null) })
              return true
            } }, ...defaultKeymap, ...historyKeymap,
          ]),
          EditorView.domEventHandlers({
            click(event, view) {
              const target = event.target as HTMLElement
              const id = target.closest<HTMLElement>('[data-sentence-id]')?.dataset.sentenceId
              const record = view.state.field(records).find(record => record.id === id)
              if (record) open(view, record)
              else if (!target.closest('.suggestion-comparison')) view.dispatch({ effects: select.of(null) })
            },
          }),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || update.transactions.every(transaction => transaction.annotation(sync))) return
            // A transaction may contain several disjoint changes (e.g. undo). Feed
            // each exact edit in order so duplicate occurrence identities stay local.
            let text = update.startState.doc.toString()
            let shift = 0
            update.changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
              const edit = { start: from + shift, end: to + shift, insertedText: inserted.toString() }
              text = text.slice(0, edit.start) + edit.insertedText + text.slice(edit.end)
              latest.current.updateText(text, edit)
              shift += edit.insertedText.length - (to - from)
            })
          }),
        ],
      }),
    })
    editor.current = view
    return () => { editor.current = null; view.destroy() }
  }, [])

  useLayoutEffect(() => {
    const view = editor.current
    if (!view) return
    const { document, sentences } = props.state
    const changed = view.state.doc.toString() !== document.text
    // Accepted suggestions use the canonical explicit range, not a full-document
    // replacement: selection mapping and a single undo event are preserved.
    const edit = document.edit
    const changes = changed ? (edit &&
      view.state.doc.toString().slice(0, edit.start) + edit.insertedText + view.state.doc.toString().slice(edit.end) === document.text
      ? { from: edit.start, to: edit.end, insert: plainText(edit.insertedText) }
      : { from: 0, to: view.state.doc.length, insert: plainText(document.text) }) : undefined
    view.dispatch({ changes, effects: setRecords.of(sentences),
      annotations: changed ? [sync.of(true), isolateHistory.of('full')] : [] })
  }, [props.state])

  return <div className="writing-editor" ref={host} />
}
