import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { rajsCall } from '../fixtures/calls'
import { type Answer, createLookup, type Post } from './lookup'

const raj = (id: string): Post => ({ id, author: 'synthetic_raj' })

// The API, faked at the network edge: it answers from a table, in the order asked, and records
// each request's posts.
function fakeApi(table: Record<string, unknown> = {}) {
  const requests: Post[][] = []
  const fetch = async (_url: string, init: RequestInit) => {
    const posts: Post[] = JSON.parse(String(init.body)).posts
    requests.push(posts)
    return Response.json({
      answers: posts.map(({ id }) => table[id] ?? { kind: 'not-a-caller', postId: id }),
    })
  }
  return { fetch, requests }
}

let clock = 0
const lookupWith = (api: ReturnType<typeof fakeApi>) =>
  createLookup({
    api: 'http://localhost:8787',
    fetch: api.fetch,
    storage: fakeBrowser.storage.session,
    now: () => clock,
  })

beforeEach(() => {
  fakeBrowser.reset()
  clock = 0
})

describe('lookup', () => {
  it('asks about 120 new posts, with their authors, in requests of 50, 50 and 20', async () => {
    const api = fakeApi()
    const posts = Array.from({ length: 120 }, (_, i) =>
      raj(`18500000000${String(i).padStart(8, '0')}`),
    )
    const answers = await lookupWith(api)(posts)
    expect(api.requests.map((r) => r.length)).toEqual([50, 50, 20])
    expect(api.requests[0]?.[0]).toEqual({ id: '1850000000000000000', author: 'synthetic_raj' })
    expect(Object.keys(answers)).toHaveLength(120)
  })

  it('answers "not a caller" and "not a call" from the cache', async () => {
    const notACall: Answer = {
      kind: 'not-a-call',
      postId: '1850000000000000002',
      reason: 'no-deadline',
      detail: 'The post names no deadline.',
    }
    const api = fakeApi({ '1850000000000000002': notACall })
    const lookup = lookupWith(api)
    const posts = [raj('1850000000000000001'), raj('1850000000000000002')]
    await lookup(posts)
    clock = 24 * 60 * 60 * 1000
    expect(await lookup(posts)).toEqual({
      '1850000000000000001': { kind: 'not-a-caller', postId: '1850000000000000001' },
      '1850000000000000002': notACall,
    })
    expect(api.requests).toHaveLength(1)
  })

  const call: Answer = { kind: 'call', postId: '1850000000000000001', call: rajsCall }
  const close: Answer = {
    kind: 'close',
    postId: '1850000000000000001',
    call: { ...rajsCall, status: 'expired-profit' },
    at: '2026-10-27T15:00:00.000Z',
    price: 3250,
  }
  it.each([call, close])('keeps a $kind for 60 seconds, then asks again', async (answer) => {
    const api = fakeApi({ '1850000000000000001': answer })
    const lookup = lookupWith(api)
    await lookup([raj('1850000000000000001')])
    clock = 59_999
    expect(await lookup([raj('1850000000000000001')])).toEqual({ '1850000000000000001': answer })
    expect(api.requests).toHaveLength(1)
    clock = 60_000
    await lookup([raj('1850000000000000001')])
    expect(api.requests).toHaveLength(2)
  })

  it('never caches "not read yet"', async () => {
    const api = fakeApi({
      '1850000000000000001': { kind: 'not-read-yet', postId: '1850000000000000001' },
    })
    const lookup = lookupWith(api)
    await lookup([raj('1850000000000000001')])
    await lookup([raj('1850000000000000001')])
    expect(api.requests).toHaveLength(2)
  })

  it('keeps its answers when the background script wakes from sleep', async () => {
    const api = fakeApi()
    await lookupWith(api)([raj('1850000000000000001')])
    await lookupWith(api)([raj('1850000000000000001')])
    expect(api.requests).toHaveLength(1)
  })

  it('rejects an answer that is none of the five', async () => {
    const api = fakeApi({ '1850000000000000001': { kind: 'maybe', postId: '1850000000000000001' } })
    await expect(lookupWith(api)([raj('1850000000000000001')])).rejects.toThrow()
  })
})
