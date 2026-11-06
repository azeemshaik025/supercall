// What one call's settlement posts to Hisaab, from its copies' Flash orders. Core works in
// dollars; Hisaab takes micro-USDC, and every number posted is rounded down.
import {
  type CallType,
  keptFee,
  type Levels,
  mirrorFee,
  needIfStopped,
  pnlAt,
  type Resolution,
  settleWrong,
  timingWeight,
  type WrongCopy,
} from '@supercall/core'
import type { Order as FlashOrder } from '@supercall/flash'

type Order = Pick<FlashOrder, 'placedAt' | 'qty' | 'closeReason' | 'filled'>

export type CopyOrders = {
  size: bigint
  buy?: Order
  exits: Order[]
}

export type Inputs =
  | { kind: 'right'; aboveEntry: boolean; need: bigint; kept: bigint[]; filled: boolean[] }
  | { kind: 'wrong'; need: bigint; totalAsk: bigint; asks: bigint[] }
  | { kind: 'refund'; count: number }

const micro = (usd: number) => BigInt(Math.floor(usd * 1e6))
const priceOf = (o: Order) => Number(o.filled?.averageNotionalPrice)
const didFill = (o: Order) => Number(o.filled?.targetAmount) > 0
const MOVED_OUT = 'REASON_INSUFFICIENT_FUNDER_BALANCE'
const NO_FUND = { earned: 0, creditOnly: 0 }

type Terms = Levels & { type: CallType; createdAt: string; expiresAt: string }
type Ended = Exclude<Resolution, { ending: 'unfired' | 'void' }>

type Held = ReturnType<typeof held>

// ponytail: long only; when short calls become copyable, a short's cap is Math.max.
const measuredAt = (call: Terms, ending: Ended, r: Held, now: number) =>
  r.salePrice ??
  (ending.ending !== 'won'
    ? ending.price
    : r.copy.exit === 'moved-out'
      ? call.target
      : Math.min(now, call.target))

export function settlementInputs(
  call: Terms,
  ending: Resolution,
  copies: CopyOrders[],
  now: number,
): Inputs {
  if (ending.ending === 'unfired' || ending.ending === 'void')
    return { kind: 'refund', count: copies.length }
  const rows = heldCopies(call, copies)
  const need = micro(
    needIfStopped(
      call,
      rows.flatMap((r) => (r ? [r.copy] : [])),
    ),
  )
  if (ending.ending === 'lost' || ending.ending === 'expired-loss') {
    const asks = rows.map((r) =>
      r ? micro(settleWrong(call, ending.price, [r.copy], NO_FUND).copies[0]?.ask ?? 0) : 0n,
    )
    return { kind: 'wrong', need, totalAsk: asks.reduce((a, b) => a + b, 0n), asks }
  }
  return {
    kind: 'right',
    aboveEntry: ending.ending === 'expired-profit',
    need,
    kept: rows.map((r) =>
      r
        ? micro(
            keptFee(
              r.copy.fee,
              pnlAt(r.copy.size, r.copy.entryFill, measuredAt(call, ending, r, now)),
              true,
            ),
          )
        : 0n,
    ),
    filled: rows.map((r) => r !== undefined),
  }
}

export function copyProfits(call: Terms, ending: Resolution, copies: CopyOrders[], now: number) {
  if (ending.ending === 'unfired' || ending.ending === 'void') return copies.map(() => undefined)
  return heldCopies(call, copies).map(
    (r) => r && pnlAt(r.copy.size, r.copy.entryFill, measuredAt(call, ending, r, now)),
  )
}

const sec = (iso: string) => Date.parse(iso) / 1000

const heldCopies = (call: Terms, copies: CopyOrders[]) =>
  copies.map((c) =>
    c.buy && didFill(c.buy)
      ? held(c, c.buy, timingWeight(sec(c.buy.placedAt), sec(call.createdAt), sec(call.expiresAt)))
      : undefined,
  )

function held(c: CopyOrders, buy: Order, weight: number) {
  const paid = Number(c.size) / 1e6
  const size = paid * Math.min(1, Number(buy.filled?.contraAmount) / Number(buy.qty))
  const entryFill = priceOf(buy)
  const sale = c.exits.find(didFill)
  const salePrice = sale && priceOf(sale)
  const copy: WrongCopy = {
    size,
    entryFill,
    fee: mirrorFee(paid).pot,
    paidWithCredit: false,
    weight,
  }
  if (salePrice !== undefined) copy.exit = { soldLoss: -pnlAt(size, entryFill, salePrice) }
  else if (c.exits.some((o) => o.closeReason === MOVED_OUT)) copy.exit = 'moved-out'
  return { copy, salePrice }
}
