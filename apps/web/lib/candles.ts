import type { Candle } from './types'

/** Deterministic candles that drift from `from` to `to`, for dummy charts. */
export function makeCandles(seed: number, count: number, from: number, to: number, wiggle = 0.012): Candle[] {
  const out: Candle[] = []
  let prev = from
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const trend = from + (to - from) * t
    const noise = Math.sin(i * 0.9 + seed) * wiggle + Math.cos(i * 0.37 + seed * 2) * wiggle * 0.6
    const c = i === count - 1 ? to : trend * (1 + noise)
    const o = prev
    const span = Math.abs(c - o) + trend * wiggle * (0.3 + Math.abs(Math.sin(i * 2.3 + seed)) * 0.7)
    out.push({
      o,
      c,
      h: Math.max(o, c) + span * 0.4,
      l: Math.min(o, c) - span * 0.35,
      v: 40 + Math.abs(Math.sin(i * 1.3 + seed)) * 60,
    })
    prev = c
  }
  return out
}
