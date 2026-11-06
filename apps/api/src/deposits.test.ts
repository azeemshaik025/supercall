import { describe, expect, it } from 'vitest'
import type { FlashClient } from '@supercall/flash'
import { depositRoutes } from './deposits.ts'

const WALLET = '0x' + '1a'.repeat(20)
const TOKEN = '0x' + '2b'.repeat(20)

function stub(overrides: Partial<FlashClient> = {}): FlashClient {
  return {
    search: async () => [],
    quote: async () => ({
      quoteId: 'q1',
      bridgeQuoteId: 'bq1',
      orderType: 'market',
      side: 'buy',
      targetAsset: '0x3600000000000000000000000000000000000000',
      contraAsset: TOKEN,
      from: { asset: 'contra', amount: '100', notional: '100' },
      to: { asset: 'target', amount: '95', notional: '95' },
      fees: { estimatedFeeNotional: '5' },
      estimatedPriceImpact: null,
      recommendedSlippage: null,
      wrap: null,
      evm: null,
      svm: null,
      setupTxs: null,
    }),
    submitOrder: async () => ({ orderId: 'ord-1' }),
    submitSetupTransaction: async () => ({ status: 'confirmed' }),
    getOrder: async () => ({
      order: filledOrder(),
      fills: [],
    }),
    listOrders: async () => ({ orders: [], nextPageToken: null }),
    cancelOrder: async () => ({ ok: true }),
    balances: async () => [
      {
        chain: 'base',
        address: TOKEN,
        symbol: 'USDC',
        tokenDecimals: 6,
        balance: '1000000',
        notional: '1',
        priceChange24h: null,
        imageUrl: '',
        isNative: false,
      },
      {
        chain: 'solana',
        address: '0x00',
        symbol: 'SOL',
        tokenDecimals: 9,
        balance: '1000000000',
        notional: '100',
        priceChange24h: null,
        imageUrl: '',
        isNative: true,
      },
    ],
    allOrders: async function* () {},
    ...overrides,
  } satisfies FlashClient
}

function filledOrder() {
  return {
    orderId: 'ord-1',
    orderType: 'market' as const,
    side: 'buy' as const,
    status: 'ORDER_STATUS_FILLED' as const,
    closeReason: 'REASON_FULLY_FILLED',
    funderAddress: WALLET,
    recipientAddress: WALLET,
    integratorFeeBps: '10',
    tradeFeeBps: '10',
    targetAsset: { id: 't', name: 'USDC', address: '0x36', ticker: 'USDC', chain: { id: 'arc', name: 'ARC', namespace: 'eip155' } },
    contraAsset: { id: 'c', name: 'USDC', address: TOKEN, ticker: 'USDC', chain: { id: 'base', name: 'Base', namespace: 'eip155' } },
    qty: '100',
    filled: { targetAmount: '95', contraAmount: '100', averagePrice: null, averageNotionalPrice: null },
    limitNotionalPrice: null,
    limitCrossPrice: null,
    trigger: null,
    brackets: null,
    maxPriceImpact: null,
    twapBucketCount: null,
    placedAt: '2026-11-01T00:00:00Z',
    acceptedAt: '2026-11-01T00:00:01Z',
    closedAt: '2026-11-01T00:00:30Z',
    expiresAt: null,
  }
}

function app(overrides: Partial<FlashClient> = {}) {
  return depositRoutes({ flash: stub(overrides) })
}

function json(res: Response) {
  return res.json()
}

describe('GET /wallets/:wallet/deposit-tokens', () => {
  it('returns only base/arbitrum/ethereum balances', async () => {
    const res = await app().request(`/wallets/${WALLET}/deposit-tokens`)
    expect(res.status).toBe(200)
    const { tokens } = await json(res)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].chain).toBe('base')
  })

  it('rejects a non-address wallet', async () => {
    const res = await app().request('/wallets/not-an-address/deposit-tokens')
    expect(res.status).toBe(400)
  })
})

