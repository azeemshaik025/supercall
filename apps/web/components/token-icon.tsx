'use client'

// A coin's logo: Flash's image when we have it, else one bundled with the site (by symbol, with
// wrapped coins drawn as their base coin), else the coin's first letter. Never a broken image.
import { useEffect, useState } from 'react'

/** Wrapped and bridged coins use their base coin's logo. */
const SAME_LOGO: Record<string, string> = {
  weth: 'eth',
  cirbtc: 'cbbtc',
  wbtc: 'cbbtc',
  btc: 'cbbtc',
}
const BUNDLED = new Set(['eth', 'cbbtc', 'aero', 'degen', 'virtual'])

export function TokenIcon({
  symbol,
  src,
  size = 32,
}: {
  symbol: string
  /** Flash's logo for the coin (a market's `imageUrl`), when the caller has it. */
  src?: string | null
  size?: number
}) {
  const key = symbol.toLowerCase()
  const bundled = SAME_LOGO[key] ?? key
  const sources = [src, BUNDLED.has(bundled) ? `/tokens/${bundled}.png` : null].filter(
    (s): s is string => Boolean(s),
  )
  const [at, setAt] = useState(0)
  // A new coin starts again from its best logo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the coin changes
  useEffect(() => setAt(0), [symbol, src])
  const url = sources[at]
  if (!url)
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-full bg-surface-3 font-medium text-silver"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      >
        {symbol.replace(/^(w|cir|cb)/i, '')[0]?.toUpperCase() ?? '?'}
      </span>
    )
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full"
      onError={() => setAt((i) => i + 1)}
    />
  )
}
