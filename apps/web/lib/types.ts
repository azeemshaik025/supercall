/** Frontend shapes. They move to @supercall/api-schema once the API defines them. */

export type Asset = 'ETH' | 'cbBTC' | 'AERO' | 'DEGEN' | 'VIRTUAL'

export type CallStatus =
  | 'posted'
  | 'armed'
  | 'live'
  | 'won'
  | 'lost'
  | 'expired-profit'
  | 'expired-loss'
  | 'unfired'
  | 'void'

/** One bar; `t` is its open time in ms. */
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number }

export type Call = {
  id: string
  asset: Asset
  long: boolean
  caller: string
  entry: number
  stop: number
  target: number
  /** Last traded price. */
  price: number
  /** Copying is open while price is within this fraction of entry. */
  band: number
  status: CallStatus
  createdAt: string
  expiresAt: string
  copiedUsd: number
  copiers: number
  opposedUsd: number
  supercall: boolean
  boosted: boolean
  thesis: string
  arkivKey: string
  filledAt?: string
  fillPrice?: number
  /** Final move for ended calls, as a fraction of entry. */
  result?: number
}

export type Outcome = 'W' | 'L'

export type Caller = {
  handle: string
  name: string
  xHandle: string
  verified: boolean
  superFactor: number
  lastTen: Outcome[]
  callCount: number
  earnedUsd: number
  followersNetUsd: number
  followersProfitablePct: number
  fundUsd: number
  joinedAt: string
}

export type Copier = { who: string; sizeUsd: number; pnlUsd: number; ago: string }

export type Position = { id: string; callId: string; sizeUsd: number; boughtAt: number; at: string }

export type Settled = {
  id: string
  callId: string
  boughtAt?: string
  soldAt?: string
  sizeUsd: number
  note: string
  pnlUsd: number
}

export type Market = {
  symbol: Asset
  name: string
  price: number
  change24h: number
  impact1k: number
  liquidityUsd: number
}

export type Notice = { id: string; title: string; when: string; href: string }

export type Me = {
  handle: string
  address: string
  balance: number
  verified: boolean
  xHandle: string
  superFactor: number
  earnedUsd: number
  fundUsd: number
}
