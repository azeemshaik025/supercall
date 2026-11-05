import { describe, expect, it } from 'vitest'
import { cancelMessage, createFlashClient, FlashError } from './client.ts'

type Seen = { url: string; init: RequestInit }

function fake(status: number, body: unknown) {
  const seen: Seen[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    return new Response(body === undefined ? '' : JSON.stringify(body), { status })
  }) as unknown as typeof globalThis.fetch
  return { fetch, seen }
}

const quoteReq = {
  targetChain: 'arc',
  contraChain: 'arc',
  targetAsset: '0xcoin',
  contraAsset: '0xusdc',
  side: 'buy',
  qty: '100',
  orderType: 'market',
} as const

describe('createFlashClient', () => {
  it('sends the API key and our fee on quotes', async () => {
    const { fetch, seen } = fake(200, { quoteId: 'q1' })
    const flash = createFlashClient({ apiKey: 'k', integratorFeeBps: 25, fetch })
    const q = await flash.quote(quoteReq)
    expect(q.quoteId).toBe('q1')
    const s = seen[0]
    if (!s) throw new Error('no request sent')
    expect(s.url).toBe('https://flash.definitive.fi/v1/quote')
    expect(s.init.method).toBe('POST')
    expect((s.init.headers as Record<string, string>)['x-definitive-api-key']).toBe('k')
    expect(JSON.parse(String(s.init.body))).toMatchObject({
      ...quoteReq,
      flashIntegratorFeeBps: '25',
    })
  })

  it('sends the same fee on the order', async () => {
    const { fetch, seen } = fake(201, { orderId: 'o1' })
    const flash = createFlashClient({ apiKey: 'k', integratorFeeBps: 25, fetch })
    await flash.submitOrder({ ...quoteReq, funderAddress: '0xf', userSignature: '0xs' })
    expect(JSON.parse(String(seen[0]?.init.body)).flashIntegratorFeeBps).toBe('25')
  })

  it('omits the fee when none is set', async () => {
    const { fetch, seen } = fake(200, { quoteId: 'q1' })
    await createFlashClient({ apiKey: 'k', fetch }).quote(quoteReq)
    expect(JSON.parse(String(seen[0]?.init.body))).not.toHaveProperty('flashIntegratorFeeBps')
  })

  it('rejects a fee above 10%', () => {
    expect(() => createFlashClient({ apiKey: 'k', integratorFeeBps: 1001 })).toThrow(RangeError)
    expect(() => createFlashClient({ apiKey: 'k', integratorFeeBps: 2.5 })).toThrow(RangeError)
  })

  it('maps error bodies to FlashError', async () => {
    const { fetch } = fake(422, {
      error: { code: 'FAILED_PRECONDITION', message: 'stale quote', details: null },
    })
    const err = await createFlashClient({ apiKey: 'k', fetch })
      .quote(quoteReq)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FlashError)
    expect(err).toMatchObject({ status: 422, code: 'FAILED_PRECONDITION', retryable: false })
  })

  it('marks rate limits and outages retryable, even without a JSON body', async () => {
    const { fetch } = fake(503, undefined)
    const err = (await createFlashClient({ apiKey: 'k', fetch })
      .search('eth')
      .catch((e: unknown) => e)) as FlashError
    expect(err.code).toBe('UNKNOWN')
    expect(err.retryable).toBe(true)
  })

  it('builds search, order and balance URLs', async () => {
    const { fetch, seen } = fake(200, { assets: [], balances: [], order: {}, fills: [] })
    const flash = createFlashClient({ apiKey: 'k', fetch, baseUrl: 'https://x.test/v1/' })
    await flash.search('weth', { chain: 'arc', limit: 5 })
    await flash.getOrder('ord 1', '0xf')
    await flash.balances('0xf')
    expect(seen.map((s) => s.url)).toEqual([
      'https://x.test/v1/search?query=weth&chain=arc&limit=5',
      'https://x.test/v1/orders/ord%201?funderAddress=0xf',
      'https://x.test/v1/balances/0xf',
    ])
  })

  it('follows page tokens through every order', async () => {
    const pages = [
      { orders: [{ orderId: 'a' }, { orderId: 'b' }], nextPageToken: 't2' },
      { orders: [{ orderId: 'c' }], nextPageToken: null },
    ]
    const urls: string[] = []
    const fetch = (async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify(pages[urls.length - 1]), { status: 200 })
    }) as unknown as typeof globalThis.fetch
    const flash = createFlashClient({ apiKey: 'k', fetch })
    const ids: string[] = []
    for await (const o of flash.allOrders({
      funderAddress: '0xf',
      statuses: ['ORDER_STATUS_FILLED'],
    }))
      ids.push(o.orderId)
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(urls[1]).toContain('pageToken=t2')
    expect(urls[0]).toContain('statuses=ORDER_STATUS_FILLED')
  })

  it('cancels with the exact message the funder signed', async () => {
    const { fetch, seen } = fake(200, { ok: true })
    await createFlashClient({ apiKey: 'k', fetch }).cancelOrder('ord_1', '0xsig')
    expect(seen[0]?.url).toBe('https://flash.definitive.fi/v1/orders/ord_1/cancel')
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      cancelMessage: 'Definitive Flash v1 — Cancel Order\nOrder: ord_1',
      userSignature: '0xsig',
    })
    expect(cancelMessage('x')).toBe('Definitive Flash v1 — Cancel Order\nOrder: x')
  })
})
