import { vi } from 'vitest'

/** Read either storage generation without interpreting legacy prose as JSON. */
export function savedDraftText(legacyKey: string): string | null {
  const snapshot = localStorage.getItem(legacyKey.replace('typewriter:draft:', 'typewriter:snapshot:'))
  return snapshot === null ? localStorage.getItem(legacyKey) : JSON.parse(snapshot).text
}

/** Fail the next draft snapshot write as if storage were full; other writes proceed. */
export function failNextSnapshotWrite() {
  const setItem = Storage.prototype.setItem
  let failed = false
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (!failed && key.startsWith('typewriter:snapshot:')) {
      failed = true
      throw new DOMException('Storage full', 'QuotaExceededError')
    }
    setItem.call(this, key, value)
  })
}
