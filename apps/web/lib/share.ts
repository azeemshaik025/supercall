// Sharing a call: its link, and a ready post for X. The link's preview is the call card
// (app/og/call), so the post carries no image of its own.
import { price } from './format'

export const callLink = (id: string) => `${window.location.origin}/c/${id}`

type Levels = {
  id: string
  asset: string
  direction: 'long' | 'short'
  entry: number
  stop: number
  target: number
}

export const postOnX = (call: Levels) =>
  `https://x.com/intent/post?${new URLSearchParams({
    text: `${call.direction === 'long' ? 'Long' : 'Short'} ${call.asset} · entry ${price(call.entry)}, stop ${price(call.stop)}, target ${price(call.target)}. Copy it on Supercall:`,
    url: callLink(call.id),
  })}`
