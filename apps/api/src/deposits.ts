// Deposits (spec, "Deposits"): a token the wallet holds on Base, Arbitrum or Ethereum becomes USDC
// on Arc in one Flash cross-chain order. The API quotes with our key and refuses a deposit bridging
// would eat; the wallet sends any approval itself, with the source chain's gas, and signs.
import { depositChain, depositQuoteRequest, depositRequest } from '@supercall/api-schema'
import { CHAIN } from '@supercall/chains'
import { depositMinimum } from '@supercall/core'
import { type FlashClient, FlashError, type QuoteRequest } from '@supercall/flash'
import { Hono } from 'hono'
import { isAddress } from 'viem'
import type { z } from 'zod'

/** Her deposit as Flash quotes it, built the same way at quote and at submit. */
function orderFor(d: z.infer<typeof depositQuoteRequest>) {
  return {
    contraChain: d.chain,
    contraAsset: d.token,
    targetChain: CHAIN.flashChain as QuoteRequest['targetChain'],
    targetAsset: CHAIN.usdc.address,
    side: 'buy',
    orderType: 'market',
    qty: d.amount,
    funderAddress: d.wallet,
    recipientAddress: d.wallet,
    evmUsePermit2: true,
  } satisfies QuoteRequest
}

const ended = ['ORDER_STATUS_CANCELLED', 'ORDER_STATUS_REJECTED', 'ORDER_STATUS_TERMINATED']

export function depositRoutes(deps: { flash: FlashClient }) {
  const { flash } = deps
  const app = new Hono()
  app.onError((e, c) => {
    if (e instanceof FlashError) return c.json({ code: e.code, detail: e.message }, 502)
    throw e
  })

  app.get('/wallets/:wallet/deposit-tokens', async (c) => {
    const wallet = c.req.param('wallet')
    if (!isAddress(wallet)) return c.json({ code: 'bad_request', detail: 'Not an address' }, 400)
    const balances = await flash.balances(wallet)
    const from: string[] = depositChain.options
    return c.json({ tokens: balances.filter((b) => from.includes(b.chain)) })
  })

  app.post('/deposits/quote', async (c) => {
    const body = depositQuoteRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json(
        { code: 'bad_request', detail: 'Expected { wallet, chain, token, amount }' },
        400,
      )
    const quote = await flash.quote(orderFor(body.data))
    const inUsd = Number(quote.from.notional)
    const outUsd = Number(quote.to.notional)
    if (!(inUsd > 0) || !Number.isFinite(outUsd))
      return c.json({ code: 'no_price', detail: 'Flash quoted this token without a price' }, 502)
    const minimumUsd = depositMinimum(inUsd, outUsd)
    if (minimumUsd !== undefined) {
      const detail = `Bridging this costs $${(inUsd - outUsd).toFixed(2)}; deposit at least $${minimumUsd.toFixed(2)}`
      return c.json({ code: 'deposit_too_small', detail, minimumUsd }, 409)
    }
    return c.json({ ...quote, costUsd: inUsd - outUsd })
  })

  app.post('/deposits', async (c) => {
    const body = depositRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json({ code: 'bad_request', detail: 'Expected the signed deposit quote' }, 400)
    const { evmUsePermit2: _, ...order } = orderFor(body.data)
    const { quoteId, bridgeQuoteId, userSignature, evmOrderTypedData } = body.data
    const { evmPermitTypedData, evmPermitSignature } = body.data
    const { orderId } = await flash.submitOrder({
      ...order,
      quoteId,
      bridgeQuoteId,
      userSignature,
      evmOrderTypedData,
      evmPermitTypedData,
      evmPermitSignature,
    })
    return c.json({ orderId }, 201)
  })

  app.get('/deposits/:orderId', async (c) => {
    const wallet = c.req.query('wallet')
    if (!wallet || !isAddress(wallet))
      return c.json({ code: 'bad_request', detail: 'Expected ?wallet=' }, 400)
    const { order } = await flash.getOrder(c.req.param('orderId'), wallet)
    const { orderId } = order
    if (order.status === 'ORDER_STATUS_FILLED') {
      const seconds = (Date.parse(order.closedAt ?? '') - Date.parse(order.placedAt)) / 1000
      const log = seconds > 60 ? console.warn : console.info
      log('deposit arrived', orderId, { from: order.contraAsset.chain.name, seconds })
      return c.json({ status: 'arrived', orderId, usdc: order.filled?.targetAmount ?? '0' })
    }
    if (ended.includes(order.status))
      return c.json({ status: 'failed', orderId, reason: order.closeReason ?? order.status })
    return c.json({ status: 'pending', orderId })
  })

  return app
}
