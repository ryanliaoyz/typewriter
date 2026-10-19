import AppNav from './AppNav'
import DebugInspector from './DebugInspector'
import SentenceEditor from './SentenceEditor'
import { useSentenceEditor } from './checking/useSentenceEditor'

export default function App() {
  const { state, updateText, failures, retry, accept, reject, draftId, lastSavedAt, listDrafts, openDraft, model } = useSentenceEditor()

  return (
    <main>
      <header className="app-header">
        <h1>Typewriter<span className="brand-dot" aria-hidden="true">.</span></h1>
        <AppNav lastSavedAt={lastSavedAt} model={model} listDrafts={listDrafts} openDraft={openDraft} />
      </header>
      {/* A newly opened draft gets a fresh editor, so undo cannot cross drafts. */}
      <SentenceEditor key={draftId} state={state} updateText={updateText} failures={failures} retry={retry} accept={accept} reject={reject} />
      {import.meta.env.DEV && <DebugInspector state={state} failures={failures} retry={retry} />}
    </main>
  )
}
