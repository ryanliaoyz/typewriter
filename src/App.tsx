import DebugInspector from './DebugInspector'
import { useSentenceEditor } from './checking/useSentenceEditor'

export default function App() {
  const { state, updateText, error } = useSentenceEditor()

  return (
    <main>
      <h1>Typewriter</h1>
      <p>A local-first grammar editor, in development. Completed sentences are checked with your configured Ollama server.</p>
      <p>Corrections are cached for now; review controls are not available yet. Your writing is never automatically replaced.</p>
      {error && <p role="alert">{error} Failed sentences remain unchecked. After fixing setup, reload and paste your draft again to retry; save it before reloading.</p>}
      <label htmlFor="document">Your writing</label>
      <p id="document-help">Write or paste plain text. Your draft stays in this page until you reload.</p>
      <textarea
        id="document"
        aria-describedby="document-help"
        value={state.document.text}
        onChange={(event) => updateText(event.currentTarget.value)}
        spellCheck={false}
      />
      {import.meta.env.DEV && <DebugInspector state={state} />}
    </main>
  )
}
