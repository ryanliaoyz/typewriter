import { useEffect, useId, useRef, useState } from 'react'
import type { DraftSummary } from './document/draft'

type Props = {
  listDrafts: () => Promise<DraftSummary[]>
  openDraft: (id: string) => Promise<boolean>
}

// Not wired to live data yet.
const IDLE = '—'

export default function AppNav({ listDrafts, openDraft }: Props) {
  const [drafts, setDrafts] = useState<readonly DraftSummary[] | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const open = drafts !== null

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent): void {
      if (!container.current?.contains(event.target as Node)) setDrafts(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  async function show(): Promise<void> {
    setDrafts(await listDrafts())
  }

  function close(): void {
    setDrafts(null)
    toggle.current?.focus()
  }

  async function choose(id: string): Promise<void> {
    // Another tab may have opened it meanwhile; refresh instead of closing.
    if (await openDraft(id)) close()
    else await show()
  }

  return (
    <nav className="app-nav" aria-label="Document">
      <span className="nav-item">Last save <span className="nav-value">{IDLE}</span></span>
      <div className="nav-open" ref={container}
        onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); close() } }}>
        <button type="button" ref={toggle} aria-expanded={open} aria-controls={menuId}
          onClick={() => { if (open) setDrafts(null); else void show() }}>
          Open
        </button>
        {open && (
          <div className="nav-drafts" id={menuId} role="group" aria-label="Saved drafts">
            {drafts.length === 0 ? <p>No other saved drafts.</p> : (
              <ul>
                {drafts.map(({ id, preview }) => (
                  <li key={id}><button type="button" onClick={() => void choose(id)}>{preview}</button></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <span className="nav-item">Model <span className="nav-value">{IDLE}</span></span>
      <span className="nav-item">Latency <span className="nav-value">{IDLE}</span></span>
    </nav>
  )
}
