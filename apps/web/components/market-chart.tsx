'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Candle } from '@/lib/types'
import { CandleChart } from './candle-chart'
import { Segmented } from './ui'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const

export function MarketChart({
  address,
  currentPrice,
  asset,
}: {
  address: string
  currentPrice: number
  asset: string
}) {
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>('1h')
  const [candles, setCandles] = useState<Candle[]>([])
  const p = currentPrice || 1

  useEffect(() => {
    if (!address) return
    let stale = false
    fetch(`${API}/markets/${address}/candles?tf=${tf}`)
      .then((r) => r.json())
      .then((d) => {
        if (stale) return
        const raw = (d.candles ?? []) as {
          time: number
          open: number
          high: number
          low: number
          close: number
          volume: number
        }[]
        setCandles(
          raw.map((c) => ({
            t: c.time * 1000,
            o: c.open,
            h: c.high,
            l: c.low,
            c: c.close,
            v: c.volume,
          })),
        )
      })
      .catch(() => {
        if (!stale) setCandles([])
      })
    return () => {
      stale = true
    }
  }, [address, tf])

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-3.5">
        <span className="text-[12px] text-muted">
          Price from Definitive Flash · candles from the deepest pool on Arc
        </span>
        <Segmented label="Timeframe" options={TIMEFRAMES} value={tf} onChange={setTf} />
      </div>
      <div className="px-5 pt-4 pb-5">
        <CandleChart
          candles={candles}
          height={480}
          precision={p < 1 ? 4 : 2}
          label={`${asset} candles with volume`}
        />
      </div>
    </div>
  )
}
