'use client'

import { useMemo, useState } from 'react'
import { marketCandles, NOW } from '@/lib/data'
import type { Asset } from '@/lib/types'
import { CandleChart } from './candle-chart'
import { Segmented } from './ui'

const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const
const MS = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 } as const

export function MarketChart({ asset }: { asset: Asset }) {
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>('1h')
  const candles = useMemo(() => marketCandles(asset, 90), [asset])
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
          volume
          height={480}
          hourMs={MS[tf]}
          endAt={NOW.getTime()}
          label={`${asset} candles with volume`}
        />
      </div>
    </div>
  )
}
