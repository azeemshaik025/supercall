// The Supercall site's sign-in, shared with the extension. The site keeps Privy's access token in
// its own storage; a script on the site hands it to the extension, which sends it to the API as
// the site does. The token is short-lived and the site renews it while it's open.

/** Privy's access token: `privy:token`, or `privy:<client id>:token` for an app client. */
const TOKEN_KEY = /^privy:(?:[^:]+:)?token$/

/** When a token stops working, in unix seconds, or 0 if it can't be read. */
export function expiresAt(token: string): number {
  try {
    const payload = token.split('.')[1] ?? ''
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp : 0
  } catch {
    return 0
  }
}

/** The site's current access token, or null when signed out or expired. */
export function readSession(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
  now = Date.now() / 1000,
): string | null {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key || !TOKEN_KEY.test(key)) continue
    const raw = storage.getItem(key)
    if (!raw) continue
    // Privy stores it as JSON: a quoted string.
    let token = raw
    try {
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed === 'string') token = parsed
    } catch {}
    if (expiresAt(token) > now) return token
  }
  return null
}

export const SESSION_KEY = 'session:token'
