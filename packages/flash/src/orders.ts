// Reading what actually happened to an order: still working or done, and what it filled at.
import type { GetOrderResponse, OrderStatus } from './types.ts'

const TERMINAL: ReadonlySet<OrderStatus> = new Set([
  'ORDER_STATUS_FILLED',
  'ORDER_STATUS_CANCELLED',
  'ORDER_STATUS_REJECTED',
  'ORDER_STATUS_TERMINATED',
])

/** The order will not change any more. */
export function isTerminal(status: OrderStatus) {
  return TERMINAL.has(status)
}

/** The order can still fill: pending, accepted or partly filled. */
export function isWorking(status: OrderStatus) {
  return (
    status === 'ORDER_STATUS_PENDING' ||
    status === 'ORDER_STATUS_ACCEPTED' ||
    status === 'ORDER_STATUS_PARTIALLY_FILLED'
  )
}

export interface FillSummary {
  /** Nothing filled yet. */
  empty: boolean
  /** Coin bought (buy) or sold (sell), summed over fills. */
  targetAmount: number
  /** USDC spent (buy) or received (sell), summed over fills. */
  contraAmount: number
  /** USD per coin across all fills, weighted by size; null when nothing filled. */
  averagePrice: number | null
  /** All fees in USD: Flash's, the network's and ours. */
  feesUsd: number
  /** Our integrator fee in USD. */
  integratorFeesUsd: number
  firstFillAt: string | null
  lastFillAt: string | null
  transactions: string[]
  /** Every fill is final on chain (none only processed, none reorged). */
  final: boolean
}

/**
 * Sums an order's fills. Reorged fills are left out. The average price is Flash's own when it
 * reports one, otherwise USDC over coin.
 */
export function summarizeFills({ order, fills }: GetOrderResponse): FillSummary {
  const live = fills.filter((f) => f.status !== 'CHAIN_STATUS_REORGED')
  const sum = (pick: (f: (typeof live)[number]) => string | undefined) =>
    live.reduce((total, f) => total + num(pick(f)), 0)
  const targetAmount = sum((f) => f.targetAmount)
  const contraAmount = sum((f) => f.contraAmount)
  const reported = order.filled?.averageNotionalPrice ?? order.filled?.averagePrice
  const times = live.map((f) => f.filledAt).sort()
  return {
    empty: live.length === 0,
    targetAmount,
    contraAmount,
    averagePrice: reported ? num(reported) : targetAmount > 0 ? contraAmount / targetAmount : null,
    feesUsd: sum((f) => f.feeNotional),
    integratorFeesUsd: sum((f) => f.integratorFeeNotional),
    firstFillAt: times[0] ?? null,
    lastFillAt: times.at(-1) ?? null,
    transactions: [...new Set(live.map((f) => f.transactionId))],
    final: live.length > 0 && live.every((f) => f.status === 'CHAIN_STATUS_FINALIZED'),
  }
}

function num(s: string | undefined | null) {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
