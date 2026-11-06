// Markets: every coin on our chain that Flash can trade against USDC. Lives in the API: it's
// product logic over the Flash client (which knows nothing about markets). GeckoTerminal finds
// the coins (and their logos, 24h change and candles); a live Flash quote prices each one
// and proves Flash can route it. Prices and the liquidity check are always Flash's.
import { CHAIN, type ChainConfig } from '@supercall/chains'
import {
  type Chain as FlashChain,
  type FlashClient,
  FlashError,
  type QuoteResponse,
} from '@supercall/flash'
import {
  type Candle,
  fillGaps,
  GeckoTerminal,
  type PoolToken,
  TIMEFRAME_SECONDS,
  type Timeframe,
  type Trade,
} from './geckoterminal'

const BITCOIN_IMAGE = 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png'

export type { Candle, Timeframe }

export interface Market {
  symbol: string
  name: string
  address: string
  decimals: number
  chain: string
  quote: { symbol: 'USDC'; address: string }
  /** Mid price in USD, from a live Flash quote. */
  price: number
  /** Price impact of a $1,000 buy on Flash (the spec's liquidity check is 0.5%). */
  impact1k: number | null
  change24h: number | null
  imageUrl: string | null
  liquidityUsd: number | null
  volume24hUsd: number | null
}

/** Size of the pricing quote, in USDC. Also the size the liquidity check is defined at. */
const PROBE_USDC = '1000'
/** Flash allows 5 requests a second per endpoint; stay under it. */
const QUOTES_PER_SECOND = 4

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Candidate {
  address: string
  symbol: string
  decimals: number
  info?: PoolToken
}

function midPriceFromQuote(q: Pick<QuoteResponse, 'to'>): number | null {
  const amount = Number(q.to.amount)
  const notional = Number(q.to.notional)
  return amount > 0 && notional > 0 ? notional / amount : null
}

