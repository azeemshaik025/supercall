// A stand-in for POST /post-lookups on the API's default port, to see every kind of card on real
// X before posts are read. By a post id's last digit: 5 gets Raj's call, 0 the suggested-stop call,
// 7 a close, 3 "not a call", the rest "not a caller". Each request is logged, to show the batching.
import { createServer } from 'node:http'
import { rajsCall, suggestedStopCall } from '../fixtures/calls'
import type { Answer, Post } from '../lib/lookup'

const byDigit: Record<string, (postId: string) => Answer> = {
  5: (postId) => ({ kind: 'call', postId, call: rajsCall }),
  0: (postId) => ({ kind: 'call', postId, call: suggestedStopCall }),
  7: (postId) => ({
    kind: 'close',
    postId,
    call: { ...rajsCall, status: 'expired-profit' },
    at: '2026-10-27T15:00:00.000Z',
    price: 3250,
  }),
  3: (postId) => ({
    kind: 'not-a-call',
    postId,
    reason: 'no-deadline',
    detail: 'The post names no deadline.',
  }),
}
const answer = (postId: string): Answer =>
  byDigit[postId.at(-1) ?? '']?.(postId) ?? { kind: 'not-a-caller', postId }

createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/post-lookups') {
    res.writeHead(404).end()
    return
  }
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    const posts: Post[] = JSON.parse(body).posts
    const answers = posts.map(({ id }) => answer(id))
    const shown = answers.filter((a) => a.kind !== 'not-a-caller').length
    const authors = new Set(posts.map((p) => p.author)).size
    const time = new Date().toLocaleTimeString()
    console.log(`${time} lookup: ${posts.length} posts by ${authors} authors, ${shown} to show`)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ answers }))
  })
}).listen(8787, () => console.log('Fake lookup on http://localhost:8787/post-lookups'))
