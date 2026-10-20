import type { SentenceDocumentState } from './document/sentences'
import { useState } from 'react'
import type { Failure } from './checking/useSentenceEditor'
import type { SentenceCheck } from './checking/queue'

type Props = {
  state: SentenceDocumentState
  failures?: readonly Failure[]
  retry?: (sentence: SentenceCheck) => boolean
}

function ResponseDetails({ details }: { details: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {' '}<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide response' : 'Show response'}
      </button>
      {open && <div className="debug-response"><code>{details}</code></div>}
    </>
  )
}

export default function DebugInspector({ state, failures = [], retry }: Props) {
  const completeCount = state.sentences.filter((sentence) => sentence.complete).length
  const edit = state.document.edit

  return (
    <details className="debug-inspector">
      <summary>Debug state</summary>
      {failures.map(({ sentence, message, details }) => (
        <div role="alert" key={sentence.id}>
          <p>{sentence.text}</p>
          <p>{message} This sentence remains unchecked.</p>
          <button type="button" onClick={() => retry?.(sentence)}>Retry</button>
          {details && <ResponseDetails key={`${sentence.id}:${sentence.version}`} details={details} />}
        </div>
      ))}
      <dl className="debug-counts">
        <div><dt>Document length (UTF-16 units)</dt><dd>{state.document.text.length}</dd></div>
        <div><dt>Sentences</dt><dd>{state.sentences.length}</dd></div>
        <div><dt>Complete</dt><dd>{completeCount}</dd></div>
        <div><dt>Incomplete</dt><dd>{state.sentences.length - completeCount}</dd></div>
      </dl>
      {state.sentences.length === 0 ? (
        <p>No sentence records.</p>
      ) : (
        <div className="debug-table-scroll" role="region" aria-label="Sentence records" tabIndex={0}>
          <table>
            <caption>Current sentence records</caption>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Version</th>
                <th scope="col">Range</th>
                <th scope="col">Text (JSON)</th>
                <th scope="col">Complete</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.sentences.map((sentence) => (
                <tr key={sentence.id}>
                  <th scope="row">{sentence.id}</th>
                  <td>{sentence.version}</td>
                  <td><code>[{sentence.start}, {sentence.end})</code></td>
                  <td className="debug-sentence-text"><code>{JSON.stringify(sentence.text)}</code></td>
                  <td>{String(sentence.complete)}</td>
                  <td>{sentence.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section aria-labelledby="debug-edit-heading">
        <h2 id="debug-edit-heading">Latest edit</h2>
        {edit === null ? (
          <p>No edit in the latest transition.</p>
        ) : (
          <dl>
            <dt>Previous range</dt><dd><code>[{edit.start}, {edit.end})</code></dd>
            <dt>Inserted text (JSON)</dt><dd><code>{JSON.stringify(edit.insertedText)}</code></dd>
          </dl>
        )}
      </section>
      <details>
        <summary>Raw state JSON</summary>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </details>
    </details>
  )
}
