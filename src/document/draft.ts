const LEGACY_DRAFT_KEY = 'typewriter:draft'
const DRAFT_KEY_PREFIX = 'typewriter:draft:'
const TAB_ID_KEY = 'typewriter:tab'
const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000

// Used only when sessionStorage cannot hold the tab ID; drafts then last one page load.
let memoryTabId: string | null = null
const claims = new Map<string, Promise<string>>()

function readTabId(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_ID_KEY) ?? memoryTabId
  } catch {
    return memoryTabId
  }
}

function assignTabId(): string {
  // getRandomValues, unlike randomUUID, also works outside secure contexts.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
  try {
    window.sessionStorage.setItem(TAB_ID_KEY, id)
  } catch {
    memoryTabId = id
  }
  return id
}

function draftKey(tabId: string): string {
  return `${DRAFT_KEY_PREFIX}${tabId}`
}

/** Each tab is its own session: sessionStorage keeps its ID across reloads only. */
export function draftStorageKey(): string {
  return draftKey(readTabId() ?? assignTabId())
}

/**
 * Hold the tab ID for the page lifetime. A duplicated tab inherits a copy of
 * sessionStorage, finds the ID held, and forks to a new one with its copied text.
 */
function claimTabId(tabId: string): Promise<string> {
  let claim = claims.get(tabId)
  if (claim) return claim
  claim = new Promise<string>((resolve) => {
    if (!navigator.locks) {
      resolve(tabId)
      return
    }
    navigator.locks.request(`typewriter:tab:${tabId}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(claimTabId(assignTabId()))
        return
      }
      resolve(tabId)
      return new Promise<never>(() => {})
    }).catch(() => resolve(tabId))
  })
  claims.set(tabId, claim)
  return claim
}

/** Restore this tab's canonical text; sentence records are rebuilt for this session. */
export function readDraft(): string {
  const newTab = readTabId() === null
  const key = draftStorageKey()
  try {
    const storage = window.localStorage
    // The first new tab adopts the single draft saved before drafts were per tab.
    const legacy = newTab ? storage.getItem(LEGACY_DRAFT_KEY) : null
    if (legacy !== null) {
      storage.setItem(key, legacy)
      storage.removeItem(LEGACY_DRAFT_KEY)
      return legacy
    }
    return storage.getItem(key) ?? ''
  } catch {
    // Unavailable browser storage must not prevent editing.
    return ''
  }
}

/** Read the latest canonical text at each save, independently of typing cadence. */
export function startDraftAutosave(readText: () => string): () => void {
  let key = draftStorageKey()
  let savedKey = key
  let savedText = readText()
  void claimTabId(key.slice(DRAFT_KEY_PREFIX.length)).then((tabId) => { key = draftKey(tabId) })

  function flush(): void {
    const text = readText()
    // A forked tab saves its copied text under its new key even without edits.
    if (key === savedKey && text === savedText) return
    try {
      // Empty text is a saved deletion, not a missing draft.
      window.localStorage.setItem(key, text)
      savedKey = key
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
