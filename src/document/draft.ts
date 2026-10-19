import type { RejectedOccurrence } from './sentences'

const LEGACY_DRAFT_KEY = 'typewriter:draft'
const DRAFT_KEY_PREFIX = 'typewriter:draft:'
const SNAPSHOT_KEY_PREFIX = 'typewriter:snapshot:'
const SAVED_AT_PREFIX = 'typewriter:saved:'
const TAB_ID_KEY = 'typewriter:tab'
const LOCK_PREFIX = 'typewriter:tab:'
const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000
const PREVIEW_LENGTH = 60

export type DraftSummary = { readonly id: string, readonly preview: string }
export type DraftSnapshot = { readonly text: string, readonly rejected: readonly RejectedOccurrence[] }
/** `savedAt` is the epoch time of the draft's last successful save, if recorded. */
export type OpenedDraft = DraftSnapshot & { readonly savedAt: number | null }

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

/** Legacy text-only key, still readable; new saves use typewriter:snapshot:<ID>. */
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

function readSnapshot(tabId: string): DraftSnapshot | null {
  const storage = window.localStorage
  const serialized = storage.getItem(`${SNAPSHOT_KEY_PREFIX}${tabId}`)
  if (serialized !== null) {
    try {
      const value = JSON.parse(serialized) as { schema?: unknown, text?: unknown, rejected?: unknown }
      if (value?.schema === 1 && typeof value.text === 'string') {
        const text = value.text
        const rejected = Array.isArray(value.rejected) ? value.rejected.filter(
          (marker): marker is RejectedOccurrence => typeof marker === 'object' && marker !== null &&
            Number.isInteger(marker.start) && marker.start >= 0 && Number.isInteger(marker.end) &&
            marker.end > marker.start && typeof marker.text === 'string' &&
            text.slice(marker.start, marker.end) === marker.text,
        ) : []
        return { text, rejected }
      }
    } catch {
      // A damaged snapshot may still have a legacy text draft to recover.
    }
  }
  const text = storage.getItem(draftKey(tabId))
  return text === null ? null : { text, rejected: [] }
}

/** Restore text and validated rejection markers, including old text-only drafts. */
export function readDraft(): DraftSnapshot {
  const newTab = readTabId() === null
  const key = draftStorageKey()
  try {
    const storage = window.localStorage
    // The first new tab adopts the single draft saved before drafts were per tab.
    const legacy = newTab ? storage.getItem(LEGACY_DRAFT_KEY) : null
    if (legacy !== null) {
      storage.setItem(key, legacy)
      storage.removeItem(LEGACY_DRAFT_KEY)
      return { text: legacy, rejected: [] }
    }
    return readSnapshot(currentTabId()) ?? { text: '', rejected: [] }
  } catch {
    // Unavailable browser storage must not prevent editing.
    return { text: '', rejected: [] }
  }
}

/** Read current text and rejections at each save, independently of typing cadence. */
export function startDraftAutosave(readDraftState: () => DraftSnapshot, onSave?: (savedAt: number) => void): DraftSession {
  let tabId = currentTabId()
  let savedId = tabId
  const serialize = (snapshot: DraftSnapshot) => JSON.stringify({ schema: 1, ...snapshot })
  let savedSnapshot = serialize(readDraftState())
  let stopped = false
  void claimTabId(tabId).then((claimed) => { tabId = claimed })

  /** True when nothing is left unsaved. */
  function flush(): boolean {
    const snapshot = serialize(readDraftState())
    // A forked tab saves its copied text under its new key even without edits.
    if (tabId === savedId && snapshot === savedSnapshot) return true
    try {
      // Empty text is a saved deletion, not a missing draft.
      window.localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${tabId}`, snapshot)
      savedId = tabId
      savedSnapshot = snapshot
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
        const ids = new Set<string>()
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index)
          const prefix = [DRAFT_KEY_PREFIX, SNAPSHOT_KEY_PREFIX].find((prefix) => key?.startsWith(prefix))
          if (key && prefix) ids.add(key.slice(prefix.length))
        }
        for (const id of ids) {
          const text = readSnapshot(id)?.text
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
      let snapshot: DraftSnapshot | null = null
      try {
        snapshot = readSnapshot(id)
      } catch {
        // Treated as unavailable below.
      }
      // Never switch away from changes that could not be saved.
      if (stopped || snapshot === null || !flush()) {
        releaseLock(id)
        return null
      }
      const previous = tabId
      writeTabId(id)
      tabId = savedId = id
      savedSnapshot = serialize(snapshot)
      claims.set(id, Promise.resolve(id))
      // The previous draft stays saved and becomes available to other tabs.
      releaseLock(previous)
      return { ...snapshot, savedAt: readSavedAt(id) }
    },
  }
}
