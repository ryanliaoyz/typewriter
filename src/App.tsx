import DebugInspector from './DebugInspector'
import { useRef } from 'react'
import SuggestionReview from './SuggestionReview'
import { useSentenceEditor } from './checking/useSentenceEditor'

export default function App() {
  const { state, updateText, failures, retry, accept, reject } = useSentenceEditor()
  const editor = useRef<HTMLTextAreaElement>(null)

  return (
    <main>
      <h1>Typewriter</h1>
      <label htmlFor="document">Your writing</label>
      <p id="document-help">Write or paste plain text. Your draft stays in this page until you reload.</p>
      <textarea
        ref={editor}
        id="document"
        aria-describedby="document-help"
        value={state.document.text}
        onChange={(event) => updateText(event.currentTarget.value)}
        spellCheck={false}
      />
      <SuggestionReview state={state} accept={accept} reject={reject} focusEditor={() => editor.current?.focus()} />
      {import.meta.env.DEV && <DebugInspector state={state} failures={failures} retry={retry} />}
    </main>
  )
}
