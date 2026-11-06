import Link from 'next/link'
import { pct, price } from '@/lib/format'
import type { Market } from '@/lib/types'
import { cx, Info, TokenIcon } from './ui'

/** The coins calls can be made on, with prices from Definitive Flash. */
export function MarketsRow({ markets }: { markets: Market[] }) {
  return (
    <section aria-label="Markets" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-medium">Tradeable on Arc</h2>
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          Prices from Definitive Flash
          <Info
            label="Where these numbers come from"
            align="right"
            text="Price and liquidity from Definitive Flash. Candles, logo and 24h change from the coin’s deepest pool on Arc. “$1k moves price” is how far a $1,000 buy would push it."
          />
        </span>
      </div>
      {markets.length === 0 ? (
        <p className="surface-card px-4 py-10 text-center text-[13px] text-muted">
          Couldn’t read markets from Flash right now.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {markets.map((m) => {
            const up = (m.change24h ?? 0) >= 0
            return (
              <Link
                key={m.address}
                href={`/markets/${m.symbol.toLowerCase()}`}
                className="surface-card flex items-center gap-3 p-4 transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <TokenIcon symbol={m.symbol} src={m.imageUrl} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{m.symbol}/USDC</span>
                  <span className="block truncate text-[12px] text-muted">
                    {m.name !== m.symbol ? `${m.name} · ` : ''}
                    {m.impact1k === null
                      ? 'impact —'
                      : `$1k moves price ${pct(Math.max(0, m.impact1k), 2).slice(1)}`}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="block text-[15px] font-medium">{price(m.price)}</span>
                  {m.change24h === null ? (
                    <span className="block text-[12px] text-faint">24h —</span>
                  ) : (
                    <span className={cx('block text-[12px]', up ? 'text-good' : 'text-bad')}>
                      {pct(m.change24h, 2)} 24h
                    </span>
                  )}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
