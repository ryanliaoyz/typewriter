import type { RejectedOccurrence } from './sentences'

const LEGACY_DRAFT_KEY = 'typewriter:draft'
const DRAFT_KEY_PREFIX = 'typewriter:draft:'
const SNAPSHOT_KEY_PREFIX = 'typewriter:snapshot:'
const SAVED_AT_PREFIX = 'typewriter:saved:'
const PREVIEW_PREFIX = 'typewriter:preview:'
const LEASE_PREFIX = 'typewriter:lease:'
const DRAFT_PREFIXES = [DRAFT_KEY_PREFIX, SNAPSHOT_KEY_PREFIX, SAVED_AT_PREFIX, PREVIEW_PREFIX, LEASE_PREFIX]
const TAB_ID_KEY = 'typewriter:tab'
const LOCK_PREFIX = 'typewriter:tab:'
const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000
// Without Web Locks, an open tab renews its lease at every save attempt and tick.
const LEASE_TTL_MS = 2 * AUTOSAVE_INTERVAL_MS + 60_000
const PREVIEW_LENGTH = 60

export type DraftSummary = { readonly id: string, readonly preview: string }
export type DraftSnapshot = { readonly text: string, readonly rejected: readonly RejectedOccurrence[] }
/** `savedAt` is the epoch time of the draft's last successful save, if recorded. */
export type OpenedDraft = DraftSnapshot & { readonly savedAt: number | null }
/** `failed` means the latest save attempt did not reach storage. */
export type SaveStatus = { readonly savedAt: number | null, readonly failed: boolean }

/** One tab's autosave lifecycle; `open` switches the tab to another saved draft. */
export type DraftSession = {
  stop(): void
  list(): Promise<DraftSummary[]>
  /** `apply` publishes the opened draft before later saves are compared with it. */
  open(id: string, apply: (draft: OpenedDraft) => void): Promise<boolean>
  remove(id: string): Promise<boolean>
}

type Lease = { readonly owner: string, readonly at: number }

// Used only when sessionStorage cannot hold the tab ID; drafts then last one page load.
let memoryTabId: string | null = null
// Set when the pre-per-tab draft could not be moved; the next successful save moves it.
let pendingLegacy = false
const pageToken = randomId()
const locks = new Map<string, { granted: Promise<boolean>, release: () => void }>()
const claims = new Map<string, Promise<string>>()

function randomId(): string {
  // getRandomValues, unlike randomUUID, also works outside secure contexts.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const serialize = (snapshot: DraftSnapshot) => JSON.stringify({ schema: 1, ...snapshot })

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
  const id = randomId()
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

function readLease(tabId: string): Lease | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(`${LEASE_PREFIX}${tabId}`) ?? 'null') as Partial<Lease> | null
    return typeof value?.owner === 'string' && typeof value.at === 'number' ? { owner: value.owner, at: value.at } : null
  } catch {
    return null
  }
}

/** Another page renewed this draft's lease recently; a crashed page's lease expires. */
function leasedElsewhere(tabId: string): boolean {
  const lease = readLease(tabId)
  return lease !== null && lease.owner !== pageToken && Date.now() - lease.at < LEASE_TTL_MS
}

function renewLease(tabId: string): void {
  try {
    window.localStorage.setItem(`${LEASE_PREFIX}${tabId}`, JSON.stringify({ owner: pageToken, at: Date.now() }))
  } catch {
    // Storage that cannot hold a lease cannot hold a draft either.
  }
}

function dropLease(tabId: string): void {
  try {
    if (readLease(tabId)?.owner === pageToken) window.localStorage.removeItem(`${LEASE_PREFIX}${tabId}`)
  } catch {
    // An unremoved lease expires.
  }
}

/**
 * Hold a draft ID for the page lifetime: a Web Lock where available (secure
 * contexts), otherwise a renewed localStorage lease.
 */
