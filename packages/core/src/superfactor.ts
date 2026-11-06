import type { Ending, Levels, Score } from './types.ts'

export const SF = {
  fade: 0.98,
  /** Weight a new caller starts with at a score of zero, so a few calls can't swing them far. */
  prior: 30,
  cap: 3,
  unfired: -0.1,
  void: -1,
} as const

/**
 * How copied volume weighs a call. Each wallet's filled copies count up to about `soft` dollars,
 * smoothly; a wallet counts `trustFloor` until it has copied `trustCallers` other callers; a call
 * weighs √(volume / base), never less than 1; losses weigh `lossWeight` times as much.
 */
export const VOLUME = {
  soft: 10_000,
  base: 10_000,
  trustFloor: 0.25,
  trustCallers: 10,
  lossWeight: 2,
} as const

export function callScore(call: Levels, ending: Ending): number {
  if (ending === 'unfired') return SF.unfired
  if (ending === 'void') return SF.void
  const sign = call.direction === 'long' ? 1 : -1
  const reward = sign * (call.target - call.entry)
  const risk = call.stop === undefined ? reward : sign * (call.entry - call.stop)
  const r = reward / risk
  const a = Math.min(1, SF.cap / r)
  const b = Math.min(r, SF.cap)
  if (ending === 'won') return b
  if (ending === 'lost') return -a
  const fromStop = (sign * (ending.price - call.entry) + risk) / (risk + reward)
  return -a + (a + b) * Math.min(1, Math.max(0, fromStop))
}

/**
 * How much one wallet's copying counts, from 25% to 100%. It reaches full trust after copying
 * calls from 10 distinct callers other than the one being scored, so fresh or self-made wallets
 * add little weight to a caller's calls.
 */
export function walletTrust(otherCallers: number): number {
  const n = Math.max(0, Math.floor(otherCallers))
  return Math.min(1, VOLUME.trustFloor + ((1 - VOLUME.trustFloor) * n) / VOLUME.trustCallers)
}

/** One wallet's filled copies on a call, in dollars, after the smooth cap. */
export const walletVolume = (filledUsd: number) =>
  filledUsd > 0 ? VOLUME.soft * (1 - Math.exp(-filledUsd / VOLUME.soft)) : 0

/**
 * A call's volume for scoring: each wallet's filled copies (summed per wallet first), smoothly
 * capped and scaled by that wallet's trust.
 */
export const callVolume = (wallets: { filledUsd: number; trust: number }[]) =>
  wallets.reduce(
    (total, w) => total + Math.min(1, Math.max(0, w.trust)) * walletVolume(w.filledUsd),
    0,
  )

/** How much a call counts toward SuperFactor: √(volume / base), at least 1; losses count double. */
export function callWeight(volume: number, score: number): number {
  const w = Math.sqrt(Math.max(volume, VOLUME.base) / VOLUME.base)
  return score < 0 ? w * VOLUME.lossWeight : w
}

/** Adds one call to a caller's score. Older calls fade by 2% per call. */
export const nextScore = (prev: Score, s: number, weight = 1): Score => ({
  S: SF.fade * prev.S + weight * s,
  W: SF.fade * prev.W + weight,
})

/** 0 to 100, starting at 50. Smooth at both ends, so a big win or loss always moves it. */
export const superFactor = ({ S, W }: Score) => 50 + 50 * Math.tanh(S / (W + SF.prior))
