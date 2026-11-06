import type { Ending, Levels, Score } from './types.ts'

export const SF = {
  fade: 0.98,
  prior: 10,
  cap: 3,
  unfired: -0.1,
  void: -1,
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

export const nextScore = (prev: Score, s: number): Score => ({
  S: SF.fade * prev.S + s,
  W: SF.fade * prev.W + 1,
})

export const superFactor = ({ S, W }: Score) =>
  50 + 50 * Math.max(-1, Math.min(1, S / (W + SF.prior)))
