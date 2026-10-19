/** Read either storage generation without interpreting legacy prose as JSON. */
export function savedDraftText(legacyKey: string): string | null {
  const snapshot = localStorage.getItem(legacyKey.replace('typewriter:draft:', 'typewriter:snapshot:'))
  return snapshot === null ? localStorage.getItem(legacyKey) : JSON.parse(snapshot).text
}
