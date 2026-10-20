import { useEffect, useId, useRef, useState } from 'react'
import type { DraftSummary, SaveStatus } from './document/draft'

type Props = {
  saveStatus: SaveStatus
  model: string
  listDrafts: () => Promise<DraftSummary[]>
  openDraft: (id: string) => Promise<boolean>
  removeDraft: (id: string) => Promise<boolean>
}

// Shown when there is no value yet; Latency is not wired to live data.
const NONE = '—'

/** Time of day for saves today; earlier saves also name the date. */
export function formatSaveTime(savedAt: number, now = Date.now()): string {
  const saved = new Date(savedAt)
  const sameDay = saved.toDateString() === new Date(now).toDateString()
  return saved.toLocaleString(undefined, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AppNav({ saveStatus, model, listDrafts, openDraft, removeDraft }: Props) {
  // The list opens while it loads, so it can be dismissed before the drafts arrive.
  const [drafts, setDrafts] = useState<readonly DraftSummary[] | 'loading' | null>(null)
  // Bumped whenever the list is dismissed, so a slower listing cannot reopen it.
  const request = useRef(0)
  const container = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const open = drafts !== null

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent): void {
      if (!container.current?.contains(event.target as Node)) dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  async function show(): Promise<void> {
    const ticket = ++request.current
    setDrafts((current) => current === null ? 'loading' : current)
    const list = await listDrafts()
    if (ticket === request.current) setDrafts(list)
  }

  function dismiss(): void {
    request.current++
    setDrafts(null)
  }

  function close(): void {
    dismiss()
    toggle.current?.focus()
  }

  async function choose(id: string): Promise<void> {
    const ticket = request.current
    const opened = await openDraft(id)
    if (ticket !== request.current) return
    // Another tab may have opened it meanwhile; refresh instead of closing.
    if (opened) close()
    else await show()
  }

  async function remove({ id, preview }: DraftSummary): Promise<void> {
    if (!window.confirm(`Delete the draft “${preview}”? This cannot be undone.`)) return
    const ticket = request.current
    await removeDraft(id)
    if (ticket === request.current) await show()
  }

  return (
    <nav className="app-nav" aria-label="Document">
      <span className="nav-item">Last save <span className="nav-value" aria-live="polite">
        {saveStatus.failed ? (
          <span className="nav-error" title="Browser storage is full or unavailable. Your changes stay in this tab, and saving retries automatically.">
            Not saved
          </span>
        ) : saveStatus.savedAt === null ? NONE : (
          <time dateTime={new Date(saveStatus.savedAt).toISOString()}>{formatSaveTime(saveStatus.savedAt)}</time>
        )}
      </span></span>
      <div className="nav-open" ref={container}
        onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); close() } }}>
        <button type="button" ref={toggle} aria-expanded={open} aria-controls={menuId}
          onClick={() => { if (open) dismiss(); else void show() }}>
          Open
        </button>
        {open && (
          <div className="nav-drafts" id={menuId} role="group" aria-label="Saved drafts">
            {drafts === 'loading' ? <p>Loading drafts…</p> : drafts.length === 0 ? <p>No other saved drafts.</p> : (
              <ul>
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <button type="button" onClick={() => void choose(draft.id)}>{draft.preview}</button>
                    <button type="button" className="nav-delete" aria-label={`Delete draft: ${draft.preview}`}
                      title="Delete draft" onClick={() => void remove(draft)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <span className="nav-item nav-model">Model <span className="nav-value">{model}</span></span>
      <span className="nav-item">Latency <span className="nav-value">{NONE}</span></span>
    </nav>
  )
}
