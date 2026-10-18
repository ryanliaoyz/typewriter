import DebugInspector from './DebugInspector'
import SentenceEditor from './SentenceEditor'
import { useSentenceEditor } from './checking/useSentenceEditor'

export default function App() {
  const { state, updateText, failures, retry, accept, reject } = useSentenceEditor()

  return (
    <main>
      <header className="app-header">
        <h1>Typewriter<span className="brand-dot" aria-hidden="true">.</span></h1>
      </header>
      <SentenceEditor state={state} updateText={updateText} accept={accept} reject={reject} />
      {import.meta.env.DEV && <DebugInspector state={state} failures={failures} retry={retry} />}
    </main>
  )
}
