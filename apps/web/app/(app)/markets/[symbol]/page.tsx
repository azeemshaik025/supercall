import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarketChart } from '@/components/market-chart'
import { cx, SideTag, TokenIcon } from '@/components/ui'
import {
  callerByHandle,
  getCallers,
  getCalls,
  getMarkets,
  marketBySymbol,
  openCallsOn,
  statusLabel,
} from '@/lib/data'
import { pct, price, timeLeft, usdShort } from '@/lib/format'

export default async function MarketPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const [markets, calls, callers] = await Promise.all([getMarkets(), getCalls(), getCallers()])
  const m = marketBySymbol(markets, symbol)
  if (!m) notFound()
  const open = openCallsOn(calls, m.symbol)
  const now = new Date()
  const stats = [
    {
      k: '24h',
      v: pct(m.change24h ?? 0, 2),
      tone: (m.change24h ?? 0) >= 0 ? 'text-good' : 'text-bad',
    },
    {
      k: '$1k buy moves price',
      v: pct(m.impact1k ?? 0, 2).replace('+', ''),
      tone: (m.impact1k ?? 0) > 0.005 ? 'text-warn' : '',
    },
    { k: 'Pool liquidity', v: usdShort(m.liquidityUsd ?? 0) },
  ]
  return (
    <div className="space-y-5">
      <section className="surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-line px-5 py-[18px]">
          <div className="flex items-center gap-3">
            <TokenIcon symbol={m.symbol} src={m.imageUrl} size={40} />
            <span className="flex flex-col gap-0.5">
              <span className="text-[18px] font-medium">
                {m.symbol}
                <span className="text-muted">/USDC</span>
              </span>
              <span className="text-[12px] text-muted">{m.name} · Arc</span>
            </span>
          </div>
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              Price <span className="size-1.5 rounded-full bg-good" />
            </span>
            <span className="text-[16px] font-medium">{price(m.price)}</span>
          </span>
          {stats.map((s) => (
            <span key={s.k} className="flex flex-col gap-1">
              <span className="text-[12px] text-muted">{s.k}</span>
              <span className={cx('text-[16px] font-medium', s.tone)}>{s.v}</span>
            </span>
          ))}
          <Link href="/compose" className="btn-cta ml-auto flex h-10 items-center px-4 text-[13px]">
            Make a call on {m.symbol}
          </Link>
        </div>
        <MarketChart address={m.address} currentPrice={m.price} asset={m.symbol} />
      </section>
      <section className="surface-card">
        <h2 className="px-4 py-3.5 text-[15px] font-medium">Open calls on {m.symbol}</h2>
        {open.length === 0 ? (
          <p className="border-t border-line px-4 py-8 text-center text-[13px] text-muted">
            No open calls on {m.symbol}. Be the first.
          </p>
        ) : (
          open.map((c) => (
            <Link
              key={c.id}
              href={`/c/${c.id}`}
              className="grid grid-cols-[minmax(180px,2fr)_1.4fr_1fr_1fr] items-center gap-3.5 border-t border-line px-4 py-3 text-[13px] hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-2 font-medium">
                  @{c.caller} <SideTag long={c.direction === 'long'} />
                </span>
                <span className="text-[12px] text-muted">
                  SF {callerByHandle(callers, c.caller)?.superFactor ?? 50}
                </span>
              </span>
              <span className="text-silver">
                {price(c.stop)} to {price(c.target)}
              </span>
              <span>{statusLabel[c.status].label}</span>
              <span className="text-muted">{timeLeft(c.expiresAt, now)} left</span>
            </Link>
          ))
        )}
      </section>
    </div>
  )
}
