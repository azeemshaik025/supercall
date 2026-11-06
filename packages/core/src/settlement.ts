import { CALL_FEE_RATE, DEFINITIVE_FEE_RATE, PLATFORM_FEE_RATE } from './fees.ts'
import type { Copy, Fund, Levels, NeedHistory, WorkedCopy, WrongCopy } from './types.ts'

export function mirrorFee(sizeUsd: number) {
  const platform = sizeUsd * PLATFORM_FEE_RATE
  const pot = sizeUsd * CALL_FEE_RATE
  return { platform, pot, total: platform + pot }
}

export function pnlAt(sizeUsd: number, entryFill: number, price: number): number {
  const coin = (sizeUsd * (1 - PLATFORM_FEE_RATE) * (1 - DEFINITIVE_FEE_RATE)) / entryFill
  return coin * price * (1 - DEFINITIVE_FEE_RATE) - sizeUsd
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

const CREDIT_SHARE = 0.3
const MAX_DRAW = 0.5
const NEED_FADE = 0.9
const SHARE_FLOOR = 0.1

const creditAsk = (loss: number, fee: number, weight: number) =>
  Math.max(0, CREDIT_SHARE * weight * loss - fee)

export function needIfStopped(call: Levels, copies: Copy[]): number {
  const stop = call.stop
  if (stop === undefined) return 0
  return sum(copies.map((c) => creditAsk(-pnlAt(c.size, c.entryFill, stop), c.fee, c.weight)))
}

export function nextNeed(history: NeedHistory, need: number): NeedHistory {
  return {
    total: NEED_FADE * history.total + need,
    count: NEED_FADE * history.count + 1,
  }
}

export function shareFor(superFactor: number): number {
  return Math.max(SHARE_FLOOR, 0.7 * (superFactor / 100) ** 1.5)
}

export function maxBoost(superFactor: number): number {
  const minSuperFactor = 70
  if (superFactor < minSuperFactor) return 0
  return Math.max(0, shareFor(superFactor) - SHARE_FLOOR)
}

export function settleWorked(
  copies: WorkedCopy[],
  caller: { superFactor: number; boost: number; fund: Fund; limit: number },
  ending: 'won' | 'above-entry',
) {
  const kept = copies.map((c) => Math.max(0, Math.min(c.fee, c.profit / 2)))
  const keptBy = (credit: boolean) =>
    sum(kept.filter((_, i) => copies[i]?.paidWithCredit === credit))
  const cash = keptBy(false)
  const share = shareFor(caller.superFactor) * (ending === 'won' ? 1 : 0.5)
  const boost = ending === 'won' ? cash * Math.min(caller.boost, maxBoost(caller.superFactor)) : 0
  const cut = cash * share - boost
  const rest = cash - cash * share
  const toFund = Math.min(rest, Math.max(0, caller.limit - caller.fund.earned))
  const overflow = rest - toFund
  return {
    copies: copies.map((c, i) => {
      const k = kept[i] ?? 0
      return {
        kept: k,
        back: c.fee - k,
        boostCredit: !c.paidWithCredit && cash > 0 ? (boost * k) / cash : 0,
      }
    }),
    cut,
    boost,
    toFund,
    overflow,
    toCaller: cut + overflow,
    fund: {
      earned: caller.fund.earned + toFund,
      creditOnly: caller.fund.creditOnly + keptBy(true),
    },
  }
}

export function settleWrong(call: Levels, endPrice: number, copies: WrongCopy[], fund: Fund) {
  const stop = call.stop
  const rows = copies.map((c) => {
    const back = { feeBack: c.fee, platformBack: c.size * PLATFORM_FEE_RATE }
    if (c.exit === 'moved-out') return { ...back, loss: undefined, ask: 0 }
    const atStop = stop === undefined ? Infinity : -pnlAt(c.size, c.entryFill, stop)
    const loss = Math.min(c.exit?.soldLoss ?? -pnlAt(c.size, c.entryFill, endPrice), atStop)
    return { ...back, loss, ask: stop === undefined ? 0 : creditAsk(loss, c.fee, c.weight) }
  })
  const asked = sum(rows.map((r) => r.ask))
  const paid = Math.min(asked, MAX_DRAW * (fund.earned + fund.creditOnly))
  const scale = asked > 0 ? paid / asked : 0
  const fromCreditOnly = Math.min(paid, fund.creditOnly)
  return {
    copies: rows.map((row) => ({ ...row, credit: row.ask * scale })),
    asked,
    paid,
    fund: {
      earned: fund.earned - (paid - fromCreditOnly),
      creditOnly: fund.creditOnly - fromCreditOnly,
    },
  }
}
