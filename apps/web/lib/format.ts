const n2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Prices keep enough digits for small coins. */
export function price(v: number): string {
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (v >= 1)
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
  return v.toLocaleString('en-US', { maximumSignificantDigits: 3 })
}

export function usd(v: number): string {
  return `$${n2.format(v)}`
}

export function usdShort(v: number): string {
  const a = Math.abs(v)
  const s =
    a >= 1e6
      ? `$${(a / 1e6).toFixed(1)}M`
      : a >= 1e3
        ? `$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`
        : `$${a.toFixed(0)}`
  return v < 0 ? `−${s}` : s
}

export function signedUsd(v: number): string {
  return `${v >= 0 ? '+' : '−'}${usd(Math.abs(v))}`
}

export function pct(v: number, digits = 1): string {
  return `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(digits)}%`
}

/** "1d 14h" from now until iso, against the fixed demo clock. */
export function timeLeft(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime()
  if (ms <= 0) return 'Ended'
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}

export function ago(iso: string, now: Date): string {
  const m = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