export function createMarkets(
  flash: FlashClient,
  opts: {
    chain?: ChainConfig
    gecko?: GeckoTerminal
    // ponytail: no FlashQuoteStream in this repo yet; live() is a noop until it lands.
    /** GeckoTerminal's network id for the chain. */
    network?: string
    priceTtlMs?: number
    discoveryTtlMs?: number
    candleTtlMs?: number
    /** Pause between quote batches; tests set 0. */
    batchPauseMs?: number
    /** The clock, in ms; tests fix it. */
    now?: () => number
  } = {},
) {
  const chain = opts.chain ?? CHAIN
  const flashChain = chain.flashChain as FlashChain
  const gecko = opts.gecko ?? new GeckoTerminal()
  const network = opts.network ?? chain.flashChain
  const priceTtl = opts.priceTtlMs ?? 30_000
  const discoveryTtl = opts.discoveryTtlMs ?? 10 * 60_000
  const candleTtl = opts.candleTtlMs ?? 30_000
  const batchPause = opts.batchPauseMs ?? 1000
  const now = opts.now ?? Date.now
  const usdc = chain.usdc.address.toLowerCase()

  /** The latest price per coin. The API serves this at once; refreshes happen behind it. */
  const snapshot = new Map<string, Market>()
  let lastRefresh = 0
  let refreshing: Promise<void> | null = null
  /** Resolves once any refresh has priced its first batch: what an empty snapshot waits on. */
  const firstBatch = (() => {
    let resolve = () => {}
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { promise, resolve: () => resolve() }
  })()
  /** Coins Flash said it can't route, skipped until this time. */
  const unroutable = new Map<string, number>()
  let discovered: { at: number; tokens: PoolToken[] } | null = null
  const candleCache = new Map<string, { at: number; candles: Candle[] }>()
  const tradeCache = new Map<string, { at: number; trades: Trade[] }>()
  /** Requests for the same candles share one upstream call (the free tier is 30 a minute). */
  const candleInflight = new Map<string, Promise<Candle[]>>()

  let lastAttempt = 0
  async function discover(): Promise<PoolToken[]> {
    if (discovered && Date.now() - discovered.at < discoveryTtl) return discovered.tokens
    // After a failure, wait a minute before asking again: the free tier is per minute.
    if (Date.now() - lastAttempt < 60_000) return discovered?.tokens ?? []
    lastAttempt = Date.now()
    try {
      discovered = { at: Date.now(), tokens: await gecko.tokens(network) }
    } catch (e) {
      // Keep the last list; with none, the configured coins still get priced.
      console.warn('markets: discovery failed:', e instanceof Error ? e.message : e)
    }
    return discovered?.tokens ?? []
  }

  /** Coins to price: everything discovered plus the configured ones, never USDC itself. */
  async function candidates(): Promise<Candidate[]> {
    const list = new Map<string, Candidate>()
    for (const t of await discover()) list.set(t.address, { ...t, info: t })
    for (const t of chain.tradeable) {
      const key = t.address.toLowerCase()
      if (!list.has(key)) list.set(key, { address: key, symbol: t.symbol, decimals: t.decimals })
    }
    list.delete(usdc)
    const now = Date.now()
    // Configured coins first, then the deepest pools: they're priced in the first batch.
    return [...list.values()]
      .filter((c) => (unroutable.get(c.address) ?? 0) < now)
      .sort(
        (x, y) =>
          Number(isConfigured(y.address)) - Number(isConfigured(x.address)) ||
          (y.info?.liquidityUsd ?? 0) - (x.info?.liquidityUsd ?? 0),
      )
  }

  const isConfigured = (address: string) =>
    chain.tradeable.some((t) => t.address.toLowerCase() === address)

  async function price(address: string) {
    const q = await flash.quote({
      targetAsset: address,
      targetChain: flashChain,
      contraAsset: chain.usdc.address,
      contraChain: flashChain,
      side: 'buy',
      qty: PROBE_USDC,
      orderType: 'market',
    })
    return {
      price: midPriceFromQuote(q),
      impact1k: q.estimatedPriceImpact === null ? null : Number(q.estimatedPriceImpact),
    }
  }

  /** Re-prices every coin in rate-limited batches, updating the snapshot as each lands. */
  async function refresh(onFirstBatch: () => void) {
    const coins = await candidates()
    const keep = new Set(coins.map((c) => c.address))
    for (const key of snapshot.keys()) if (!keep.has(key)) snapshot.delete(key)
    for (let i = 0; i < coins.length; i += QUOTES_PER_SECOND) {
      const started = Date.now()
      const batch = coins.slice(i, i + QUOTES_PER_SECOND)
      const priced = await Promise.all(
        batch.map((c) =>
          price(c.address).catch((e: unknown) => {
            // A 4xx (no route, unknown asset) won't change soon; anything else is transient.
            if (e instanceof FlashError && e.status >= 400 && e.status < 500 && e.status !== 429) {
              unroutable.set(c.address, Date.now() + discoveryTtl)
              snapshot.delete(c.address)
            }
            return null
          }),
        ),
      )
      batch.forEach((c, j) => {
        const p = priced[j]
        if (!p?.price) return
        const configured = chain.tradeable.find((t) => t.address.toLowerCase() === c.address)
        snapshot.set(c.address, {
          symbol: configured?.symbol ?? c.symbol,
          name: c.info?.name ?? c.symbol,
          address: configured?.address ?? c.address,
          decimals: c.decimals,
          chain: chain.flashChain,
          quote: { symbol: 'USDC', address: chain.usdc.address },
          price: p.price,
          impact1k: p.impact1k,
          change24h: c.info?.change24h ?? null,
          imageUrl: c.info?.imageUrl ?? null,
          liquidityUsd: c.info?.liquidityUsd ?? null,
          volume24hUsd: c.info?.volume24hUsd ?? null,
        })
      })
      if (i === 0) onFirstBatch()
      const wait = batchPause - (Date.now() - started)
      if (wait > 0 && i + QUOTES_PER_SECOND < coins.length) await sleep(wait)
    }
    onFirstBatch()
  }

  // Flash often lists a coin twice, with an image on one listing only: the other borrows it.
  // BTC has none on Arc at all.
  const sorted = () => {
    const list = [...snapshot.values()]
    const images = new Map<string, string>([['BTC', BITCOIN_IMAGE]])
    for (const m of list) if (m.imageUrl) images.set(m.symbol, m.imageUrl)
    return list
      .map((m) => (m.imageUrl ? m : { ...m, imageUrl: images.get(m.symbol) ?? null }))
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
  }

  return {
    /**
     * Every market Flash can price, from the latest snapshot. A stale snapshot starts a
     * background refresh; only the very first call waits, and only for the first batch.
     */
    async list(): Promise<Market[]> {
      if (!refreshing && Date.now() - lastRefresh > priceTtl) {
        lastRefresh = Date.now()
        refreshing = refresh(() => firstBatch.resolve())
          .catch((e: unknown) =>
            console.warn('markets: refresh failed:', e instanceof Error ? e.message : e),
          )
          .finally(() => {
            firstBatch.resolve()
            refreshing = null
          })
      }
      if (snapshot.size === 0) await firstBatch.promise
      return sorted()
    },

    /**
     * Live mid price for a coin from Flash's quote stream: a call every time Flash re-prices
     * a $1,000 buy. Returns a function that stops listening.
     */
    // ponytail: noop until FlashQuoteStream lands; the SSE route sends nothing.
    live(_address: string, _onPrice: (p: { price: number; at: number }) => void): () => void {
      return () => {}
    },

    /**
     * USD candles for a market from its deepest pool, oldest first, every period present: the
     * newest page, or the page before `before` (unix seconds) as a chart scrolls back. Null for
     * unknown coins.
     */
    /** The coin's latest swaps in its deepest pool, cached for a few seconds. */
    async trades(address: string): Promise<Trade[] | null> {
      const token = (await discover()).find((t) => t.address === address.toLowerCase())
      if (!token) return null
      const hit = tradeCache.get(token.address)
      if (hit && Date.now() - hit.at < 8_000) return hit.trades
      try {
        const trades = await gecko.trades(network, token.pool, token.address)
        tradeCache.set(token.address, { at: Date.now(), trades })
        return trades
      } catch (e) {
        if (hit) return hit.trades
        throw e
      }
    },

    async candles(address: string, tf: Timeframe, before?: number): Promise<Candle[] | null> {
      const token = (await discover()).find((t) => t.address === address.toLowerCase())
      if (!token) return null
      const key = `${token.address}:${tf}:${before ?? 'now'}`
      const hit = candleCache.get(key)
      if (hit && Date.now() - hit.at < candleTtl) return hit.candles
      let request = candleInflight.get(key)
      if (!request) {
        // `until` is exclusive: the newest page runs through the period open right now.
        const until = before ?? Math.floor(now() / 1000) + 1
        request = gecko
          .candles(network, token.pool, token.side, tf, { before })
          .then((raw) => fillGaps(raw, TIMEFRAME_SECONDS[tf], until))
          .then((candles) => {
            candleCache.set(key, { at: Date.now(), candles })
            return candles
          })
          .finally(() => candleInflight.delete(key))
        candleInflight.set(key, request)
      }
      try {
        return await request
      } catch (e) {
        // Rate limited or down: the last good candles beat an empty chart.
        if (hit) return hit.candles
        throw e
      }
    },
  }
}
