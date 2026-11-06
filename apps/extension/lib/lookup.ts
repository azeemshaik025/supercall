import {
  type callResponse,
  type PostAnswer,
  postAnswer,
  type postLookupRequest,
  postLookupResponse,
} from '@supercall/api-schema'
import { z } from 'zod'

const route = '/post-lookups'

// stopSuggested and supercall are optional on the API; the card reads a missing one as false.
export type Call = z.infer<typeof callResponse>
export type Answer = PostAnswer
// The author, as the page shows it without the "@", lets the server tell "not read yet" from
// "not a caller".
export type Post = z.infer<typeof postLookupRequest>['posts'][number]

const perRequest = 50
// A call's status and bands move; the other answers never change for a post.
const callTtl = 60_000
const moves = (a: Answer) => a.kind === 'call' || a.kind === 'close'
const cached = z.object({ answer: postAnswer, at: z.number() })

type Storage = {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

export function createLookup({
  api,
  fetch,
  storage,
  now = Date.now,
}: {
  api: string
  fetch: (url: string, init: RequestInit) => Promise<Response>
  storage: Storage
  now?: () => number
}) {
  const key = (id: string) => `post:${id}`

  async function ask(posts: Post[]) {
    const res = await fetch(`${api}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ posts }),
    })
    if (!res.ok) throw new Error(`Post lookup failed: ${res.status}`)
    const { answers } = postLookupResponse.parse(await res.json())
    const kept = answers.filter((a) => a.kind !== 'not-read-yet')
    await storage.set(
      Object.fromEntries(kept.map((a) => [key(a.postId), { answer: a, at: now() }])),
    )
    return answers
  }

  return async function lookup(posts: Post[]): Promise<Record<string, Answer>> {
    const stored = await storage.get(posts.map(({ id }) => key(id)))
    const answers: Record<string, Answer> = {}
    const missing: Post[] = []
    for (const post of posts) {
      const hit = cached.safeParse(stored[key(post.id)])
      const fresh = hit.success && (!moves(hit.data.answer) || now() - hit.data.at < callTtl)
      if (fresh) answers[post.id] = hit.data.answer
      else missing.push(post)
    }
    const requests = []
    for (let i = 0; i < missing.length; i += perRequest)
      requests.push(ask(missing.slice(i, i + perRequest)))
    for (const got of await Promise.all(requests)) for (const a of got) answers[a.postId] = a
    return answers
  }
}