describe('POST /deposits/quote', () => {
  const body = { wallet: WALLET, chain: 'base', token: TOKEN, amount: '100' }

  it('returns a quote with cost', async () => {
    const res = await app().request('/deposits/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
    const data = await json(res)
    expect(data.quoteId).toBe('q1')
    expect(data.costUsd).toBe(5)
  })

  it('rejects when bridge cost exceeds 10%', async () => {
    const flash = stub({
      quote: async () => ({
        quoteId: 'q2',
        bridgeQuoteId: 'bq2',
        orderType: 'market',
        side: 'buy',
        targetAsset: '0x36',
        contraAsset: TOKEN,
        from: { asset: 'contra', amount: '10', notional: '10' },
        to: { asset: 'target', amount: '8', notional: '8' },
        fees: { estimatedFeeNotional: '2' },
        estimatedPriceImpact: null,
        recommendedSlippage: null,
        wrap: null,
        evm: null,
        svm: null,
        setupTxs: null,
      }),
    })
    const res = await depositRoutes({ flash }).request('/deposits/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, amount: '10' }),
    })
    expect(res.status).toBe(409)
    const data = await json(res)
    expect(data.code).toBe('deposit_too_small')
    expect(data.minimumUsd).toBeGreaterThan(10)
  })

  it('returns 502 when Flash quotes without a price', async () => {
    const flash = stub({
      quote: async () => ({
        quoteId: 'q3',
        bridgeQuoteId: null,
        orderType: 'market',
        side: 'buy',
        targetAsset: '0x36',
        contraAsset: TOKEN,
        from: { asset: 'contra', amount: '10', notional: '0' },
        to: { asset: 'target', amount: '0', notional: '0' },
        fees: { estimatedFeeNotional: '0' },
        estimatedPriceImpact: null,
        recommendedSlippage: null,
        wrap: null,
        evm: null,
        svm: null,
        setupTxs: null,
      }),
    })
    const res = await depositRoutes({ flash }).request('/deposits/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(502)
    expect((await json(res)).code).toBe('no_price')
  })

  it('rejects bad body', async () => {
    const res = await app().request('/deposits/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /deposits', () => {
  it('submits a signed order', async () => {
    const res = await app().request('/deposits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: WALLET,
        chain: 'base',
        token: TOKEN,
        amount: '100',
        quoteId: 'q1',
        bridgeQuoteId: 'bq1',
        userSignature: '0xabc',
        evmOrderTypedData: '{}',
      }),
    })
    expect(res.status).toBe(201)
    expect((await json(res)).orderId).toBe('ord-1')
  })

  it('rejects missing fields', async () => {
    const res = await app().request('/deposits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: WALLET }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /deposits/:orderId', () => {
  it('returns arrived when filled', async () => {
    const res = await app().request(`/deposits/ord-1?wallet=${WALLET}`)
    expect(res.status).toBe(200)
    const data = await json(res)
    expect(data.status).toBe('arrived')
    expect(data.usdc).toBe('95')
  })

  it('returns failed for cancelled orders', async () => {
    const a = app({
      getOrder: async () => ({
        order: { ...filledOrder(), status: 'ORDER_STATUS_CANCELLED' as const, closeReason: 'REASON_USER_REQUESTED' },
        fills: [],
      }),
    })
    const res = await a.request(`/deposits/ord-1?wallet=${WALLET}`)
    expect(res.status).toBe(200)
    const data = await json(res)
    expect(data.status).toBe('failed')
    expect(data.reason).toBe('REASON_USER_REQUESTED')
  })

  it('returns pending for working orders', async () => {
    const a = app({
      getOrder: async () => ({
        order: { ...filledOrder(), status: 'ORDER_STATUS_OPEN' as const, closedAt: null },
        fills: [],
      }),
    })
    const res = await a.request(`/deposits/ord-1?wallet=${WALLET}`)
    expect(res.status).toBe(200)
    expect((await json(res)).status).toBe('pending')
  })

  it('rejects missing wallet query', async () => {
    const res = await app().request('/deposits/ord-1')
    expect(res.status).toBe(400)
  })
})
