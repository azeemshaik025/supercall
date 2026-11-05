import { makeCandles } from './candles'
import * as mock from './mock/fixtures'
import type { Asset, Call, CallStatus, Candle } from './types'

/**
 * The one data module. Screens import from here, never from fixtures, so switching
 * NEXT_PUBLIC_DATA to "api" later changes nothing on screen.
 */
export const source = process.env.NEXT_PUBLIC_DATA ?? 'mock'

export const { NOW, calls, callers, markets, copiers, positions, settled, notifications, me } = mock

export const callById = (id: string) => calls.find((c) => c.id === id)
export const callerByHandle = (h: string) => callers.find((c) => c.handle === h)
export const callsBy = (h: string) => calls.filter((c) => c.caller === h)
export const marketBySymbol = (s: string) =>
  markets.find((m) => m.symbol.toLowerCase() === s.toLowerCase())
export const openCallsOn = (a: Asset) => calls.filter((c) => c.asset === a && isOpen(c.status))

export const OPEN: CallStatus[] = ['posted', 'armed', 'live']
export const ENDED: CallStatus[] = [
  'won',
  'lost',
  'expired-profit',
  'expired-loss',
  'unfired',
  'void',
]
export const isOpen = (s: CallStatus) => OPEN.includes(s)

export const statusLabel: Record<
  CallStatus,
  { label: string; tone: 'good' | 'bad' | 'warn' | 'faint' }
> = {
  posted: { label: 'Posted', tone: 'warn' },
  armed: { label: 'Open', tone: 'good' },
  live: { label: 'Live', tone: 'good' },
  won: { label: 'Target hit', tone: 'good' },
  lost: { label: 'Stop hit', tone: 'bad' },
  'expired-profit': { label: 'Ended above entry', tone: 'good' },
  'expired-loss': { label: 'Ended below entry', tone: 'bad' },
  unfired: { label: 'Never entered', tone: 'faint' },
  void: { label: 'Cancelled', tone: 'faint' },
}

/** Hourly candles from the call's entry to the current price. */
export function candlesFor(call: Call, count = 40): Candle[] {
  const seed = Number(call.id.slice(1)) * 7
  const start = call.entry * (call.long ? 0.988 : 1.012)
  return makeCandles(seed, count, start, call.price)
}

export function marketCandles(asset: Asset, count = 72): Candle[] {
  const m = marketBySymbol(asset)
  if (!m) return []
  return makeCandles(asset.length * 11, count, m.price * (1 - m.change24h * 3), m.price, 0.01)
}

export function miniCandles(call: Call): Candle[] {
  return candlesFor(call, 12)
}
