import { useLayoutEffect, useRef } from 'react'
import { Annotation, EditorState, StateEffect, StateField, Text } from '@codemirror/state'
import { Decoration, EditorView, keymap, showTooltip } from '@codemirror/view'
import type { Tooltip } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands'
import type { DocumentEdit } from './document/document'
import type { SentenceDocumentState, SentenceRecord, SuggestionCapture } from './document/sentences'
import type { useSentenceEditor } from './checking/useSentenceEditor'

type Props = {
  state: SentenceDocumentState
  updateText: (text: string, edit?: DocumentEdit) => void
  accept: (capture: SuggestionCapture) => boolean
  reject: (capture: SuggestionCapture) => boolean
} & Pick<ReturnType<typeof useSentenceEditor>, 'failures' | 'retry'>
type Review =
  | { kind: 'suggestion', record: SentenceRecord & { status: 'suggestion' } }
  | { kind: 'failure', record: SentenceRecord, failure: Props['failures'][number] }
type Selection = { id: string, version: number, kind: Review['kind'] } | null
const sync = Annotation.define<boolean>()
const setReviews = StateEffect.define<readonly Review[]>()
const select = StateEffect.define<Selection>()
// Split only on LF: retaining CR characters keeps canonical UTF-16 offsets exact.
const plainText = (text: string) => Text.of(text.split('\n'))

function reviewsFor({ state, failures }: Props): Review[] {
  const byId = new Map(failures.map(failure => [failure.sentence.id, failure]))
  const reviews: Review[] = []
  for (const record of state.sentences) {
    if (record.status === 'suggestion') reviews.push({ kind: 'suggestion', record })
    else {
      const failure = byId.get(record.id)
      if (record.status === 'idle' && failure?.sentence.version === record.version &&
        failure.sentence.text === record.text) reviews.push({ kind: 'failure', record, failure })
    }
  }
  return reviews
}

