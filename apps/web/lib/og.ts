// The call card as an image: /og/call?… draws it from URL params at 1200×630, the size X,
// Telegram and WhatsApp use for link previews. The same params everywhere: the review before
// publishing, the call page's og:image, and so the post on X.

export interface CallImageParams {
  asset: string
  /** Coin name when it differs from the symbol. */
  name?: string
  logo?: string | null
  direction: 'long' | 'short'
  entry: number
  stop: number
  target: number
  /** ISO time the call was made: shown on the card. */
  createdAt: string
  caller: string
  /** The caller's picture (their linked X avatar). */
  avatar?: string | null
  superFactor: number
  supercall?: boolean
}

export function callImagePath(p: CallImageParams): string {
  const q = new URLSearchParams({
    asset: p.asset,
    dir: p.direction,
    entry: String(p.entry),
    stop: String(p.stop),
    target: String(p.target),
    at: p.createdAt,
    caller: p.caller,
    sf: String(Math.round(p.superFactor)),
  })
  if (p.name && p.name !== p.asset) q.set('name', p.name)
  if (p.logo) q.set('logo', p.logo)
  if (p.avatar) q.set('avatar', p.avatar)
  if (p.supercall) q.set('supercall', '1')
  return `/og/call?${q}`
}
