import DebugInspector from './DebugInspector'
import SuggestionReview from './SuggestionReview'
import { useSentenceEditor } from './checking/useSentenceEditor'

export default function App() {
  const { state, updateText, failures, retry } = useSentenceEditor()

  return (
    <main>
      <h1>Typewriter</h1>
      <p>A local-first grammar editor, in development. Completed sentences are checked with your configured Ollama server.</p>
      <p>Compare suggestions below your draft. Accept and reject controls are coming next. Your writing is never automatically replaced.</p>
      {failures.map(({ sentence, message }) => (
        <div role="alert" key={sentence.id}>
          <p>{sentence.text}</p>
          <p>{message} This sentence remains unchecked.</p>
          <button type="button" onClick={() => retry(sentence)}>Retry</button>
        </div>
      ))}
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
      {import.meta.env.DEV && <DebugInspector state={state} />}
    </main>
  )
}
