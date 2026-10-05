// One id per app visit (browser tab session), sent with every journey request
// so the events of a visit can be grouped.
let memory: string | null = null

export function getSessionId(): string {
  try {
    const stored = sessionStorage.getItem('tt.session')
    if (stored) return stored
    const fresh = crypto.randomUUID()
    sessionStorage.setItem('tt.session', fresh)
    return fresh
  } catch {
    // Storage blocked: fall back to an id that lasts until the page reloads.
    memory ??= crypto.randomUUID()
    return memory
  }
}
