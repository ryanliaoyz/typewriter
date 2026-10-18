import DebugInspector from './DebugInspector'
import SentenceEditor from './SentenceEditor'
import { useSentenceEditor } from './checking/useSentenceEditor'

export default function App() {
  const { state, updateText, failures, retry, accept, reject } = useSentenceEditor()

  return (
    <main>
      <h1>Typewriter</h1>
      <SentenceEditor state={state} updateText={updateText} accept={accept} reject={reject} />
      {import.meta.env.DEV && <DebugInspector state={state} failures={failures} retry={retry} />}
    </main>
  )
}
