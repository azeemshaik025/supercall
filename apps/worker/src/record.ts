// The settlement record from what Hisaab did to one call. It holds the call's totals only:
// followers stay off Arkiv, and each copy's amounts are in Hisaab's own `CopySettled` events.
import {
  type CallRecord,
  fromMicroUsdc,
  fromMillionths,
  type SettlementPayload,
  type SettlementRecord,
  toMicroUsdc,
  toMillionths,
} from '@supercall/arkiv'
import { callScore, type Ending, nextScore, type Resolution } from '@supercall/core'
import { type Hex, isHex } from 'viem'

export type SettledCopy = {
  keptFee: bigint
  newCredit: bigint
  platformFee: bigint
  filled: boolean
  profit?: number
}

type Previous = Pick<SettlementRecord, 'key' | 'fund' | 'need' | 'S' | 'W'>

const NONE = { fund: { earned: 0, creditOnly: 0, limit: 0 }, need: { total: 0, count: 0 } }

const BPS = 10_000n
const bigintMin = (a: bigint, b: bigint) => (a < b ? a : b)

const lower = (h: Hex): Hex => `0x${h.slice(2).toLowerCase()}`

const scored = (r: Resolution): Ending =>
  r.ending === 'won' || r.ending === 'lost' || r.ending === 'unfired' || r.ending === 'void'
    ? r.ending
    : { price: r.price }

const cutBps = (r: Resolution, shareBps: number) =>
  r.ending === 'won' ? shareBps : r.ending === 'expired-profit' ? Math.floor(shareBps / 2) : 0

const sum = (amounts: bigint[]) => amounts.reduce((a, b) => a + Number(b), 0)

function payouts(
  copies: SettledCopy[],
  shareBps: number,
  ending: Resolution,
  callFeeCredits: bigint[],
) {
  let toCaller = 0
  let toFund = 0
  let toCreditOnly = 0
  let toTreasury = 0
  const isRight = ending.ending === 'won' || ending.ending === 'expired-profit'
  if (!isRight) return { toCaller, toFund, toCreditOnly, toTreasury }
  const bps = ending.ending === 'won' ? BigInt(shareBps) : BigInt(shareBps) / 2n
  for (const [i, c] of copies.entries()) {
    const credit = callFeeCredits[i] ?? 0n
    const keptCredit = bigintMin(c.keptFee, credit)
    const keptCash = c.keptFee - keptCredit
    const walletCut = Number((keptCash * bps) / BPS)
    toCaller += walletCut
    toFund += Number(keptCash) - walletCut
    toCreditOnly += Number(keptCredit)
    if (c.filled) toTreasury += Number(c.platformFee)
  }
  return { toCaller, toFund, toCreditOnly, toTreasury }
}

export function settlementRecord({
  call,
  ending,
  pool,
  copies,
  callFeeCredits,
  hisaabTxs,
  fund,
  previous,
  fills,
}: {
  call: Pick<CallRecord, 'key' | 'caller' | 'entry' | 'stop' | 'target' | 'direction' | 'shareBps'>
  ending: Resolution
  pool: Hex
  copies: SettledCopy[]
  callFeeCredits: bigint[]
  hisaabTxs: Hex[]
  fund: { earned: bigint; creditOnly: bigint }
  previous?: Previous
  fills: { filled: number; bought: number; sold: number; definitiveFee: number }
}): SettlementPayload {
  const levels = {
    entry: fromMicroUsdc(call.entry),
    stop: call.stop === undefined ? undefined : fromMicroUsdc(call.stop),
    target: fromMicroUsdc(call.target),
    direction: call.direction,
  }
  const s = toMillionths(callScore(levels, scored(ending)))
  const S = previous?.S.after ?? 0
  const W = previous?.W.after ?? 0
  const next = nextScore({ S: fromMillionths(S), W: fromMillionths(W) }, fromMillionths(s))
  const before = previous ? { fund: previous.fund.after, need: previous.need.after } : NONE
  const { toCaller, toFund, toCreditOnly, toTreasury } = payouts(
    copies,
    call.shareBps,
    ending,
    callFeeCredits,
  )
  const nets = copies.map((c) =>
    c.profit === undefined ? 0 : toMicroUsdc(c.profit) - Number(c.keptFee),
  )
  return {
    v: 1,
    call: call.key,
    caller: call.caller,
    entry: call.entry,
    stop: call.stop,
    target: call.target,
    direction: call.direction,
    ending:
      ending.ending === 'unfired'
        ? { kind: 'unfired' }
        : ending.ending === 'void'
          ? { kind: 'void', at: Date.parse(ending.at) / 1000 }
          : {
              kind: ending.ending,
              price: toMicroUsdc(ending.price),
              at: Date.parse(ending.at) / 1000,
              pool: lower(pool),
              txHash: ending.ref && isHex(ending.ref) ? lower(ending.ref) : undefined,
            },
    fills: {
      filled: fills.filled,
      bought: toMicroUsdc(fills.bought),
      sold: toMicroUsdc(fills.sold),
      definitiveFee: toMicroUsdc(fills.definitiveFee),
    },
    keptTotal: sum(copies.map((c) => c.keptFee)),
    cutBps: cutBps(ending, call.shareBps),
    toCaller,
    toFund,
    toCreditOnly,
    toTreasury,
    creditTotal: sum(copies.map((c) => c.newCredit)),
    // ponytail: budget removed from Hisaab; add when SettlementStarted carries it again
    budget: 0,
    fund: {
      before: before.fund,
      after: { earned: Number(fund.earned), creditOnly: Number(fund.creditOnly), limit: 0 },
    },
    // ponytail: need tracking not on-chain; add off-chain accumulation when callers need it
    need: { before: before.need, after: { total: 0, count: 0 } },
    s,
    S: { before: S, after: toMillionths(next.S) },
    W: { before: W, after: toMillionths(next.W) },
    copies: copies.length,
    followersNet: nets.reduce((a, b) => a + b, 0),
    followersProfitable: nets.filter((n) => n > 0).length,
    previous: previous?.key ?? null,
    hisaabTxs,
  }
}
