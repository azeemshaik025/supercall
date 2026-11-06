import type { Answer, Post } from './lookup'

// Posts that load together go out in one lookup.
const gather = 250
// Our server reads a caller's post seconds after it's published: ask again through its first minute.
const retryAfter = 15_000
const retries = 4

export type Settled = Exclude<Answer, { kind: 'not-read-yet' }>

export function createQueue(
  lookup: (posts: Post[]) => Promise<Record<string, Answer>>,
  onAnswer: (id: string, answer: Settled) => void,
) {
  let queued = new Map<string, { post: Post; tried: number }>()

  function flush() {
    const batch = queued
    queued = new Map()
    lookup([...batch.values()].map(({ post }) => post)).then(
      (answers) => {
        for (const { post, tried } of batch.values()) {
          const answer = answers[post.id]
          if (!answer) continue
          if (answer.kind !== 'not-read-yet') onAnswer(post.id, answer)
          else if (tried < retries) setTimeout(() => ask(post, tried + 1), retryAfter)
        }
      },
      (error) => console.warn('Supercall lookup failed', error),
    )
  }

  function ask(post: Post, tried = 0) {
    if (queued.size === 0) setTimeout(flush, gather)
    queued.set(post.id, { post, tried })
  }

  return (post: Post) => ask(post)
}
