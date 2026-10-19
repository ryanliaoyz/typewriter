export const DRAFT_STORAGE_KEY = 'typewriter:draft'
const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000

/** Restore canonical text; sentence records are rebuilt for this session. */
export function readDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? ''
  } catch {
    // Unavailable browser storage must not prevent editing.
    return ''
  }
}

/** Read the latest canonical text at each save, independently of typing cadence. */
export function startDraftAutosave(readText: () => string): () => void {
  let savedText = readText()

  function flush(): void {
    const text = readText()
    if (text === savedText) return
    try {
      // Empty text is a saved deletion, not a missing draft.
      window.localStorage.setItem(DRAFT_STORAGE_KEY, text)
      savedText = text
    } catch {
      // Leave changes pending so the next interval or page hide can retry.
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flush()
  }

  const interval = window.setInterval(flush, AUTOSAVE_INTERVAL_MS)
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.clearInterval(interval)
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    flush()
  }
}
