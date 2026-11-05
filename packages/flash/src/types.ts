// Request and response shapes of the Definitive Flash REST API (v1), as published at
// https://flash.definitive.fi/docs. Amounts and prices are decimal strings in normalized units.

export type Chain =
  | 'arbitrum'
  | 'arc'
  | 'avalanche'
  | 'base'
  | 'bsc'
  | 'ethereum'
  | 'hyperevm'
  | 'ink'
  | 'monad'
  | 'optimism'
  | 'plasma'
  | 'polygon'
  | 'robinhood'
  | 'solana'

export type OrderSide = 'buy' | 'sell'

export type OrderType =
  | 'market'
  | 'limit'
  | 'twap'
  | 'stop'
  | 'stop-loss'
  | 'take-profit'
  | 'bracket'
  | 'trailing-stop'
  | 'trailing-stop-limit'

export type OrderStatus =
  | 'ORDER_STATUS_UNSPECIFIED'
  | 'ORDER_STATUS_PENDING'
  | 'ORDER_STATUS_ACCEPTED'
  | 'ORDER_STATUS_PARTIALLY_FILLED'
  | 'ORDER_STATUS_FILLED'
  | 'ORDER_STATUS_CANCELLED'
  | 'ORDER_STATUS_REJECTED'
  | 'ORDER_STATUS_TERMINATED'

export type FillChainStatus =
  | 'CHAIN_STATUS_UNSPECIFIED'
  | 'CHAIN_STATUS_PROCESSED'
  | 'CHAIN_STATUS_REORGED'
  | 'CHAIN_STATUS_FINALIZED'

export type AttachedBracketStatus = 'pending_activation' | 'never_activated' | 'active'

/** A price level: exactly one of `notionalPrice` (USD) or `crossPrice` (pair rate). */
export type Price =
  | { notionalPrice: string; crossPrice?: never }
  | { crossPrice: string; notionalPrice?: never }

export type PriceTrigger = Price & {
  triggerType: 'upper' | 'lower'
  /** Bracket legs only; omit to exit at market. */
  limitPrice?: string
}

export type TrailingStop = { trailPercent: string; activationPrice?: string }

/** One exit of an attached bracket. */
export type BracketLeg = Price & { limitPrice?: string }

// ------------------------------------------------------------------ quote

export interface QuoteRequest {
  targetChain: Chain
  contraChain: Chain
  targetAsset: string
  contraAsset: string
  side: OrderSide
  /** Amount spent, in normalized units of the spent asset. */
  qty: string
  orderType: OrderType
  quickTrade?: boolean
  maxSlippage?: string
  maxPriceImpact?: string
  limitNotionalPrice?: string
  limitCrossPrice?: string
  funderAddress?: string
  recipientAddress?: string
  evmUsePermit2?: boolean
  forceMinimalAllowance?: boolean
  svmUseNativeSOL?: boolean
  flashIntegratorFeeBps?: string
  expireTime?: string
  startTime?: string
  durationSeconds?: number
  twapBucketCount?: number
  triggers?: PriceTrigger[]
  trailingStop?: TrailingStop
  /** Same-chain market, limit or twap only; needs `funderAddress`. */
  attachedBracket?: { takeProfit: BracketLeg; stopLoss: BracketLeg; expireTime?: string }
}

export interface EvmTx {
  to: string
  data: string
  value?: string
}

/** What the funder must approve and sign on an EVM chain. Typed data is a JSON string. */
export interface EvmSigning {
  approveTx: EvmTx | null
  permitTypedData: string | null
  orderTypedData: string | null
}

export interface QuoteLeg {
  asset: 'target' | 'contra'
  amount: string
  notional: string
}

export interface QuoteResponse {
  quoteId: string
  bridgeQuoteId: string | null
  orderType: OrderType
  side: OrderSide
  targetAsset: string
  contraAsset: string
  from: QuoteLeg
  /** Net received, after fees. */
  to: QuoteLeg
  fees: { estimatedFeeNotional: string }
  estimatedPriceImpact: string | null
  recommendedSlippage: string | null
  wrap: {
    nativeAsset: string
    wrappedAsset: string
    evmTx: EvmTx | null
    svmInstructions: unknown
  } | null
  evm: EvmSigning | null
  svm: {
    ataSetupIxs: unknown
    delegateIx: unknown
    sponsoredDelegateTx: string | null
    orderMessage: string
    nonce: string
    deadline: string
  } | null
  attachedBracket?: {
    evm: EvmSigning | null
    svm: unknown
    salt: string | null
    deadline: string
    signedMaxFromAmount: string
  } | null
  /** Unsigned setup transactions; sign each and send through `submitSetupTransaction`, in order. */
  setupTxs: string[] | null
}

