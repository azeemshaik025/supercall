export type Direction = 'long' | 'short'

export type CallType = 'future-level' | 'open'

export type CallStatus =
  | 'pending'
  | 'armed'
  | 'live'
  | 'won'
  | 'lost'
  | 'expired-profit'
  | 'expired-loss'
  | 'unfired'
  | 'void'

export type Band = 'low' | 'medium' | 'high' | 'superhigh'

export type Outcome = 'W' | 'L' | 'E'

export type Levels = {
  entry: number
  stop?: number
  target: number
  direction: Direction
}

export type Fund = {
  earned: number
  creditOnly: number
}

export type NeedHistory = {
  total: number
  count: number
}

export type Copy = {
  size: number
  entryFill: number
  fee: number
  paidWithCredit: boolean
  weight: number
}

export type WrongCopy = Copy & {
  exit?: { soldLoss: number } | 'moved-out'
}

export type WorkedCopy = {
  fee: number
  paidWithCredit: boolean
  profit: number
}

export type Swap = { at: string; price: number; ref: string }

export type Resolution =
  | { ending: 'unfired' }
  | { ending: 'void'; at: string }
  | {
      ending: Extract<CallStatus, 'won' | 'lost' | 'expired-profit' | 'expired-loss'>
      at: string
      price: number
      ref?: string
    }

export type Ending = 'won' | 'lost' | 'unfired' | 'void' | { price: number }

export type Score = {
  S: number
  W: number
}

export interface Caller {
  handle: string
  displayName: string
  xHandle: string
  verified: boolean
  superFactor: number
  lastTen: Outcome[]
  callCount: number
  poolUsd: number
  earnedUsd: number
  returnedToFollowersUsd: number
  followersNetUsd: number
  followersProfitablePct: number
  joinedAt: string
}

export interface Call {
  id: string
  caller: string
  asset: string
  assetAddress?: string
  quote: string
  chain: string
  type: CallType
  direction: Direction
  entry: number
  bandPct: number
  stop: number
  target: number
  price: number
  status: CallStatus
  thesis: string
  createdAt: string
  entryFilledAt?: string
  expiresAt: string
  arkivKey: string
  callerTradedDuringCall?: boolean
  stopSuggested?: boolean
  supercall?: boolean
  followBand: Band
  opposeBand: Band
  shareApplied: number
  boost?: number
}
