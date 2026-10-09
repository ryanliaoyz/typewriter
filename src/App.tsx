import { useState } from 'react'
import DebugInspector from './DebugInspector'
import { createSentenceDocument, updateSentenceDocument } from './document/sentences'

export default function App() {
  const [state, setState] = useState(() => createSentenceDocument())

  return (
    <main>
      <h1>Typewriter</h1>
      <p>A local-first grammar editor, in development. Grammar checking is not available yet.</p>
      <label htmlFor="document">Your writing</label>
      <p id="document-help">Write or paste plain text. Your draft stays in this page until you reload.</p>
      <textarea
        id="document"
        aria-describedby="document-help"
        value={state.document.text}
        onChange={(event) => {
          const text = event.currentTarget.value
          setState((previous) => updateSentenceDocument(previous, text))
        }}
        spellCheck={false}
      />
      {import.meta.env.DEV && <DebugInspector state={state} />}
    </main>
  )
}