// ------------------------------------------------------------------ order

export interface AttachedBracketSubmit {
  takeProfit: BracketLeg
  stopLoss: BracketLeg
  userSignature: string
  deadline: string
  signedMaxFromAmount: string
  salt?: string
  svmNonce?: string
  evmPermitTypedData?: string
  evmPermitSignature?: string
}

export interface SubmitOrderRequest
  extends Omit<
    QuoteRequest,
    | 'attachedBracket'
    | 'funderAddress'
    | 'evmUsePermit2'
    | 'forceMinimalAllowance'
    | 'svmUseNativeSOL'
    | 'expireTime'
    | 'durationSeconds'
  > {
  funderAddress: string
  userSignature: string
  quoteId?: string
  bridgeQuoteId?: string
  erc8021AttributionCode?: string
  evmOrderTypedData?: string
  evmPermitTypedData?: string
  evmPermitSignature?: string
  svmNonce?: string
  svmDeadline?: string
  svmSponsoredDelegateTx?: string
  attachedBracket?: AttachedBracketSubmit
}

export interface SubmitOrderResponse {
  orderId: string
  attachedBracket?: { status: AttachedBracketStatus }
}

// ------------------------------------------------------------------ reading orders

export interface AssetRef {
  id: string
  name: string
  address: string
  ticker: string
  chain: { id: string; name: string; namespace: string }
}

export interface Order {
  orderId: string
  orderType: OrderType
  side: OrderSide
  status: OrderStatus
  /** e.g. REASON_FULLY_FILLED, REASON_USER_REQUESTED; null while active. */
  closeReason: string | null
  funderAddress: string
  recipientAddress: string | null
  integratorFeeBps: string | null
  tradeFeeBps: string | null
  targetAsset: AssetRef
  contraAsset: AssetRef
  qty: string
  filled: {
    targetAmount: string | null
    contraAmount: string | null
    averagePrice: string | null
    averageNotionalPrice: string | null
  } | null
  limitNotionalPrice: string | null
  limitCrossPrice: string | null
  trigger: PriceTrigger | null
  brackets: PriceTrigger[] | null
  trailingStop?: {
    trailPercent: string
    activationPrice: string | null
    activated: boolean
    watermarkPrice: string | null
    effectiveTriggerPrice: string | null
    watermarkUpdatedAt: string | null
  }
  attachedBracket?: {
    status: AttachedBracketStatus
    bracketOrderId: string | null
    takeProfit: { notionalPrice?: string; crossPrice?: string; limitPrice?: string } | null
    stopLoss: { notionalPrice?: string; crossPrice?: string; limitPrice?: string } | null
    signedMaxFromAmount: string | null
    expiresAt: string | null
  }
  /** Set on the protective order created by an attached bracket. */
  sourceEntryOrderId?: string
  maxPriceImpact: string | null
  twapBucketCount: number | null
  placedAt: string
  acceptedAt: string | null
  closedAt: string | null
  expiresAt: string | null
}

export interface Fill {
  status: FillChainStatus
  notional: string
  venues: string[]
  filledAt: string
  rootOrderId: string
  orderId: string
  parentOrderId: string
  transactionId: string
  fillPrice?: string
  feeAmount: string
  feeTicker: string
  tradeFeeAmount?: string
  networkFeeAmount?: string
  integratorFeeAmount: string
  feeNotional: string
  tradeFeeNotional?: string
  networkFeeNotional?: string
  integratorFeeNotional: string
  contraAmount: string
  targetAmount: string
}

export interface GetOrderResponse {
  order: Order
  fills: Fill[]
}

export interface ListOrdersQuery {
  funderAddress?: string
  statuses?: OrderStatus[]
  /** 1 to 200, default 50. */
  pageSize?: number
  pageToken?: string
}

export interface ListOrdersResponse {
  orders: Order[]
  nextPageToken: string | null
}

// ------------------------------------------------------------------ assets and balances

export interface Asset {
  chain: Chain
  /** Native EVM assets use the 0xEeee…EEeE sentinel. */
  address: string
  symbol: string
  name: string
  decimals: number
  /** USD; "0" means unknown. */
  price: string
  marketCap: string
  liquidity: string
  volume24h: string
  /** Decimal fraction, e.g. "-0.0342". */
  priceChange24h: string
  holders: number
  imageUrl: string
  riskFlagged: boolean
}

export interface Balance {
  chain: Chain
  address: string
  symbol: string
  tokenDecimals: number
  balance: string
  notional: string
  priceChange24h: string | null
  imageUrl: string
  isNative: boolean
}

export interface FlashErrorBody {
  error: { code: string; message: string; details: unknown }
}