function tryLock(tabId: string): Promise<boolean> {
  const existing = locks.get(tabId)
  if (existing) return existing.granted
  const entry = { granted: Promise.resolve(true), release: () => dropLease(tabId) }
  if (!navigator.locks) {
    if (leasedElsewhere(tabId)) return Promise.resolve(false)
    renewLease(tabId)
  } else {
    entry.release = () => {}
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
    if (navigator.locks) {
      for (const { name } of (await navigator.locks.query()).held ?? []) {
        if (name?.startsWith(LOCK_PREFIX)) held.add(name.slice(LOCK_PREFIX.length))
      }
    } else {
      for (const id of storedDraftIds()) if (leasedElsewhere(id)) held.add(id)
    }
  } catch {
    // Without lock state, every other saved draft is listed.
  }
  return held
}

function storedDraftIds(): Set<string> {
  const storage = window.localStorage
  const ids = new Set<string>()
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    const prefix = DRAFT_PREFIXES.find((candidate) => key?.startsWith(candidate))
    if (key && prefix) ids.add(key.slice(prefix.length))
  }
  return ids
}

function removeDraftKeys(tabId: string): void {
  for (const prefix of DRAFT_PREFIXES) window.localStorage.removeItem(`${prefix}${tabId}`)
}

function previewOf(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim())?.trim().replace(/\s+/g, ' ') ?? ''
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH - 1)}…` : line
}

/** Stored preview, or one derived from a draft saved before previews were stored; null if none. */
function readPreview(tabId: string): string | null {
  const preview = window.localStorage.getItem(`${PREVIEW_PREFIX}${tabId}`)
  if (preview !== null) return preview
  const snapshot = readSnapshot(tabId)
  return snapshot === null ? null : previewOf(snapshot.text)
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
        ).map(({ start, end, text }) => ({ start, end, text })) : []
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
  try {
    const storage = window.localStorage
    const tabId = currentTabId()
    const own = readSnapshot(tabId)
    if (own) return own
    // A tab without its own draft adopts the single draft saved before drafts were per tab.
    const legacy = storage.getItem(LEGACY_DRAFT_KEY)
    if (legacy === null) return { text: '', rejected: [] }
    const snapshot = { text: legacy, rejected: [] }
    try {
      storage.setItem(`${SNAPSHOT_KEY_PREFIX}${tabId}`, serialize(snapshot))
      storage.removeItem(LEGACY_DRAFT_KEY)
    } catch {
      // Keep the old key until this tab's next successful save, so a reload can retry.
      pendingLegacy = true
    }
    return snapshot
  } catch {
    // Unavailable browser storage must not prevent editing.
    return { text: '', rejected: [] }
  }
}

/** Read current text and rejections at each save, independently of typing cadence. */
export function startDraftAutosave(
  readDraftState: () => DraftSnapshot,
  onStatus?: (status: SaveStatus) => void,
): DraftSession {
  let tabId = currentTabId()
  let savedId = tabId
  // An unmoved legacy draft compares unequal to anything, so the next flush saves it.
  let savedSnapshot = pendingLegacy ? '' : serialize(readDraftState())
  let savedPreview: string | null = null
  let status: SaveStatus = { savedAt: readSavedAt(tabId), failed: false }
  let stopped = false
  // Set from pagehide until pageshow: the visibilitychange that follows pagehide must
  // not renew the lease just released.
  let leaving = false

  function report(next: SaveStatus): void {
    if (next.savedAt === status.savedAt && next.failed === status.failed) return
    status = next
    onStatus?.(next)
  }

  /** Move to another ID, keeping the current text to save under it at the next flush. */
  function fork(id: string): void {
    tabId = id
    savedPreview = null
    report({ savedAt: null, failed: status.failed })
  }

  // Opening a draft waits for this, so a late fork cannot move the tab off it.
  const ready = claimTabId(tabId).then((claimed) => { if (claimed !== tabId) fork(claimed) })

  /** Without Web Locks, never write a draft that another page has taken over. */
  function ensureOwned(): void {
    if (navigator.locks) return
    if (leasedElsewhere(tabId)) {
      fork(assignTabId())
      void claimTabId(tabId)
    } else if (!leaving) renewLease(tabId)
  }

  /** True when nothing is left unsaved. */
  function flush(): boolean {
    ensureOwned()
    const draft = readDraftState()
    const snapshot = serialize(draft)
    // A forked tab saves its copied text under its new key even without edits.
    if (tabId === savedId && snapshot === savedSnapshot) return true
    try {
      // Empty text is a saved deletion, not a missing draft.
      window.localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${tabId}`, snapshot)
    } catch {
      // Leave changes pending so the next interval or page hide can retry.
      report({ savedAt: status.savedAt, failed: true })
      return false
    }
    savedId = tabId
    savedSnapshot = snapshot
    const savedAt = Date.now()
    try {
      const storage = window.localStorage
      const preview = previewOf(draft.text)
      if (preview !== savedPreview) storage.setItem(`${PREVIEW_PREFIX}${tabId}`, preview)
      savedPreview = preview
      storage.setItem(`${SAVED_AT_PREFIX}${tabId}`, String(savedAt))
      // The snapshot supersedes this tab's old text-only key.
      storage.removeItem(draftKey(tabId))
      if (pendingLegacy) {
        storage.removeItem(LEGACY_DRAFT_KEY)
        pendingLegacy = false
      }
    } catch {
      // The draft is saved; only its metadata is incomplete.
    }
    report({ savedAt, failed: false })
    return true
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flush()
  }

  function onPageHide(): void {
    flush()
    // A reload reclaims the same ID; a page restored from the back/forward cache renews it.
    leaving = true
    if (!navigator.locks) dropLease(tabId)
  }

  function onPageShow(event: PageTransitionEvent): void {
    leaving = false
    if (event.persisted) ensureOwned()
  }

  const interval = window.setInterval(flush, AUTOSAVE_INTERVAL_MS)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    stop() {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    },

    /**
     * Saved, non-blank drafts other than this tab's that no open tab holds. Blank
     * and orphaned entries are removed while listing.
     */
    async list() {
      await ready
      const held = await heldTabIds()
      const drafts: DraftSummary[] = []
      try {
        const storage = window.localStorage
        for (const id of storedDraftIds()) {
          if (id === tabId || held.has(id)) continue
          const preview = readPreview(id)
          if (!preview) {
            removeDraftKeys(id)
            continue
          }
          if (storage.getItem(`${SNAPSHOT_KEY_PREFIX}${id}`) !== null) storage.removeItem(draftKey(id))
          drafts.push({ id, preview })
        }
      } catch {
        // Unavailable storage has no drafts to offer.
      }
      return drafts.sort((a, b) => a.preview.localeCompare(b.preview))
    },

    /** Save this draft, then make `id` this tab's draft; false if it is unavailable. */
    async open(id, apply) {
      await ready
      if (stopped || id === tabId || !(await tryLock(id))) return false
      let snapshot: DraftSnapshot | null = null
      try {
        snapshot = readSnapshot(id)
      } catch {
        // Treated as unavailable below.
      }
      // Never switch away from changes that could not be saved.
      if (stopped || snapshot === null || !flush()) {
        releaseLock(id)
        return false
      }
      const previous = tabId
      writeTabId(id)
      tabId = savedId = id
      savedPreview = null
      claims.set(id, Promise.resolve(id))
      // The previous draft stays saved and becomes available to other tabs.
      releaseLock(previous)
      const savedAt = readSavedAt(id)
      apply({ ...snapshot, savedAt })
      // Compare later saves with what the editor restored, not the stored markers.
      savedSnapshot = serialize(readDraftState())
      report({ savedAt, failed: false })
      return true
    },

    /** Permanently delete another saved draft that no open tab holds. */
    async remove(id) {
      await ready
      if (id === tabId || !(await tryLock(id))) return false
      try {
        removeDraftKeys(id)
        return true
      } catch {
        return false
      } finally {
        releaseLock(id)
      }
    },
  }
}
