import type { CallStatus, CallType, Direction, Levels } from './types.ts'

export const MIN_TARGET_DISTANCE = 0.01
export const ENTRY_BAND = 0.005
export const MAX_SUGGESTED_STOP = 0.1

export function isCopyable(entry: number, target: number) {
  return Math.abs(target - entry) / entry >= MIN_TARGET_DISTANCE
}

export function isInEntryBand(currentPrice: number, entry: number) {
  return Math.abs(currentPrice - entry) / entry <= ENTRY_BAND
}

export function suggestedStop({ direction, entry, target }: Omit<Levels, 'stop'>): number {
  const most = entry * MAX_SUGGESTED_STOP
  return direction === 'long'
    ? Math.max(entry - (target - entry), entry - most)
    : Math.min(entry + (entry - target), entry + most)
}

export function inBand(call: { entry: number; bandPct: number }, price: number): boolean {
  return Math.abs(price - call.entry) / call.entry <= call.bandPct
}

export function riskPct(call: { entry: number; stop: number }): number {
  return Math.abs(call.entry - call.stop) / call.entry
}

export function rewardPct(call: { entry: number; target: number }): number {
  return Math.abs(call.target - call.entry) / call.entry
}

export function rewardRisk(call: { entry: number; stop: number; target: number }): number {
  return rewardPct(call) / riskPct(call)
}

export function targetOdds(call: { entry: number; stop: number; target: number }): number {
  const r = riskPct(call)
  const w = rewardPct(call)
  return r + w > 0 ? r / (r + w) : 0
}

export function canMirror(
  call: {
    type: CallType
    status: CallStatus
    direction: Direction
    entry: number
    target: number
    bandPct: number
    price: number
    /** The deadline (ISO): a call past it is over, whatever its status says until it settles. */
    expiresAt?: string
  },
  now = Date.now(),
): boolean {
  if (call.expiresAt && Date.parse(call.expiresAt) <= now) return false
  if (rewardPct(call) < MIN_TARGET_DISTANCE) return false
  if (call.type === 'future-level') {
    const waiting = call.direction === 'long' ? call.price > call.entry : call.price < call.entry
    return call.status === 'armed' && waiting
  }
  return (call.status === 'armed' || call.status === 'live') && inBand(call, call.price)
}
