// The Flash order behind copying a call: a market buy of the coin with USDC, with the call's
// target and stop attached as take-profit and stop-loss. Calls are long-only.
import type { Chain, QuoteRequest } from './types.ts'

export interface CopyOrder {
  chain: Chain
  /** The coin bought. */
  asset: string
  /** USDC on that chain. */
  usdc: string
  funder: string
  /** USDC spent on the buy. */
  sizeUsd: number
  /** USD prices. */
  target: number
  stop: number
  /** Decimal fraction, e.g. 0.01 for 1%. Flash picks a default when omitted. */
  maxSlippage?: number
  /** When the stop and target lapse, usually the call's deadline. */
  expireTime?: Date
}

export function copyOrderQuote(o: CopyOrder): QuoteRequest & { funderAddress: string } {
  if (!(o.sizeUsd > 0)) throw new RangeError('sizeUsd must be positive')
  if (!(o.stop > 0 && o.target > o.stop)) throw new RangeError('A long needs 0 < stop < target')
  return {
    targetChain: o.chain,
    contraChain: o.chain,
    targetAsset: o.asset,
    contraAsset: o.usdc,
    side: 'buy',
    qty: decimal(o.sizeUsd),
    orderType: 'market',
    funderAddress: o.funder,
    ...(o.maxSlippage === undefined ? {} : { maxSlippage: decimal(o.maxSlippage) }),
    attachedBracket: {
      takeProfit: { notionalPrice: decimal(o.target) },
      stopLoss: { notionalPrice: decimal(o.stop) },
      ...(o.expireTime ? { expireTime: o.expireTime.toISOString() } : {}),
    },
  }
}

/** A plain decimal string, never exponent notation (Flash takes "0.00000123", not "1.23e-6"). */
export function decimal(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Not a finite number: ${n}`)
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 })
}
