import { describe, expect, it } from 'vitest'
import { createCallerLookup } from './caller'

const raj = {
  handle: 'synthetic_raj',
  displayName: 'Raj (synthetic)',
  xHandle: 'synthetic_raj',
  verified: true,
  superFactor: 62,
  lastTen: ['W', 'L'],
  callCount: 4,
  poolUsd: 12,
  earnedUsd: 30,
  returnedToFollowersUsd: 5,
  followersNetUsd: 40,
  followersProfitablePct: 75,
  joinedAt: '2026-10-21T00:00:00.000Z',
}

describe('createCallerLookup', () => {
  it('asks once a minute per account, in any case, and reads no caller as null', async () => {
    const asked: string[] = []
    let t = 0
    const callerOf = createCallerLookup({
      api: 'https://api.test',
      now: () => t,
      fetch: async (url) => {
        asked.push(url)
        return Response.json({ callers: url.endsWith('synthetic_raj') ? [raj] : [] })
      },
    })
    expect((await callerOf('Synthetic_Raj'))?.superFactor).toBe(62)
    expect((await callerOf('synthetic_raj'))?.handle).toBe('synthetic_raj')
    expect(await callerOf('nobody')).toBeNull()
    t = 61_000
    await callerOf('synthetic_raj')
    expect(asked).toEqual([
      'https://api.test/callers?x=synthetic_raj',
      'https://api.test/callers?x=nobody',
      'https://api.test/callers?x=synthetic_raj',
    ])
  })
})
