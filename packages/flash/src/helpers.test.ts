import { describe, expect, it } from 'vitest'
import { copyOrderQuote, decimal } from './bracket.ts'
import { isTerminal, isWorking, summarizeFills } from './orders.ts'
import { orderFromQuote, parseTypedData, signingSteps } from './sign.ts'
import type { Fill, GetOrderResponse, Order, QuoteResponse } from './types.ts'

const typed = (primaryType: string) =>
  JSON.stringify({
    domain: { name: 'X', chainId: 5042 },
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      [primaryType]: [{ name: 'a', type: 'uint256' }],
    },
    primaryType,
    message: { a: '1' },
  })

function quote(
  over: { approve?: boolean; permit?: boolean; exitApprove?: boolean; exitPermit?: boolean } = {},
): QuoteResponse {
  return {
    quoteId: 'q1',
    bridgeQuoteId: null,
    orderType: 'market',
    side: 'buy',
    targetAsset: '0xcoin',
    contraAsset: '0xusdc',
    from: { asset: 'contra', amount: '100', notional: '100' },
    to: { asset: 'target', amount: '0.03', notional: '99.8' },
    fees: { estimatedFeeNotional: '0.2' },
    estimatedPriceImpact: null,
    recommendedSlippage: '0.005',
    wrap: null,
    svm: null,
    setupTxs: null,
    evm: {
      approveTx: over.approve ? { to: '0xusdc', data: '0xa' } : null,
      permitTypedData: over.permit ? typed('Permit') : null,
      orderTypedData: typed('Order'),
    },
    attachedBracket: {
      evm: {
        approveTx: over.exitApprove ? { to: '0xcoin', data: '0xb' } : null,
        permitTypedData: over.exitPermit ? typed('ExitPermit') : null,
        orderTypedData: typed('Bracket'),
      },
      svm: null,
      salt: '7',
      deadline: '1800000000',
      signedMaxFromAmount: '0.03',
    },
  }
}

const request = copyOrderQuote({
  chain: 'arc',
  asset: '0xcoin',
  usdc: '0xusdc',
  funder: '0xf',
  sizeUsd: 100,
  target: 3400,
  stop: 2700,
  maxSlippage: 0.01,
})

describe('signingSteps', () => {
  it('is just the buy and the exits once everything is approved', () => {
    expect(signingSteps(quote()).map((s) => s.id)).toEqual(['order', 'bracketOrder'])
  })

  it('puts approvals first and permits next to what they cover', () => {
    const ids = signingSteps(
      quote({ approve: true, permit: true, exitApprove: true, exitPermit: true }),
    ).map((s) => s.id)
    expect(ids).toEqual([
      'approve',
      'bracketApprove',
      'permit',
      'order',
      'bracketOrder',
      'bracketPermit',
    ])
  })

  it('refuses a quote with no EVM order', () => {
    expect(() => signingSteps({ ...quote(), evm: null })).toThrow(/no EVM order/)
  })
})

describe('orderFromQuote', () => {
  it('echoes the typed data and puts each signature in its place', () => {
    const q = quote({ permit: true, exitPermit: true })
    const order = orderFromQuote(request, q, {
      permit: '0xp',
      order: '0xo',
      bracketOrder: '0xb',
      bracketPermit: '0xbp',
    })
    expect(order).toMatchObject({
      targetChain: 'arc',
      qty: '100',
      maxSlippage: '0.01',
      funderAddress: '0xf',
      quoteId: 'q1',
      userSignature: '0xo',
      evmOrderTypedData: q.evm?.orderTypedData,
      evmPermitTypedData: q.evm?.permitTypedData,
      evmPermitSignature: '0xp',
      attachedBracket: {
        takeProfit: { notionalPrice: '3400' },
        stopLoss: { notionalPrice: '2700' },
        userSignature: '0xb',
        deadline: '1800000000',
        signedMaxFromAmount: '0.03',
        salt: '7',
        evmPermitSignature: '0xbp',
      },
    })
    expect(order).not.toHaveProperty('bridgeQuoteId')
  })

  it('fails loudly when a needed signature is missing', () => {
    expect(() =>
      orderFromQuote(request, quote({ permit: true }), { order: '0xo', bracketOrder: '0xb' }),
    ).toThrow('Missing signature: permit')
  })
})

