// Turning a Flash quote into wallet prompts, and the signatures back into an order. Safe to use
// in the browser: no API key involved.
import type { EvmTx, QuoteRequest, QuoteResponse, SubmitOrderRequest } from './types.ts'

export type StepId =
  | 'approve'
  | 'bracketApprove'
  | 'permit'
  | 'order'
  | 'bracketOrder'
  | 'bracketPermit'

/** One wallet prompt: send a transaction, or sign EIP-712 typed data (a JSON string). */
export type SigningStep =
  | { id: StepId; kind: 'transaction'; tx: EvmTx }
  | { id: StepId; kind: 'typedData'; typedData: string }

/** What each step's result is: a transaction hash for approvals, a signature otherwise. */
export type Signed = Partial<Record<StepId, string>>

/**
 * Every wallet prompt a quote needs, in the order to show them:
 * 1. let the spent token be pulled (first order from this wallet only);
 * 2. let the bracket sell the bought token (first time buying it only);
 * 3. the Permit2 signature for the buy, when the quote uses Permit2;
 * 4. the buy;
 * 5. the stop and target;
 * 6. the Permit2 signature for the exits, when needed.
 * Approvals must be mined before the order is submitted.
 */
export function signingSteps(quote: QuoteResponse): SigningStep[] {
  const order = quote.evm
  if (!order?.orderTypedData) throw new Error('Flash returned no EVM order to sign')
  const exits = quote.attachedBracket?.evm ?? null
  const steps: SigningStep[] = []
  if (order.approveTx) steps.push({ id: 'approve', kind: 'transaction', tx: order.approveTx })
  if (exits?.approveTx)
    steps.push({ id: 'bracketApprove', kind: 'transaction', tx: exits.approveTx })
  if (order.permitTypedData)
    steps.push({ id: 'permit', kind: 'typedData', typedData: order.permitTypedData })
  steps.push({ id: 'order', kind: 'typedData', typedData: order.orderTypedData })
  if (quote.attachedBracket) {
    if (!exits?.orderTypedData) throw new Error('Flash returned no stop and target to sign')
    steps.push({ id: 'bracketOrder', kind: 'typedData', typedData: exits.orderTypedData })
    if (exits.permitTypedData)
      steps.push({ id: 'bracketPermit', kind: 'typedData', typedData: exits.permitTypedData })
  }
  return steps
}

/**
 * The order to submit, from the request that was quoted, the quote, and the signatures. Echoes
 * the typed data unchanged, as Flash requires.
 */
export function orderFromQuote(
  request: QuoteRequest & { funderAddress: string },
  quote: QuoteResponse,
  signed: Signed,
): SubmitOrderRequest {
  const order = quote.evm
  if (!order?.orderTypedData) throw new Error('Flash returned no EVM order to sign')
  const need = (id: StepId) => {
    const s = signed[id]
    if (!s) throw new Error(`Missing signature: ${id}`)
    return s
  }
  const {
    attachedBracket,
    evmUsePermit2: _p2,
    forceMinimalAllowance: _min,
    svmUseNativeSOL: _sol,
    expireTime: _exp,
    durationSeconds: _dur,
    flashIntegratorFeeBps: _fee,
    ...rest
  } = request
  const submit: SubmitOrderRequest = {
    ...rest,
    funderAddress: request.funderAddress,
    quoteId: quote.quoteId,
    ...(quote.bridgeQuoteId ? { bridgeQuoteId: quote.bridgeQuoteId } : {}),
    userSignature: need('order'),
    evmOrderTypedData: order.orderTypedData,
    ...(order.permitTypedData
      ? { evmPermitTypedData: order.permitTypedData, evmPermitSignature: need('permit') }
      : {}),
  }
  const bracket = quote.attachedBracket
  if (attachedBracket && bracket) {
    const exits = bracket.evm
    submit.attachedBracket = {
      takeProfit: attachedBracket.takeProfit,
      stopLoss: attachedBracket.stopLoss,
      userSignature: need('bracketOrder'),
      deadline: bracket.deadline,
      signedMaxFromAmount: bracket.signedMaxFromAmount,
      ...(bracket.salt ? { salt: bracket.salt } : {}),
      ...(exits?.permitTypedData
        ? { evmPermitTypedData: exits.permitTypedData, evmPermitSignature: need('bracketPermit') }
        : {}),
    }
  }
  return submit
}

/**
 * Flash's typed-data JSON, shaped for viem's `signTypedData` (which derives the domain type
 * itself). For `eth_signTypedData_v4`, pass the original JSON string instead.
 */
export function parseTypedData(json: string) {
  const parsed = JSON.parse(json) as {
    domain: Record<string, unknown>
    types: Record<string, { name: string; type: string }[]>
    primaryType: string
    message: Record<string, unknown>
  }
  const { EIP712Domain: _domain, ...types } = parsed.types
  return { domain: parsed.domain, types, primaryType: parsed.primaryType, message: parsed.message }
}
