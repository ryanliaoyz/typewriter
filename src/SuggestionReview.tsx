import { Fragment, useId, useRef, useState } from 'react'
import type { SentenceDocumentState, SentenceRecord, SuggestionCapture } from './document/sentences'

type Props = {
  state: SentenceDocumentState
  accept: (capture: SuggestionCapture) => boolean
  reject: (capture: SuggestionCapture) => boolean
  focusEditor: () => void
}

export default function SuggestionReview({ state, accept, reject, focusEditor }: Props) {
  const [selection, setSelection] = useState<Pick<SentenceRecord, 'id' | 'version'> | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const headingId = useId()
  const panelId = useId()
  const panelHeadingId = useId()
  const selected = state.sentences.find((sentence) =>
    sentence.id === selection?.id && sentence.version === selection.version && sentence.status === 'suggestion',
  )
  // Clear invalid selections permanently, including when that occurrence later gets a result.
  if (selection && !selected) setSelection(null)

  const suggestions = state.sentences.filter((sentence) => sentence.status === 'suggestion')

  function close() {
    setSelection(null)
    trigger.current?.focus()
  }

  function act(action: Props['accept']) {
    if (selected?.status !== 'suggestion') return
    if (action({ id: selected.id, version: selected.version, text: selected.text, suggestion: selected.suggestion })) {
      setSelection(null)
      focusEditor()
    }
  }

  return (
    <section className="suggestion-review" aria-labelledby={headingId}>
      <h2 id={headingId}>Suggestion review</h2>
      {suggestions.length === 0 ? (
        <p>No suggestions to review.</p>
      ) : (
        <div className="review-document" aria-label="Document with suggestions">
          {suggestions.map((sentence, index) => (
            <Fragment key={sentence.id}>
              {state.document.text.slice(index === 0 ? 0 : suggestions[index - 1].end, sentence.start)}
              <button
                type="button"
                className="sentence-highlight"
                aria-expanded={selected?.id === sentence.id}
                aria-controls={selected?.id === sentence.id ? panelId : undefined}
                onClick={(event) => {
                  trigger.current = event.currentTarget
                  setSelection({ id: sentence.id, version: sentence.version })
                }}
              >{sentence.text}</button>
            </Fragment>
          ))}
          {state.document.text.slice(suggestions[suggestions.length - 1].end)}
        </div>
      )}
      {selected && (
        <section id={panelId} className="suggestion-comparison" aria-labelledby={panelHeadingId}>
          <h3 id={panelHeadingId}>Sentence comparison</h3>
          <h4>Original</h4>
          <p>{selected.text}</p>
          <h4>Suggested</h4>
          <p>{selected.suggestion}</p>
          <button type="button" onClick={() => act(accept)}>Accept suggestion</button>{' '}
          <button type="button" onClick={() => act(reject)}>Reject suggestion</button>{' '}
          <button type="button" onClick={close}>Close comparison</button>
        </section>
      )}
    </section>
  )
}
