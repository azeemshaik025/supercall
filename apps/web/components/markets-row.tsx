import Link from 'next/link'
import { markets } from '@/lib/data'
import { pct, price } from '@/lib/format'
import { cx, TokenIcon } from './ui'

export function MarketsRow() {
  return (
    <section aria-label="Markets" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-medium">Markets on Arc</h2>
        <span className="text-[12px] text-muted">Prices from Definitive Flash</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {markets.map((m) => (
          <Link
            key={m.symbol}
            href={`/markets/${m.symbol.toLowerCase()}`}
            className="surface-card flex flex-col gap-3 p-4 hover:border-line-strong"
          >
            <span className="flex items-center gap-2">
              <TokenIcon symbol={m.symbol} size={24} />
              <span className="text-[14px] font-medium">{m.symbol}/USDC</span>
            </span>
            <span className="flex items-baseline justify-between">
              <span className="text-[16px] font-medium">{price(m.price)}</span>
              <span
                className={cx(
                  'text-[12px] font-medium',
                  m.change24h >= 0 ? 'text-good' : 'text-bad',
                )}
              >
                {pct(m.change24h)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
