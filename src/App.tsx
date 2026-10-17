import DebugInspector from './DebugInspector'
import SuggestionReview from './SuggestionReview'
import { useSentenceEditor } from './checking/useSentenceEditor'

export default function App() {
  const { state, updateText, failures, retry } = useSentenceEditor()

  return (
    <main>
      <h1>Typewriter</h1>
      <label htmlFor="document">Your writing</label>
      <p id="document-help">Write or paste plain text. Your draft stays in this page until you reload.</p>
      <textarea
        id="document"
        aria-describedby="document-help"
        value={state.document.text}
        onChange={(event) => updateText(event.currentTarget.value)}
        spellCheck={false}
      />
      <SuggestionReview state={state} />
      {import.meta.env.DEV && <DebugInspector state={state} failures={failures} retry={retry} />}
    </main>
  )
}
