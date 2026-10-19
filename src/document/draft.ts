const LEGACY_DRAFT_KEY = 'typewriter:draft'
const DRAFT_KEY_PREFIX = 'typewriter:draft:'
const SAVED_AT_PREFIX = 'typewriter:saved:'
const TAB_ID_KEY = 'typewriter:tab'
const LOCK_PREFIX = 'typewriter:tab:'
const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000
const PREVIEW_LENGTH = 60

export type DraftSummary = { readonly id: string, readonly preview: string }
/** `savedAt` is the epoch time of the draft's last successful save, if recorded. */
export type OpenedDraft = { readonly text: string, readonly savedAt: number | null }

/** One tab's autosave lifecycle; `open` switches the tab to another saved draft. */
export type DraftSession = {
  stop(): void
  list(): Promise<DraftSummary[]>
  open(id: string): Promise<OpenedDraft | null>
}

// Used only when sessionStorage cannot hold the tab ID; drafts then last one page load.
let memoryTabId: string | null = null
const locks = new Map<string, { granted: Promise<boolean>, release: () => void }>()
const claims = new Map<string, Promise<string>>()

function readTabId(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_ID_KEY) ?? memoryTabId
  } catch {
    return memoryTabId
  }
}

function writeTabId(id: string): void {
  try {
    window.sessionStorage.setItem(TAB_ID_KEY, id)
  } catch {
    memoryTabId = id
  }
}

function assignTabId(): string {
  // getRandomValues, unlike randomUUID, also works outside secure contexts.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
  writeTabId(id)
  return id
}

function draftKey(tabId: string): string {
  return `${DRAFT_KEY_PREFIX}${tabId}`
}

function currentTabId(): string {
  return readTabId() ?? assignTabId()
}

/** Each tab is its own session: sessionStorage keeps its ID across reloads only. */
export function draftStorageKey(): string {
  return draftKey(currentTabId())
}

function readSavedAt(tabId: string): number | null {
  try {
    const value = window.localStorage.getItem(`${SAVED_AT_PREFIX}${tabId}`)
    const time = value === null ? NaN : Number(value)
    return Number.isFinite(time) ? time : null
  } catch {
    return null
  }
}

/** When this tab's draft was last saved; null for an unsaved or pre-timestamp draft. */
export function readDraftSavedAt(): number | null {
  return readSavedAt(currentTabId())
}

/** Hold a draft ID's Web Lock for the page lifetime; without Web Locks, assume it. */
function tryLock(tabId: string): Promise<boolean> {
  const existing = locks.get(tabId)
  if (existing) return existing.granted
  const entry = { granted: Promise.resolve(true), release: () => {} }
  if (navigator.locks) {
    entry.granted = new Promise<boolean>((resolve) => {
      navigator.locks.request(`${LOCK_PREFIX}${tabId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          locks.delete(tabId)
          resolve(false)
          return
        }
        resolve(true)
        return new Promise<void>((done) => { entry.release = done })
      }).catch(() => resolve(true))
    })
  }
  locks.set(tabId, entry)
  return entry.granted
}

function releaseLock(tabId: string): void {
  locks.get(tabId)?.release()
  locks.delete(tabId)
  claims.delete(tabId)
}

/**
 * A duplicated tab inherits a copy of sessionStorage, finds its ID held, and
 * forks to a new one with its copied text.
 */
function claimTabId(tabId: string): Promise<string> {
  let claim = claims.get(tabId)
  if (!claim) {
    claim = tryLock(tabId).then((granted) => granted ? tabId : claimTabId(assignTabId()))
    claims.set(tabId, claim)
  }
  return claim
}

async function heldTabIds(): Promise<Set<string>> {
  const held = new Set<string>()
  try {
    for (const { name } of (await navigator.locks?.query())?.held ?? []) {
      if (name?.startsWith(LOCK_PREFIX)) held.add(name.slice(LOCK_PREFIX.length))
    }
  } catch {
    // Without lock state, every other saved draft is listed.
  }
  return held
}

function previewOf(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim())?.trim().replace(/\s+/g, ' ') ?? ''
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH - 1)}…` : line
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
export function startDraftAutosave(readText: () => string, onSave?: (savedAt: number) => void): DraftSession {
  let tabId = currentTabId()
  let savedId = tabId
  let savedText = readText()
  let stopped = false
  void claimTabId(tabId).then((claimed) => { tabId = claimed })

  /** True when nothing is left unsaved. */
  function flush(): boolean {
    const text = readText()
    // A forked tab saves its copied text under its new key even without edits.
    if (tabId === savedId && text === savedText) return true
    try {
      // Empty text is a saved deletion, not a missing draft.
      window.localStorage.setItem(draftKey(tabId), text)
      savedId = tabId
      savedText = text
    } catch {
      // Leave changes pending so the next interval or page hide can retry.
      return false
    }
    const savedAt = Date.now()
    try {
      window.localStorage.setItem(`${SAVED_AT_PREFIX}${tabId}`, String(savedAt))
    } catch {
      // The draft is saved; only its time is not recorded for later sessions.
    }
    onSave?.(savedAt)
    return true
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flush()
  }

  const interval = window.setInterval(flush, AUTOSAVE_INTERVAL_MS)
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    stop() {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    },

    /** Saved, non-empty drafts other than this tab's that no open tab holds. */
    async list() {
      const held = await heldTabIds()
      const drafts: DraftSummary[] = []
      try {
        const storage = window.localStorage
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index)
          if (!key?.startsWith(DRAFT_KEY_PREFIX)) continue
          const id = key.slice(DRAFT_KEY_PREFIX.length)
          const text = storage.getItem(key)
          if (id === tabId || held.has(id) || !text?.trim()) continue
          drafts.push({ id, preview: previewOf(text) })
        }
      } catch {
        // Unavailable storage has no drafts to offer.
      }
      return drafts.sort((a, b) => a.preview.localeCompare(b.preview))
    },

    /** Save this draft, then make `id` this tab's draft; null if it is unavailable. */
    async open(id) {
      if (stopped || id === tabId || !(await tryLock(id))) return null
      let text: string | null = null
      try {
        text = window.localStorage.getItem(draftKey(id))
      } catch {
        // Treated as unavailable below.
      }
      // Never switch away from changes that could not be saved.
      if (stopped || text === null || !flush()) {
        releaseLock(id)
        return null
      }
      const previous = tabId
      writeTabId(id)
      tabId = savedId = id
      savedText = text
      claims.set(id, Promise.resolve(id))
      // The previous draft stays saved and becomes available to other tabs.
      releaseLock(previous)
      return { text, savedAt: readSavedAt(id) }
    },
  }
}
