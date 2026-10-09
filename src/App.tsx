import { useState } from 'react'
import { createDocument, updateDocument } from './document/document'

export default function App() {
  const [document, setDocument] = useState(() => createDocument())

  return (
    <main>
      <h1>Typewriter</h1>
      <p>A local-first grammar editor, in development. Grammar checking is not available yet.</p>
      <label htmlFor="document">Your writing</label>
      <p id="document-help">Write or paste plain text. Your draft stays in this page until you reload.</p>
      <textarea
        id="document"
        aria-describedby="document-help"
        value={document.text}
        onChange={(event) => {
          const text = event.currentTarget.value
          setDocument((previous) => updateDocument(previous, text))
        }}
        spellCheck={false}
      />
    </main>
  )
}