describe('parseTypedData', () => {
  it('drops the domain type for viem and keeps the rest', () => {
    const t = parseTypedData(typed('Order'))
    expect(t.primaryType).toBe('Order')
    expect(t.types).not.toHaveProperty('EIP712Domain')
    expect(t.types.Order).toHaveLength(1)
  })
})

describe('copyOrderQuote', () => {
  it('is a market buy with the call attached as take-profit and stop-loss', () => {
    expect(request).toMatchObject({
      side: 'buy',
      orderType: 'market',
      contraAsset: '0xusdc',
      targetAsset: '0xcoin',
    })
    expect(request.attachedBracket).toEqual({
      takeProfit: { notionalPrice: '3400' },
      stopLoss: { notionalPrice: '2700' },
    })
  })

  it('refuses levels that are not a long', () => {
    expect(() =>
      copyOrderQuote({
        chain: 'arc',
        asset: 'a',
        usdc: 'u',
        funder: 'f',
        sizeUsd: 10,
        target: 2700,
        stop: 3400,
      }),
    ).toThrow(RangeError)
  })

  it('writes small prices without exponents', () => {
    expect(decimal(0.00000123)).toBe('0.00000123')
    expect(decimal(1234567.5)).toBe('1234567.5')
    expect(() => decimal(Number.NaN)).toThrow(RangeError)
  })
})

describe('order status and fills', () => {
  it('sorts statuses into working and terminal', () => {
    expect(isWorking('ORDER_STATUS_PARTIALLY_FILLED')).toBe(true)
    expect(isTerminal('ORDER_STATUS_PARTIALLY_FILLED')).toBe(false)
    expect(isTerminal('ORDER_STATUS_FILLED')).toBe(true)
    expect(isWorking('ORDER_STATUS_CANCELLED')).toBe(false)
  })

  const fill = (over: Partial<Fill>): Fill => ({
    status: 'CHAIN_STATUS_FINALIZED',
    notional: '0',
    venues: [],
    filledAt: '2026-11-06T10:00:00Z',
    rootOrderId: 'o',
    orderId: 'o',
    parentOrderId: 'o',
    transactionId: '0xt1',
    feeAmount: '0',
    feeTicker: 'USDC',
    integratorFeeAmount: '0',
    feeNotional: '0.1',
    integratorFeeNotional: '0.02',
    contraAmount: '0',
    targetAmount: '0',
    ...over,
  })
  const order = { filled: null } as unknown as Order

  it('averages two fills by size and leaves out a reorged one', () => {
    const r: GetOrderResponse = {
      order,
      fills: [
        fill({
          contraAmount: '56',
          targetAmount: '0.02',
          filledAt: '2026-11-06T10:00:05Z',
          transactionId: '0xt2',
        }),
        fill({ contraAmount: '28.5', targetAmount: '0.01' }),
        fill({ contraAmount: '999', targetAmount: '1', status: 'CHAIN_STATUS_REORGED' }),
      ],
    }
    const s = summarizeFills(r)
    expect(s.targetAmount).toBeCloseTo(0.03)
    expect(s.contraAmount).toBeCloseTo(84.5)
    expect(s.averagePrice).toBeCloseTo(2816.67, 2)
    expect(s.feesUsd).toBeCloseTo(0.2)
    expect(s.integratorFeesUsd).toBeCloseTo(0.04)
    expect(s.firstFillAt).toBe('2026-11-06T10:00:00Z')
    expect(s.lastFillAt).toBe('2026-11-06T10:00:05Z')
    expect(s.transactions).toEqual(['0xt2', '0xt1'])
    expect(s.final).toBe(true)
  })

  it('prefers the average Flash reports, and is empty before any fill', () => {
    const reported = {
      filled: {
        averageNotionalPrice: '2810',
        averagePrice: '2809',
        targetAmount: null,
        contraAmount: null,
      },
    } as unknown as Order
    expect(
      summarizeFills({ order: reported, fills: [fill({ contraAmount: '1', targetAmount: '1' })] })
        .averagePrice,
    ).toBe(2810)
    const none = summarizeFills({ order, fills: [] })
    expect(none).toMatchObject({ empty: true, averagePrice: null, final: false, firstFillAt: null })
  })
})
