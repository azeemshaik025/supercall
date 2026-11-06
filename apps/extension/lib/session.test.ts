import { describe, expect, it } from 'vitest'
import { expiresAt, readSession } from './session'

const jwt = (exp: number) =>
  `${btoa('{"alg":"ES256"}')}.${btoa(JSON.stringify({ exp, sub: 'did:privy:abc' })).replace(/=+$/, '')}.sig`

const storage = (items: Record<string, string>) => {
  const keys = Object.keys(items)
  return {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => items[k] ?? null,
  }
}

describe("the site's session", () => {
  it("reads Privy's token as the site stores it, quoted", () => {
    const token = jwt(2_000)
    expect(readSession(storage({ 'privy:token': JSON.stringify(token) }), 1_000)).toBe(token)
  })

  it("reads an app client's token too", () => {
    const token = jwt(2_000)
    expect(readSession(storage({ 'privy:abc123:token': JSON.stringify(token) }), 1_000)).toBe(token)
  })

  it('is signed out without a token, or with an expired one', () => {
    expect(readSession(storage({ 'privy:refresh_token': '"x"' }), 1_000)).toBeNull()
    expect(readSession(storage({ 'privy:token': JSON.stringify(jwt(500)) }), 1_000)).toBeNull()
  })

  it("reads a token's expiry, and treats junk as already expired", () => {
    expect(expiresAt(jwt(1_234))).toBe(1_234)
    expect(expiresAt('not a token')).toBe(0)
  })
})
