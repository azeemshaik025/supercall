import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rajsCall } from '../fixtures/calls'
import type { Answer, Post } from './lookup'
import { createQueue } from './queue'

const raj = (id: string): Post => ({ id, author: 'synthetic_raj' })

// The background script, faked at the message edge: it answers by how often a post was asked.
function fakeLookup(answer: (postId: string, asked: number) => Answer) {
  const batches: Post[][] = []
  const asked = new Map<string, number>()
  const lookup = async (posts: Post[]) => {
    batches.push(posts)
    for (const { id } of posts) asked.set(id, (asked.get(id) ?? 0) + 1)
    return Object.fromEntries(posts.map(({ id }) => [id, answer(id, asked.get(id) ?? 0)]))
  }
  return { lookup, batches }
}

function queueOn(fake: ReturnType<typeof fakeLookup>) {
  const answered: [string, Answer][] = []
  const ask = createQueue(fake.lookup, (id, answer) => answered.push([id, answer]))
  return { ask, answered }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('queue', () => {
  it('sends the 12 posts that load together as one lookup', async () => {
    const fake = fakeLookup((postId) => ({ kind: 'not-a-caller', postId }))
    const { ask } = queueOn(fake)
    const posts = Array.from({ length: 12 }, (_, i) =>
      raj(`18500000000000000${String(i + 1).padStart(2, '0')}`),
    )
    for (const post of posts) ask(post)
    await vi.advanceTimersByTimeAsync(250)
    expect(fake.batches).toEqual([posts])
  })

  it('asks about "not read yet" again 15 s later and hands on the call it became', async () => {
    // Priya scrolls past Raj's post 2 s after he posts it, before our server has read it.
    const fake = fakeLookup((postId, asked) =>
      asked === 1 ? { kind: 'not-read-yet', postId } : { kind: 'call', postId, call: rajsCall },
    )
    const { ask, answered } = queueOn(fake)
    ask(raj('1850000000000000001'))
    await vi.advanceTimersByTimeAsync(250)
    expect(answered).toEqual([])
    await vi.advanceTimersByTimeAsync(15_250)
    expect(answered).toEqual([
      ['1850000000000000001', { kind: 'call', postId: '1850000000000000001', call: rajsCall }],
    ])
  })

  it('stops asking about "not read yet" after 4 more tries', async () => {
    const fake = fakeLookup((postId) => ({ kind: 'not-read-yet', postId }))
    const { ask, answered } = queueOn(fake)
    ask(raj('1850000000000000001'))
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(fake.batches).toHaveLength(5)
    expect(answered).toEqual([])
  })
})
