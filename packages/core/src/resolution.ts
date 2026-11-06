import type { CallStatus, CallType, Levels, Resolution, Swap } from './types.ts'

type Resolvable = Levels & {
  type: CallType
  createdAt: string
  expiresAt: string
  priceAtPost: number
}

export function resolve(
  call: Resolvable,
  swaps: Swap[],
  now: string,
  close?: Swap,
): Resolution | undefined {
  const closed = close && Date.parse(close.at) <= Date.parse(call.expiresAt) ? close : undefined
  const end = Date.parse(closed?.at ?? call.expiresAt)
  const sign = call.direction === 'long' ? 1 : -1
  const past = (a: number, b: number) => sign * (a - b) >= 0
  let entered = call.type === 'open'
  const side = Math.sign(call.priceAtPost - call.entry)
  let last: Swap | undefined
  for (const s of swaps) {
    if (Date.parse(s.at) > end) break
    entered ||= side * (s.price - call.entry) <= 0
    if (!entered) continue
    if (past(s.price, call.target)) return { ending: 'won', ...s }
    if (call.stop !== undefined && past(call.stop, s.price)) return { ending: 'lost', ...s }
    last = s
  }
  if (Date.parse(now) < end) return undefined
  if (!entered) return { ending: 'unfired' }
  const { at, price, ref } = closed ?? {
    at: call.expiresAt,
    price: last?.price ?? call.entry,
    ref: last?.ref,
  }
  const above = sign * (price - call.entry) > 0
  return {
    ending: (above ? 'expired-profit' : 'expired-loss') as Extract<
      CallStatus,
      'expired-profit' | 'expired-loss'
    >,
    at,
    price,
    ref,
  }
}
