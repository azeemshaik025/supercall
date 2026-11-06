// GeckoTerminal (CoinGecko's on-chain DEX data): which tokens trade on a chain, their logos
// and 24h change, and OHLCV candles from their pools. Free tier, 30 calls a minute, so
// callers cache. Definitive has no candle feed yet (docs/active-questions.md, D5).

const BASE = 'https://api.geckoterminal.com/api/v2'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface PoolToken {
  address: string
  symbol: string
  name: string
  decimals: number
  imageUrl: string | null
  /** The deepest pool the token trades in, and which side of it the token is. */
  pool: string
  side: 'base' | 'quote'
  liquidityUsd: number
  volume24hUsd: number
  /** 24h change as a fraction, from that pool, when the token is its base. */
  change24h: number | null
}

export interface Candle {
  /** Unix seconds, start of the bar. */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** One swap in a pool, as the coin's buyer or seller saw it. */
export interface Trade {
  tx: string
  /** Unix seconds. */
  time: number
  side: 'buy' | 'sell'
  /** The coin's price in USD. */
  price: number
  coin: number
  usd: number
}

export type Timeframe = '15m' | '1h' | '4h' | '1d'
/** One candle's length, in seconds. */
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
}

const TIMEFRAMES: Record<Timeframe, [string, number]> = {
  '15m': ['minute', 15],
  '1h': ['hour', 1],
  '4h': ['hour', 4],
  '1d': ['day', 1],
}

type Json = Record<string, unknown>

export class GeckoTerminal {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    /** Gap between pages, to stay inside the free tier. */
    private readonly pagePauseMs = 2000,
  ) {}

  /** GETs with a timeout; on 429 waits (Retry-After, else 4s, 8s) and tries again. */
  private async get(path: string, attempt = 0): Promise<Json> {
    const res = await this.fetchFn(`${BASE}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 429 && attempt < 2) {
      const after = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 4000 * 2 ** attempt)
      return this.get(path, attempt + 1)
    }
    if (!res.ok) throw new Error(`GeckoTerminal ${res.status} on ${path.split('?')[0]}`)
    return (await res.json()) as Json
  }

  /** Every token in the network's top pools, each with its deepest pool. */
  async tokens(network: string, pages = 3): Promise<PoolToken[]> {
    const byAddress = new Map<string, PoolToken>()
    for (let page = 1; page <= pages; page++) {
      if (page > 1) await sleep(this.pagePauseMs)
      const d = await this.get(
        `/networks/${network}/pools?page=${page}&sort=h24_volume_usd_desc&include=base_token,quote_token`,
      )
      const pools = (d.data ?? []) as Json[]
      const included = new Map(
        ((d.included ?? []) as Json[]).map((t) => [t.id as string, t.attributes as Json]),
      )
      for (const p of pools) {
        const a = p.attributes as Json
        const rel = p.relationships as Record<string, { data: { id: string } }>
        const liquidity = Number(a.reserve_in_usd ?? 0)
        const volume = Number((a.volume_usd as Json | undefined)?.h24 ?? 0)
        const change = Number((a.price_change_percentage as Json | undefined)?.h24)
        for (const side of ['base', 'quote'] as const) {
          const t = included.get(rel[`${side}_token`]?.data.id ?? '')
          if (!t) continue
          const address = String(t.address).toLowerCase()
          const prev = byAddress.get(address)
          // Keep the deepest pool, preferring one where the token is the base (its change).
          const better =
            !prev ||
            (side === 'base' && prev.side === 'quote') ||
            (side === prev.side && liquidity > prev.liquidityUsd)
          const image = typeof t.image_url === 'string' && !t.image_url.includes('missing')
          const token: PoolToken = {
            address,
            symbol: String(t.symbol),
            name: String(t.name),
            decimals: Number(t.decimals),
            imageUrl: image ? (t.image_url as string) : (prev?.imageUrl ?? null),
            pool: better ? String(a.address) : (prev?.pool ?? String(a.address)),
            side: better ? side : (prev?.side ?? side),
            liquidityUsd: (prev?.liquidityUsd ?? 0) + liquidity,
            volume24hUsd: (prev?.volume24hUsd ?? 0) + volume,
            change24h:
              better && side === 'base' && Number.isFinite(change)
                ? change / 100
                : (prev?.change24h ?? null),
          }
          byAddress.set(address, token)
        }
      }
      if (pools.length < 20) break
    }
    return [...byAddress.values()].sort((x, y) => y.liquidityUsd - x.liquidityUsd)
  }

  /**
   * USD candles for one side of a pool, oldest first: the `limit` newest before `before` (unix
   * seconds), or before now. Periods without a trade are missing; see fillGaps.
   */
  async candles(
    network: string,
    pool: string,
    side: 'base' | 'quote',
    tf: Timeframe,
    { limit = 1000, before }: { limit?: number; before?: number } = {},
  ): Promise<Candle[]> {
    const [unit, aggregate] = TIMEFRAMES[tf]
    const page = before ? `&before_timestamp=${before}` : ''
    const d = await this.get(
      `/networks/${network}/pools/${pool}/ohlcv/${unit}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=${side}${page}`,
    )
    const list = (((d.data as Json)?.attributes as Json)?.ohlcv_list ?? []) as number[][]
    return list
      .map(([time = 0, open = 0, high = 0, low = 0, close = 0, volume = 0]) => ({
        time,
        open,
        high,
        low,
        close,
        volume,
      }))
      .sort((x, y) => x.time - y.time)
  }

  /** The pool's latest swaps of `coin`, newest first (GeckoTerminal keeps the last 300). */
  async trades(network: string, pool: string, coin: string): Promise<Trade[]> {
    const d = await this.get(`/networks/${network}/pools/${pool}/trades`)
    const list = (d.data ?? []) as { attributes: Record<string, string> }[]
    return list.flatMap(({ attributes: a }) => {
      if (a.is_anomalous === (true as unknown as string)) return []
      const buy = a.to_token_address?.toLowerCase() === coin
      const amount = Number(buy ? a.to_token_amount : a.from_token_amount)
      const price = Number(buy ? a.price_to_in_usd : a.price_from_in_usd)
      if (!(amount > 0 && price > 0)) return []
      return [
        {
          tx: a.tx_hash ?? '',
          time: Math.floor(Date.parse(a.block_timestamp ?? '') / 1000),
          side: buy ? ('buy' as const) : ('sell' as const),
          price,
          coin: amount,
          usd: Number(a.volume_in_usd ?? 0),
        },
      ]
    })
  }
}

export const isTimeframe = (v: string): v is Timeframe => v in TIMEFRAMES

/**
 * GeckoTerminal leaves out periods without a trade, so a thin pool's chart jumps through time.
 * Each missing period becomes a flat candle at the last close with no volume, up to `until`
 * (unix seconds, exclusive), as an exchange draws a quiet market. At most `max` are added.
 */
export function fillGaps(candles: Candle[], step: number, until: number, max = 2000): Candle[] {
  const out: Candle[] = []
  let added = 0
  for (const [i, c] of candles.entries()) {
    out.push(c)
    const next = candles[i + 1]?.time ?? Math.floor(until / step) * step + step
    for (let t = c.time + step; t < next && t < until && added < max; t += step, added++) {
      out.push({ time: t, open: c.close, high: c.close, low: c.close, close: c.close, volume: 0 })
    }
  }
  return out
}
