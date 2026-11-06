// Tradeable markets on our chain: prices from Definitive Flash, candles from the coin's
// deepest pool (GeckoTerminal) until Flash has a candle feed.

import { hasPool } from '@supercall/chains'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { isTimeframe } from './market-data/geckoterminal'
import type { createMarkets } from './market-data/markets'

export function marketRoutes(markets: ReturnType<typeof createMarkets>) {
  const app = new Hono()

  // Only coins a pool on Arc can judge: publish refuses the rest, and Flash lists lookalikes.
  app.get('/', async (c) => {
    try {
      const judgeable = (await markets.list()).filter((m) => hasPool(m.address))
      return c.json({ markets: judgeable, updatedAt: new Date().toISOString() })
    } catch {
      return c.json({ code: 'flash_unavailable', detail: 'Couldn’t reach Definitive Flash' }, 502)
    }
  })

  // Live prices for one coin as Server-Sent Events, relayed from Flash's quote stream.
  app.get('/:address/stream', (c) => {
    const address = c.req.param('address')
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return c.json({ code: 'bad_address', detail: 'Expected a token address' }, 400)
    }
    return streamSSE(c, async (stream) => {
      // Start from the last known price so the client never waits for the first tick.
      const known = (await markets.list().catch(() => [])).find(
        (m) => m.address.toLowerCase() === address.toLowerCase(),
      )
      if (known) {
        await stream.writeSSE({
          event: 'price',
          data: JSON.stringify({ price: known.price, at: Date.now() }),
        })
      }
      const stop = markets.live(address, ({ price, at }) => {
        void stream.writeSSE({ event: 'price', data: JSON.stringify({ price, at }) })
      })
      stream.onAbort(stop)
      // Comments keep proxies from closing a quiet stream.
      while (!stream.aborted) {
        await stream.sleep(15_000)
        if (!stream.aborted) await stream.write(': keep-alive\n\n')
      }
      stop()
    })
  })

  app.get('/:address/trades', async (c) => {
    const address = c.req.param('address')
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return c.json({ code: 'bad_address', detail: 'Expected a token address' }, 400)
    }
    try {
      const trades = await markets.trades(address)
      if (!trades) return c.json({ code: 'unknown_market', detail: 'No pool for this coin' }, 404)
      return c.json({ trades: trades.slice(0, 50) })
    } catch {
      return c.json({ code: 'trades_unavailable', detail: 'Couldn’t load trades' }, 502)
    }
  })

  app.get('/:address/candles', async (c) => {
    const address = c.req.param('address')
    const tf = c.req.query('tf') ?? '1h'
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return c.json({ code: 'bad_address', detail: 'Expected a token address' }, 400)
    }
    if (!isTimeframe(tf))
      return c.json({ code: 'bad_timeframe', detail: 'tf: 15m, 1h, 4h or 1d' }, 400)
    // Paging back: the page of candles before this unix time.
    const before = c.req.query('before')
    if (before !== undefined && !/^\d{9,11}$/.test(before)) {
      return c.json({ code: 'bad_before', detail: 'before: unix seconds' }, 400)
    }
    try {
      const candles = await markets.candles(address, tf, before ? Number(before) : undefined)
      if (!candles) return c.json({ code: 'unknown_market', detail: 'No pool for this coin' }, 404)
      return c.json({ candles })
    } catch {
      return c.json({ code: 'candles_unavailable', detail: 'Couldn’t load candles' }, 502)
    }
  })

  return app
}
