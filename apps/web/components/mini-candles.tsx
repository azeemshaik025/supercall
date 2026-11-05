import type { Candle } from '@/lib/types'

/** A small candle strip for tables and cards. Full charts use KLineChart. */
export function MiniCandles({ candles, height = 26, label }: { candles: Candle[]; height?: number; label: string }) {
  const lo = Math.min(...candles.map((c) => c.l))
  const hi = Math.max(...candles.map((c) => c.h))
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  return (
    <span role="img" aria-label={label} className="flex gap-0.5" style={{ height }}>
      {candles.map((c, i) => {
        const up = c.c >= c.o
        const color = up ? 'var(--sc-good)' : 'var(--sc-bad)'
        const b0 = pct(Math.min(c.o, c.c))
        const b1 = pct(Math.max(c.o, c.c))
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: candles are positional
          <span key={i} className="relative h-full flex-1">
            <span className="absolute left-1/2 w-px" style={{ bottom: `${pct(c.l)}%`, height: `${pct(c.h) - pct(c.l)}%`, background: color }} />
            <span className="absolute inset-x-[15%]" style={{ bottom: `${b0}%`, height: `max(1px, ${b1 - b0}%)`, background: color }} />
          </span>
        )
      })}
    </span>
  )
}
