import { HOUR, makeCandles } from './candles'
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

const floorHour = (ms: number) => Math.floor(ms / HOUR) * HOUR

/**
 * Hourly bars around a call: twelve hours before it was made, drifting to the entry, then
 * from the entry to the price now (or to the deadline for an ended call).
 */
export function candlesFor(call: Call): Candle[] {
  const seed = Number(call.id.slice(1)) * 7
  const made = floorHour(Date.parse(call.createdAt))
  const ended = !isOpen(call.status)
  const end = floorHour(Math.min(NOW.getTime(), ended ? Date.parse(call.expiresAt) : NOW.getTime()))
  const before = makeCandles(seed, 12, call.entry * (call.long ? 0.975 : 1.025), call.entry, {
    endAt: made - HOUR,
  })
  const afterCount = Math.max(2, Math.min(160, Math.round((end - made) / HOUR) + 1))
  const last =
    ended && call.result !== undefined
      ? call.entry * (1 + (call.long ? call.result : -call.result))
      : call.price
  const after = makeCandles(seed + 3, afterCount, call.entry, last, { endAt: end })
  return [...before, ...after]
}

export function marketCandles(asset: Asset, count = 90, step = HOUR): Candle[] {
  const m = marketBySymbol(asset)
  if (!m) return []
  return makeCandles(asset.length * 11, count, m.price * (1 - m.change24h * 3), m.price, {
    wiggle: 0.01,
    endAt: floorHour(NOW.getTime()),
    step,
  })
}

export function miniCandles(call: Call): Candle[] {
  return candlesFor(call).slice(-12)
}

/** The viewer's own buys and sells on a call, for chart marks. */
export function marksFor(callId: string): { kind: 'in' | 'sold'; at: string; price: number }[] {
  return [
    ...positions
      .filter((p) => p.callId === callId)
      .map((p) => ({ kind: 'in' as const, at: p.at, price: p.boughtAt })),
    ...settled
      .filter((s) => s.callId === callId && s.soldAt)
      .map((s) => ({
        kind: 'sold' as const,
        at: s.soldAt as string,
        price: callById(callId)?.price ?? 0,
      })),
  ]
}
