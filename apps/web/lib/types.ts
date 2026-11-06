export type { ApiCall as Call, ApiCaller as Caller, ApiMarket as Market, ApiCandle as Candle } from './api'

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

export type Outcome = 'W' | 'L' | 'E'

export type Notice = { id: number; call: string; kind: string; what: string; price: number | null; at: string; readAt: string | null }
