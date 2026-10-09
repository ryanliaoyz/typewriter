import type { SentenceDocumentState } from './document/sentences'

export default function DebugInspector({ state }: { state: SentenceDocumentState }) {
  const completeCount = state.sentences.filter((sentence) => sentence.complete).length
  const edit = state.document.edit

  return (
    <details className="debug-inspector">
      <summary>Debug state</summary>
      <p>Read-only, live editor state. Development only; nothing is persisted or sent to a server.</p>
      <dl className="debug-counts">
        <div><dt>Document length (UTF-16 units)</dt><dd>{state.document.text.length}</dd></div>
        <div><dt>Sentences</dt><dd>{state.sentences.length}</dd></div>
        <div><dt>Complete</dt><dd>{completeCount}</dd></div>
        <div><dt>Incomplete</dt><dd>{state.sentences.length - completeCount}</dd></div>
      </dl>
      <p>
        Ranges use UTF-16 units and are end-exclusive: [start, end). Sentence ranges refer to
        the current document. Text is JSON-escaped to expose whitespace.
      </p>
      <p>
        Complete means eligible for future scheduling, not checked or grammatically correct.
        Idle means unchecked; clean means checked without a correction; suggestion means a
        correction is cached. No model checks are run yet.
      </p>
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
        <p>One inferred replacement in the previous document, not an edit history.</p>
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