export default function SentenceEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const latest = useRef(props)
  latest.current = props

  useLayoutEffect(() => {
    const reviews = StateField.define<readonly Review[]>({
      create: () => reviewsFor(latest.current),
      update(value, transaction) {
        for (const effect of transaction.effects) if (effect.is(setReviews)) return effect.value
        // Never leave stale marks available between a keystroke and React's render.
        return transaction.docChanged ? [] : value
      },
      provide: field => EditorView.decorations.from(field, items => Decoration.set(
        items.map(({ kind, record }) => Decoration.mark({
          class: kind === 'failure' ? 'sentence-failure' : 'sentence-highlight',
          attributes: { 'data-sentence-id': record.id,
            ...(kind === 'failure' ? { title: 'Check failed — retry available' } : {}) },
        }).range(record.start, record.end)),
      )),
    })
    const selection = StateField.define<Selection>({
      create: () => null,
      update(value, transaction) {
        for (const effect of transaction.effects) if (effect.is(select)) value = effect.value
        // Records are briefly cleared during editing, so validate against the latest
        // canonical records once they arrive, not against that intermediate empty set.
        const updated = transaction.effects.find(effect => effect.is(setReviews))
        if (updated && value && !updated.value.some(({ kind, record }) => record.id === value.id &&
          record.version === value.version && kind === value.kind)) return null
        return value
      },
    })
    function selected(state: EditorState) {
      const capture = state.field(selection)
      return state.field(reviews).find(({ kind, record }) => record.id === capture?.id &&
        record.version === capture.version && kind === capture.kind)
    }
    function open(view: EditorView, { kind, record }: Review) {
      view.dispatch({ effects: select.of({ id: record.id, version: record.version, kind }) })
    }
    function makeTooltip(state: EditorState): Tooltip | null {
      const review = selected(state)
      if (!review) return null
      const { record } = review
      let sections: [string, string, string][]
      let controls: [string, string, () => boolean][]
      if (review.kind === 'failure') {
        sections = [
          ['Sentence', record.text, 'comparison-original'],
          ['Check failed', `${review.failure.message} This sentence remains unchecked.`, 'comparison-failure'],
        ]
        controls = [['Retry', 'button-primary', () => { latest.current.retry(review.failure.sentence); return true }]]
      } else {
        const capture: SuggestionCapture = {
          id: record.id, version: record.version, text: record.text, suggestion: review.record.suggestion,
        }
        sections = [
          ['Original', capture.text, 'comparison-original'],
          ['Suggested', capture.suggestion, 'comparison-suggested'],
        ]
        controls = [
          ['Accept suggestion', 'button-primary', () => latest.current.accept(capture)],
          ['Reject suggestion', 'button-secondary', () => latest.current.reject(capture)],
        ]
      }
      return {
        pos: record.start, end: record.end, above: false, arrow: true,
        create(view) {
          const dom = document.createElement('section')
          dom.className = 'suggestion-comparison'
          dom.setAttribute('role', 'dialog')
          dom.setAttribute('aria-label', review.kind === 'failure' ? 'Sentence check failed' : 'Sentence comparison')
          const closeButton = document.createElement('button')
          closeButton.type = 'button'
          closeButton.className = 'comparison-close'
          closeButton.setAttribute('aria-label', review.kind === 'failure' ? 'Close failure details' : 'Close comparison')
          closeButton.textContent = '×'
          for (const [heading, text, className] of sections) {
            const label = dom.appendChild(document.createElement('h4'))
            label.textContent = heading
            const paragraph = dom.appendChild(document.createElement('p'))
            paragraph.className = className
            paragraph.textContent = text
          }
          function close() {
            view.dispatch({ effects: select.of(null) })
            view.focus()
          }
          const actions = dom.appendChild(document.createElement('div'))
          actions.className = 'comparison-actions'
          for (const [label, className, action] of controls) {
            const button = actions.appendChild(document.createElement('button'))
            button.type = 'button'
            button.className = className
            button.textContent = label
            button.onclick = () => { if (action()) close() }
          }
          closeButton.onclick = close
          dom.appendChild(closeButton)
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
        if (value && before && after && before.record.id === after.record.id &&
          before.record.version === after.record.version && before.record.text === after.record.text &&
          ((before.kind === 'suggestion' && after.kind === 'suggestion' && before.record.suggestion === after.record.suggestion) ||
            (before.kind === 'failure' && after.kind === 'failure' && before.failure.message === after.failure.message))) {
          // Keep the same create function so unrelated results and shifted offsets
          // do not recreate the card or steal focus from its controls.
          return before.record.start === after.record.start && before.record.end === after.record.end ? value :
            { ...value, pos: after.record.start, end: after.record.end }
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
          history(), reviews, selection, tooltip,
          keymap.of([
            { key: 'Alt-Enter', run(view) {
              const review = view.state.field(reviews).find(({ record }) =>
                record.start <= view.state.selection.main.head && record.end >= view.state.selection.main.head)
              if (!review) return false
              open(view, review)
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
              const review = view.state.field(reviews).find(({ record }) => record.id === id)
              if (review) open(view, review)
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
    const { document } = props.state
    const changed = view.state.doc.toString() !== document.text
    // Accepted suggestions use the canonical explicit range, not a full-document
    // replacement: selection mapping and a single undo event are preserved.
    const edit = document.edit
    const changes = changed ? (edit &&
      view.state.doc.toString().slice(0, edit.start) + edit.insertedText + view.state.doc.toString().slice(edit.end) === document.text
      ? { from: edit.start, to: edit.end, insert: plainText(edit.insertedText) }
      : { from: 0, to: view.state.doc.length, insert: plainText(document.text) }) : undefined
    view.dispatch({ changes, effects: setReviews.of(reviewsFor(props)),
      annotations: changed ? [sync.of(true), isolateHistory.of('full')] : [] })
  }, [props.state, props.failures])

  return <div className="writing-editor" ref={host} />
}
